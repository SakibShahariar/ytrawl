// SPDX-License-Identifier: MIT
// Central state machine: extraction, downloads, queue, history, clipboard.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Model from './model.js';
import {
    StreamProc,
    run,
    fetchToFile,
    openPath,
    makeDir,
    toolVersions,
    removePartialFiles,
} from './ytdlp.js';

const RETRYABLE_ERROR_PATTERN =
    /403|forbidden|access denied|sign in|authentication|auth required|authenticate|unable to download|blocked|geo|bot/i;

const DEFAULT_HISTORY_CAP = 50;

export class YtrawlController {
    constructor({ settings, deps }) {
        this._settings = settings;
        this._deps = deps; // { getClipboardText(), notify(title, body, icon)}
        this.home = GLib.get_home_dir();

        // Input state.
        this.currentUrl = '';
        this.pastedFromClipboard = false;
        this.extracting = false;
        this.mediaInfo = null;
        this.extractedUrl = '';
        this.useWebClient = false;

        // Download state.
        this.downloadMode = 'video';
        this.videoQuality = 'best';
        this.audioFormat = this.s('audio-format') || 'best';
        this.audioLanguage = '';
        this.availableQualities = [];
        this.queue = [];

        // Active job state.
        this.activeJob = null;
        this.activeTitle = '';
        this.activeStatus = ''; // '', preparing, downloading, paused, completed, error, cancelled
        this.activeError = '';
        this.activeOutputPath = '';
        this.activeOutputDir = '';
        this._lastOutputPath = '';
        this.pauseRequested = false;

        this.progress = {
            percentText: '',
            percentValue: 0,
            size: '',
            speed: '',
            eta: '',
        };

        this.errorMessage = '';
        this.rawLog = '';
        this.showRawLog = false;

        this.history = [...this.arr('history')];
        this.tools = null; // { ytDlp, ytDlpOk, ffmpeg, ffmpegOk }

        // Process handles.
        this._infoSub = null;
        this._infoSeq = 0;
        this._downloadProc = null;

        // Thumbnail pipeline.
        this._thumbFile = '';
        this._thumbType = ''; // file | none
        this._thumbSeq = 0;
        this._thumbDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'ytrawl', 'thumbs']);
        this._cleanupStaleThumbFiles();

        this._refresh = null;
    }

    // ---- settings helpers -------------------------------------------------

    s(key) {
        return this._settings.get_string(key);
    }

    b(key) {
        return this._settings.get_boolean(key);
    }

    arr(key) {
        return this._settings.get_strv(key);
    }

    setStr(key, value) {
        if (this.s(key) !== value) this._settings.set_string(key, value);
    }

    setBool(key, value) {
        if (this.b(key) !== value) this._settings.set_boolean(key, value);
    }

    setArr(key, value) {
        this._settings.set_strv(key, value);
    }

    downloadDir() {
        return Model.expandHome(this.s('download-dir') || '~/Downloads', this.home);
    }

    setDownloadDir(v) {
        this.setStr('download-dir', v);
    }

    openSourceUrl() {
        const url = this.mediaInfo && this.mediaInfo.webpage_url
            ? String(this.mediaInfo.webpage_url)
            : String(this.extractedUrl || this.currentUrl || '');
        if (!Model.isSafePublicUrl(url)) return;
        if (this._deps && this._deps.openUrl) this._deps.openUrl(url);
    }

    // Snapshot of every setting yt-dlp arg building reads.
    flatSettings() {
        return {
            downloadDir: this.downloadDir(),
            outputTemplate: this.s('output-template'),
            cookies: this.s('cookies'),
            cookiesFromBrowser: this.s('cookies-from-browser'),
            cookiesProfile: this.s('cookies-profile'),
            proxy: this.s('proxy'),
            rateLimit: this.s('rate-limit'),
            concurrentFragments: this.s('concurrent-fragments'),
            customFormatSelector: this.s('custom-format-selector'),
            customArgs: this.s('custom-args'),
            downloadThumbnail: this.b('download-thumbnail'),
            embedThumbnail: this.b('embed-thumbnail'),
            embedSubs: this.b('embed-subs'),
            includeAutoSubs: this.b('include-auto-subs'),
            preferDrc: this.b('prefer-drc'),
            sponsorBlock: this.b('sponsor-block'),
            sponsorBlockCategories: [...this.arr('sponsor-block-categories')],
            useArchive: this.b('use-archive'),
            audioFormat: this.s('audio-format'),
            subLanguage: this.s('sub-language'),
            writeSubsFile: this.b('write-subs-file'),
            playlistLimit: this.s('playlist-limit') || 'all',
        };
    }

    // ---- notifications ----------------------------------------------------

    _refreshUI() {
        if (this._refresh) this._refresh();
    }

    _notify(title, body, icon) {
        if (this._deps && this._deps.notify) this._deps.notify(title, body, icon);
    }

    // ---- convenience ------------------------------------------------------

    get normalizedUrl() {
        return Model.cleanUrlText(this.currentUrl);
    }

    get isSearchQuery() {
        return Model.isSearchQuery(this.currentUrl);
    }

    get retryableErrorText() {
        return `${this.activeError} ${this.errorMessage}`;
    }

    get canRetryAsWebClient() {
        return this.activeStatus === 'error' && !this.useWebClient &&
            RETRYABLE_ERROR_PATTERN.test(this.retryableErrorText);
    }

    get downloadInProgress() {
        return ['preparing', 'downloading', 'paused'].includes(this.activeStatus);
    }

    get showingDownloadedCard() {
        return this.downloadInProgress && this.activeJob && this.mediaInfo &&
            this.mediaInfo.webpage_url === this.activeJob.url;
    }

    // ---- panel lifecycle --------------------------------------------------

    onPanelOpened() {
        this.detectTools();
        this.errorMessage = '';
        if (this.b('auto-clipboard')) this.readClipboard(false);
    }

    async detectTools(force = false) {
        if (this.tools && !force) return this.tools;
        this.tools = await toolVersions();
        this._refreshUI();
        return this.tools;
    }

    readClipboard(force) {
        if (!this._deps || !this._deps.getClipboardText) return;
        // Save the URL the card was extracted for so the auto-paste doesn't
        // stomp a download in progress with a stale re-paste.
        this._clipForced = !!force;
        this._deps.getClipboardText((text) => {
            if (text === null) return;
            const cleaned = Model.cleanClipboardUrl(text);
            if (cleaned === '') return;
            if (!this._clipForced && this.isKnownUrl(cleaned)) return;
            if (!this._clipForced && this.mediaInfo && cleaned === this.extractedUrl) return;
            this.currentUrl = cleaned;
            this.pastedFromClipboard = true;
            this._refreshUI();
            if (this.b('auto-extract-clipboard')) this.startExtraction();
        });
    }

    // ---- raw log ----------------------------------------------------------

    appendRawLog(data) {
        const line = String(data || '');
        if (!line) return;
        const displayLine = Model.redactSensitiveLogText(line);
        this.rawLog = Model.capLog(this.rawLog + displayLine + '\n');
        if (this.activeJob) {
            // Keep the original diagnostic internally for error classification;
            // only the user-visible raw log is redacted.
            this.activeJob.log = Model.capLog((this.activeJob.log || '') + line + '\n');
        }
        this._refreshUI();
    }

    // ---- history ----------------------------------------------------------

    rememberUrl(url) {
        // Do not retain URLs even in memory while history is disabled: enabling
        // it later must not silently persist downloads from the opt-out period.
        if (!this.b('save-history')) return;
        const u = String(url).trim();
        if (!u || this.history.includes(u)) return;
        const next = [...this.history, u];
        if (next.length > DEFAULT_HISTORY_CAP) next.splice(0, next.length - DEFAULT_HISTORY_CAP);
        this.history = next;
        this.setArr('history', next);
        this._refreshUI();
    }

    isKnownUrl(url) {
        return this.history.includes(String(url).trim());
    }

    removeHistoryItem(url) {
        const u = String(url).trim();
        const next = this.history.filter(h => h !== u);
        if (next.length === this.history.length) return;
        this.history = next;
        this.setArr('history', next);
        this._refreshUI();
    }

    clearHistory() {
        this.history = [];
        this.setArr('history', []);
        this._refreshUI();
    }

    // Removes yt-dlp's --download-archive bookkeeping file so "skip
    // already-downloaded media" forgets everything it has seen. There's no
    // other way for a user to un-skip an accidentally-archived item short
    // of editing a hidden text file by hand.
    clearArchive() {
        const path = Model.archivePath(this.downloadDir());
        try { GLib.unlink(path); } catch (e) { /* already gone, or never existed */ }
        this._notify('Download archive cleared', 'Ytrawl will no longer skip previously-downloaded items.', 'edit-clear-all-symbolic');
        this._refreshUI();
    }

    toggleSaveHistory() {
        const now = !this.b('save-history');
        this.setBool('save-history', now);
        if (!now) this.clearHistory();
        this._refreshUI();
    }

    useHistory(url) {
        this.currentUrl = String(url);
        this.startExtraction();
    }

    // ---- extraction -------------------------------------------------------

    startExtraction() {
        const url = Model.resolveUrl(this.currentUrl);
        if (url === '') {
            this.errorMessage = 'Enter a URL or search query.';
            this._refreshUI();
            return;
        }
        this.extractedUrl = url;
        this.extracting = true;
        this.mediaInfo = null;
        this._discardThumbFile();
        this.errorMessage = '';
        this.rawLog = '';
        this.downloadMode = 'video';
        this.videoQuality = 'best';
        this.audioFormat = this.s('audio-format') || 'best';
        this.audioLanguage = '';
        this.useWebClient = false;
        this._refreshUI();

        const seq = ++this._infoSeq;
        const argv = Model.infoCommand(url, this.flatSettings(), this.useWebClient, this.home);

        run({ argv, maxOutput: 8 * 1024 * 1024, timeoutMs: 120000 }).then(async ({ output, error, exitCode, outputTruncated, timedOut }) => {
            if (seq !== this._infoSeq) return;
            // Any stdout/stderr line that isn't JSON goes to the raw log.
            const stderr = String(error || '');
            if (stderr) this.rawLog = Model.capLog(this.rawLog + stderr + '\n');
            this.extracting = false;
            this._refreshUI();
            if (timedOut || outputTruncated) {
                const err = timedOut
                    ? 'Media information extraction timed out after 2 minutes. Try a single video instead of a playlist or search.'
                    : 'Media information exceeded the 8 MiB limit. Try a single video instead of a playlist or search.';
                this.errorMessage = err;
                if (!this.downloadInProgress) {
                    this.activeStatus = 'error';
                    this.activeError = err;
                }
                this._refreshUI();
                return;
            }
            if (exitCode !== 0) {
                const err = Model.friendlyError(stderr, exitCode, 0);
                this.errorMessage = err;
                if (!this.downloadInProgress && RETRYABLE_ERROR_PATTERN.test(err)) {
                    this.activeStatus = 'error';
                    this.activeError = err;
                }
                this._refreshUI();
                return;
            }
            const info = Model.parseInfo(output);
            if (!info) {
                this.errorMessage = 'Could not parse media information.';
                this._refreshUI();
                return;
            }
            this._applyInfo(info);
        });
    }

    _applyInfo(info) {
        this.mediaInfo = info;
        this.availableQualities = info.isPlaylist
            ? Model.allVideoQualities()
            : Model.availableVideoQualities(info.maxHeight);
        if (!info.hasAudio && this.downloadMode === 'audio') this.downloadMode = 'video';
        if (!this.availableQualities.includes(this.videoQuality)) this.videoQuality = 'best';
        this._refreshUI();
        // Some sites omit the thumbnail — scrape the page's og:image.
        if (info.thumbnail === '' && info.webpage_url && Model.isSafePublicUrl(info.webpage_url)) {
            this._scrapeThumbnail(info.webpage_url);
        } else {
            this._loadThumb(info.thumbnail);
        }
    }

    // Scrape og:image from the page, then load it as the card thumbnail.
    async _scrapeThumbnail(pageUrl) {
        const seq = ++this._thumbSeq;
        try {
            const { output } = await run({
                argv: [
                    'curl', '-sL', '--max-redirs', '3', '--max-time', '15', '--max-filesize', '1048576',
                    '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                    String(pageUrl),
                ],
                maxOutput: 1048576,
            });
            const m = /(?:og:image|og:image:secure_url)"\s+content="([^"]+)"/i.exec(output);
            if (!m || seq !== this._thumbSeq) return;
            let thumb = m[1].replace(/&amp;/g, '&');
            if (!Model.isSafePublicUrl(thumb)) return;
            if (/vimeocdn\.com/.test(thumb)) thumb = thumb.replace(/([?&])f=webp/, '$1f=jpg');
            this._loadThumb(thumb);
        } catch (e) {
            // Quiet: no thumbnail is acceptable.
        }
    }

    // Thumbnails live in a private cache directory, not shared /tmp.
    // Remove leftovers from a previous shell crash/force-quit on startup.
    _cleanupStaleThumbFiles() {
        try {
            GLib.mkdir_with_parents(this._thumbDir, 0o700);
            const dir = Gio.File.new_for_path(this._thumbDir);
            const enumerator = dir.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null,
            );
            try {
                let info;
                while ((info = enumerator.next_file(null)) !== null) {
                    const name = info.get_name();
                    if (name.startsWith('ytrawl-thumb-') && name.endsWith('.img')) {
                        try {
                            GLib.unlink(GLib.build_filenamev([this._thumbDir, name]));
                        } catch (e) {
                            // Best effort: an unreadable or already-removed file is harmless.
                        }
                    }
                }
            } finally {
                enumerator.close(null);
            }
        } catch (e) {
            // Cache may be unavailable; thumbnail fetching will report no image.
        }
    }

    // Discard the currently-held thumbnail temp file, if any.
    _discardThumbFile() {
        if (this._thumbFile) {
            try { GLib.unlink(this._thumbFile); } catch (e) { /* gone */ }
        }
        this._thumbFile = '';
    }

    // Try a URL as the thumbnail; on load failure fall back to hqdefault for
    // YouTube (maxres/sd entries 404 on old videos).
    _loadThumb(url) {
        if (!url || !Model.isSafePublicUrl(url)) {
            this._thumbType = 'none';
            this._refreshUI();
            return;
        }
        const seq = ++this._thumbSeq;
        try {
            GLib.mkdir_with_parents(this._thumbDir, 0o700);
        } catch (e) {
            this._thumbType = 'none';
            this._refreshUI();
            return;
        }
        const tmp = GLib.build_filenamev([
            this._thumbDir,
            `ytrawl-thumb-${GLib.uuid_string_random()}.img`,
        ]);
        fetchToFile(url, tmp).then(({ ok }) => {
            if (seq !== this._thumbSeq || !this.mediaInfo) {
                try { GLib.unlink(tmp); } catch (e) { /* gone */ }
                return;
            }
            if (ok) {
                const prev = this._thumbFile;
                this._thumbFile = tmp;
                this._thumbType = 'file';
                this._refreshUI();
                if (prev && prev !== tmp) {
                    try { GLib.unlink(prev); } catch (e) { /* gone */ }
                }
                return;
            }
            try { GLib.unlink(tmp); } catch (e) { /* gone */ }
            const m = /i\.ytimg\.com\/vi\/([A-Za-z0-9_-]+)\//.exec(this.mediaInfo.thumbnail);
            if (m) {
                this._loadThumb('https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg');
            } else {
                this._thumbType = 'none';
                this._refreshUI();
            }
        });
    }

    // ---- jobs -------------------------------------------------------------

    makeJob() {
        return {
            url: this.mediaInfo && this.mediaInfo.webpage_url
                ? String(this.mediaInfo.webpage_url)
                : Model.cleanUrlText(this.currentUrl),
            title: this.mediaInfo ? this.mediaInfo.title : '',
            mode: this.downloadMode,
            quality: this.videoQuality,
            audioFormat: this.audioFormat,
            audioLanguage: this.audioLanguage,
            info: this.mediaInfo,
        };
    }

    startDownload() {
        if (!this.mediaInfo && !Model.looksLikeUrl(this.currentUrl)) {
            this.errorMessage = 'Enter a URL first.';
            this._refreshUI();
            return;
        }
        if (this.activeStatus === 'downloading' || this.activeStatus === 'paused') {
            this.queue.push(this.makeJob());
            this.resetInput();
            this._refreshUI();
            return;
        }
        this.startJob(this.makeJob());
    }

    enqueueCurrent() {
        if (!this.mediaInfo) return;
        this.queue.push(this.makeJob());
        this.resetInput();
        this._refreshUI();
    }

    removeQueued(index) {
        if (index >= 0 && index < this.queue.length) {
            this.queue.splice(index, 1);
            this._refreshUI();
        }
    }

    startJob(job) {
        this.activeJob = job;
        this.activeTitle = job.title || 'Downloading';
        this.activeStatus = 'preparing';
        this.progress = { percentText: '', percentValue: 0, size: '', speed: '', eta: '' };
        this.activeError = '';
        this.activeOutputPath = '';
        this.activeOutputDir = '';
        this._lastOutputPath = '';
        this.pauseRequested = false;
        this._refreshUI();

        const directoryError = Model.validateDownloadDirectory(this.s('download-dir'), this.home);
        if (directoryError) {
            this.activeStatus = 'error';
            this.activeError = directoryError;
            this.errorMessage = directoryError;
            this._notify(this.activeTitle || 'Download failed', directoryError, 'dialog-error-symbolic');
            this._refreshUI();
            return;
        }

        makeDir(this.downloadDir()).then(({ exitCode }) => {
            if (exitCode !== 0) {
                this.activeStatus = 'error';
                this.activeError = 'Could not create download directory.';
                this._notify(this.activeTitle || 'Download failed', this.activeError, 'dialog-error-symbolic');
                this._refreshUI();
                return;
            }
            this.beginDownload();
        });
    }

    beginDownload() {
        if (!this.activeJob) return;
        let argv;
        try {
            argv = Model.buildDownloadArgs(this.activeJob, this.flatSettings(), this.useWebClient, this.home);
        } catch (e) {
            this.activeStatus = 'error';
            this.activeError = e.message || 'Invalid download arguments.';
            this._notify(this.activeTitle || 'Download failed', this.activeError, 'dialog-error-symbolic');
            this._refreshUI();
            return;
        }
        const proc = new StreamProc(argv);
        this._downloadProc = proc;
        this.activeStatus = 'downloading';
        this._refreshUI();

        proc.onLine((line) => {
            const trimmed = String(line).trim();
            // yt-dlp --print after_move:filepath: the real output path.
            if (trimmed.startsWith('/') || /^\//.test(trimmed)) {
                this._lastOutputPath = trimmed;
                return;
            }
            const p = Model.parseProgressLine(trimmed);
            if (p) {
                this.progress.percentText = p.percentText;
                this.progress.percentValue = p.percent;
                this.progress.size = p.sizeText;
                this.progress.speed = p.speed;
                this.progress.eta = p.eta;
            } else {
                this.appendRawLog(trimmed);
            }
        });

        proc.onExit((exitCode, exitStatus) => {
            this._downloadProc = null;
            this._handleDownloadFinished(exitCode, exitStatus);
        });
    }

    _handleDownloadFinished(exitCode, exitStatus) {
        const job = this.activeJob;
        if (!job) return;

        if (this.pauseRequested && exitStatus !== 0) {
            this.pauseRequested = false;
            this.activeStatus = 'paused';
            this._refreshUI();
            return;
        }
        this.pauseRequested = false;

        if (exitCode !== 0 || exitStatus !== 0) {
            if (exitStatus !== 0) {
                this.activeStatus = 'cancelled';
                // We only get here for a genuine cancel — a pause is
                // already handled by the early return above, which is why
                // it's safe to always clean up here rather than leaving a
                // .part file behind in the download directory.
                {
                    const titlePrefix = Model.sanitizeTitleForFilename(job.info && job.info.title);
                    removePartialFiles(this.downloadDir(), titlePrefix);
                }
            } else {
                this.activeStatus = 'error';
                this.activeError = Model.friendlyError(job.log || '', exitCode, exitStatus);
                this.errorMessage = this.activeError;
                this._notify(this.activeTitle || 'Download failed', this.activeError, 'dialog-error-symbolic');
            }
            this._refreshUI();
        } else {
            this.activeStatus = 'completed';
            const knewRealPath = this._lastOutputPath !== '' && this._lastOutputPath.startsWith('/');
            const safeRealPath = knewRealPath && Model.isPathWithinDirectory(
                this._lastOutputPath, this.downloadDir());
            this.activeOutputPath = knewRealPath
                ? this._lastOutputPath
                : Model.guessOutputPath(this.flatSettings(), job, job.info, this.home);
            this.activeOutputDir = this.downloadDir();
            this.progress.percentText = '100%';
            this.progress.percentValue = 100;
            this.progress.speed = '';
            this.progress.eta = '';
            this.rememberUrl(job.url);

            const action = this.s('post-download-action');
            if (action === 'copy') {
                const pathToCopy = this.activeOutputPath || this.activeOutputDir;
                if (pathToCopy && this._deps && this._deps.copyToClipboard) {
                    this._deps.copyToClipboard(pathToCopy);
                    if (!this.activeOutputPath) {
                        this._notify(this.activeTitle || 'Download complete',
                            'The exact file path is unknown; copied the download folder instead.',
                            'dialog-information-symbolic');
                    }
                }
            } else if (action === 'open' && this.activeOutputDir !== '') {
                openPath(this.activeOutputDir);
            } else if (action === 'openFile') {
                if (safeRealPath) {
                    openPath(this._lastOutputPath);
                } else if (knewRealPath) {
                    this._notify(this.activeTitle || 'Download complete',
                        'Refusing to open a file outside the configured download directory.',
                        'dialog-warning-symbolic');
                } else {
                    // We asked for "open file" but never got a real path
                    // from yt-dlp — say so instead of silently opening the
                    // folder as if that's what was requested.
                    this._notify(this.activeTitle || 'Download complete',
                        "Couldn't determine the exact file — opening the download folder instead.",
                        'dialog-information-symbolic');
                    openPath(this.activeOutputDir);
                }
            }
            this._notify(this.activeTitle || 'Download complete', 'Saved to ' + (this.s('download-dir') || this.downloadDir()), 'emblem-downloads-symbolic');
            if (this.b('clear-input-after-download')) this.resetInput();
            this._refreshUI();
        }

        this.activeJob = null;
        this._processQueue();
    }

    _processQueue() {
        if (this.downloadInProgress || this.queue.length === 0) return;
        if (this.activeStatus === 'error' && this.b('stop-on-queue-error')) return;
        const next = this.queue.shift();
        this.startJob(next);
    }

    runQueue() {
        if (this.downloadInProgress || this.queue.length === 0) return;
        // An explicit user action overrides the stop-on-error pause.
        if (this.activeStatus === 'error') this.activeStatus = '';
        this._processQueue();
    }

    cancelActive() {
        if (this._downloadProc) {
            this._downloadProc.kill();
            this._downloadProc = null;
        }
    }

    pauseActive() {
        this.pauseRequested = true;
        if (this._downloadProc) {
            this._downloadProc.kill();
            this._downloadProc = null;
        }
    }

    resumeActive() {
        if (this.activeJob) this.startJob(this.activeJob);
    }

    clearActive() {
        this.activeStatus = '';
        this.activeTitle = '';
        this.activeJob = null;
        this.activeError = '';
        this.progress = { percentText: '', percentValue: 0, size: '', speed: '', eta: '' };
        this.activeOutputPath = '';
        this.activeOutputDir = '';
        this._lastOutputPath = '';
        this._refreshUI();
    }

    retryWithWebClient() {
        this.useWebClient = true;
        this.errorMessage = '';
        this.activeError = '';
        this._refreshUI();
        if (this.mediaInfo) this.startDownload();
        else this.startExtraction();
    }

    resetInput() {
        this.currentUrl = '';
        this.pastedFromClipboard = false;
        this.extractedUrl = '';
        this.mediaInfo = null;
        this._discardThumbFile();
        this._thumbType = 'none';
        this.downloadMode = 'video';
        this.videoQuality = 'best';
        this.audioFormat = this.s('audio-format') || 'best';
        this.audioLanguage = '';
        this.errorMessage = '';
        this._refreshUI();
    }

    // Mode/quality/format selection helpers.

    setDownloadMode(mode) {
        if (this.downloadMode === mode) return;
        this.downloadMode = mode;
        this._refreshUI();
    }

    setVideoQuality(q) {
        this.videoQuality = String(q);
        this._refreshUI();
    }

    setAudioFormat(f) {
        this.audioFormat = String(f);
        this._refreshUI();
    }

    setAudioLanguage(lang) {
        this.audioLanguage = String(lang || '');
        this._refreshUI();
    }

    toggleSponsorCategory(cat, on) {
        const cur = [...this.arr('sponsor-block-categories')];
        const i = cur.indexOf(cat);
        if (on && i < 0) cur.push(cat);
        if (!on && i >= 0) cur.splice(i, 1);
        this.setArr('sponsor-block-categories', cur);
        this._refreshUI();
    }

    // Cleanup on disable.
    destroy() {
        if (this._downloadProc) {
            try { this._downloadProc.kill(); } catch (e) { /* gone */ }
            this._downloadProc = null;
        }
        if (this._infoSub) {
            try { this._infoSub.kill(); } catch (e) { /* gone */ }
            this._infoSub = null;
        }
        this._discardThumbFile();
    }
}