// SPDX-License-Identifier: MIT
// The top-bar popup panel. Renders controller state into St widgets.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Model from './model.js';
import * as UI from './ui.js';

const PANEL_WIDTH = 400;
const PANEL_MAX_HEIGHT = 640;

function setPill(btn, selected) {
    if (selected) btn.add_style_pseudo_class('checked');
    else btn.remove_style_pseudo_class('checked');
}

// Converts a numeric height to display text used by quality buttons.
function qualityLabel(controller, q) {
    const base = q === 'best' ? 'Best' : q + 'p';
    const h = q === 'best' ? (controller.mediaInfo ? controller.mediaInfo.maxHeight : 0) : Number(q);
    const size = Model.formatSize(Model.estimateQualitySize(controller.mediaInfo, h));
    return size ? `${base} · ${size}` : base;
}

export class YtrawlPanel {
    constructor(controller, { menu, onClose }) {
        this.c = controller;
        this._menu = menu;
        this._onClose = onClose;

        this.actor = this._buildRoot();
        this.entry = this._urlEntry;
        this._closeDropdowns();

        controller._refresh = () => this.render();
        this.render();
    }

    _buildRoot() {
        const root = UI.stWidget(St.BoxLayout, {
            vertical: true,
            width: PANEL_WIDTH,
            style_class: 'ytrawl-panel',
        });

        this._scroll = UI.stWidget(St.ScrollView, {
            x_expand: true,
            y_expand: true,
            style_class: 'ytrawl-scroll',
        });
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

        const content = UI.stWidget(St.BoxLayout, {
            vertical: true,
            style_class: 'ytrawl-content',
            width: PANEL_WIDTH - 24,
            y_align: Clutter.ActorAlign.START,
        });

        this._content = content;
        this._scroll.add_child(content);
        root.add_child(this._scroll);

        this._buildSections(content);

        // Key handling on the root: catches Ctrl+ shortcuts even while a
        // button or switch holds keyboard focus.
        UI.connectSafe(root, 'key-press-event', (actor, event) => this._onRootKey(actor, event));

        return root;
    }

    _buildSections(main) {
        const add = (w) => main.add_child(w);

        // ---- error banner -------------------------------------------------
        const errRow = UI.row({ vertical: false, styleClass: 'ytrawl-error' });
        const errText = UI.label('', 'ytrawl-error-text');
        const errClose = UI.iconButton({
            icon: 'window-close-symbolic',
            tooltip: 'Dismiss',
            onActivate: () => {
                this.c.errorMessage = '';
                this.c._refreshUI();
            },
        });
        const errSpacer = new St.Widget()
        errRow.add_child(errText);
        errRow.add_child(errSpacer);
        errRow.add_child(errClose);
        add(errRow);
        this._errRow = errRow;
        this._errText = errText;

        // ---- missing-tool banner -------------------------------------------
        // Surfaces controller.tools (populated by detectTools() on every
        // panel open) instead of letting the user discover a missing
        // yt-dlp/ffmpeg only after an extraction/download attempt fails.
        const toolsRow = UI.row({ vertical: false, styleClass: 'ytrawl-error' });
        const toolsText = UI.label('', 'ytrawl-error-text');
        toolsRow.add_child(toolsText);
        add(toolsRow);
        toolsRow.visible = false;
        this._toolsRow = toolsRow;
        this._toolsText = toolsText;

        // ---- URL entry ----------------------------------------------------
        const urlRow = UI.row({ vertical: false });
        this._urlEntry = UI.entry({
            placeholder: 'Paste a URL or search…',
            text: this.c.currentUrl,
            onActivate: () => this._onEnter(),
            onChanged: (text) => {
                this.c.currentUrl = text;
                this.c.pastedFromClipboard = false;
                // Drop the stale media card once the text diverges.
                if (this.c.mediaInfo &&
                    Model.cleanUrlText(text) !== this.c.extractedUrl) {
                    this.c.mediaInfo = null;
                }
                this._maybeAutoExtract(text);
            },
            onCaptureKey: (actor, event) => this._onUrlKey(actor, event),
        });
        this._urlEntry.style = 'flex-grow: 1;';
        const pasteBtn = UI.iconButton({
            icon: 'edit-paste-symbolic',
            tooltip: 'Paste from clipboard',
            onActivate: () => {
                this.c.readClipboard(true);
                this._focusUrl();
            },
        });
        const clearBtn = UI.iconButton({
            icon: 'edit-clear-all-symbolic',
            tooltip: 'Clear input',
            onActivate: () => {
                this.c.resetInput();
                this._focusUrl();
            },
        });
        const goBtn = UI.iconButton({
            icon: 'media-playback-start-symbolic',
            tooltip: 'Extract / download',
            onActivate: () => this._onEnter(),
        });
        urlRow.add_child(this._urlEntry);
        urlRow.add_child(pasteBtn);
        urlRow.add_child(goBtn);
        urlRow.add_child(clearBtn);
        add(urlRow);
        this._clearBtn = clearBtn;
        this._goBtn = goBtn;

        // ---- hint / extracting -------------------------------------------
        this._hint = UI.label('', 'ytrawl-hint');
        this._hint.clutter_text.ellipsize = 2;
        add(this._hint);

        this._extractingLabel = UI.label('Extracting media information…', 'ytrawl-extracting');
        add(this._extractingLabel);
        this._extractingLabel.visible = false;

        // ---- media card ---------------------------------------------------
        const card = UI.stWidget(St.BoxLayout, { style_class: 'ytrawl-card', x_expand: true });
        const thumbBox = UI.stWidget(St.Widget, { style_class: 'ytrawl-thumb-box' });
        this._thumb = UI.stWidget(St.Icon, {
            style_class: 'ytrawl-thumb',
            icon_size: 96,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        thumbBox.add_child(this._thumb);
        const infoCol = UI.row({ vertical: true });
        this._durationBadge = UI.label('', 'ytrawl-duration');
        this._durationBadge.visible = false;
        this._title = UI.label('', 'ytrawl-title');
        this._uploader = UI.label('', 'ytrawl-uploader');
        infoCol.add_child(this._durationBadge);
        infoCol.add_child(this._title);
        infoCol.add_child(this._uploader);
        card.add_child(thumbBox);
        card.add_child(infoCol);
        try { card.width = PANEL_WIDTH - 24; } catch (e) { /* ignore */ }
        card.style = 'margin-top: 4px;';
        add(card);
        this._card = card;
        this._thumbSeq = 0;

        // ---- mode section -------------------------------------------------
        this._modeAcc = UI.accordion({
            titleText: 'Mode',
            content: this._buildModeBody(),
        });
        add(this._modeAcc.actor);
        this._modeAcc.actor.visible = false;

        // ---- playlist pill -------------------------------------------------
        const plRow = UI.row({ vertical: false, styleClass: 'ytrawl-playlist' });
        const plLabel = UI.label('Playlist', 'ytrawl-toggle-label');
        this._playlistValue = UI.caption('');
        const plSpacer = new St.Widget()
        plRow.add_child(plLabel);
        plRow.add_child(plSpacer);
        plRow.add_child(this._playlistValue);
        add(plRow);
        this._playlistRow = plRow;
        this._playlistRow.visible = false;

        // ---- subtitles -----------------------------------------------------
        this._subsAcc = UI.accordion({
            titleText: 'Subtitles',
            content: this._buildSubsBody(),
        });
        add(this._subsAcc.actor);
        this._subsAcc.actor.visible = false;

        // ---- thumbnail ----------------------------------------------------
        this._thumbAcc = UI.accordion({
            titleText: 'Thumbnail',
            content: this._buildThumbBody(),
        });
        add(this._thumbAcc.actor);
        this._thumbAcc.actor.visible = false;

        // ---- DRC -----------------------------------------------------------
        this._drcToggle = UI.toggleRow({
            labelText: 'Prefer DRC audio',
            desc: 'YouTube “Stable Volume” for consistent loudness',
            onToggled: (on) => this.c.setBool('prefer-drc', on),
        });
        add(this._drcToggle.actor);
        this._drcToggle.actor.visible = false;

        // ---- SponsorBlock --------------------------------------------------
        this._sponAcc = UI.accordion({
            titleText: 'SponsorBlock',
            content: this._buildSponsorBody(),
        });
        add(this._sponAcc.actor);
        this._sponAcc.actor.visible = false;

        // ---- after download ------------------------------------------------
        this._afterAcc = UI.accordion({
            titleText: 'After download',
            content: this._buildAfterBody(),
        });
        add(this._afterAcc.actor);

        // ---- history -------------------------------------------------------
        this._histAcc = UI.accordion({
            titleText: 'History',
            content: this._buildHistoryBody(),
        });
        add(this._histAcc.actor);

        // ---- advanced ------------------------------------------------------
        this._advAcc = UI.accordion({
            titleText: 'Advanced',
            defaultOpen: this.c.b('advanced-visible'),
            content: this._buildAdvancedBody(),
            onToggleOpen: (open) => this.c.setBool('advanced-visible', open),
        });
        add(this._advAcc.actor);

        // ---- raw log -------------------------------------------------------
        this._rawLogBox = UI.stWidget(St.ScrollView, {
            style_class: 'ytrawl-rawlog',
            x_expand: true,
        });
        this._rawLogLabel = UI.label('', 'ytrawl-rawlog-text');
        this._rawLogBox.add_child(this._rawLogLabel);
        this._rawLogBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._rawLogBox.visible = false;
        add(this._rawLogBox);

        // ---- active download card -----------------------------------------
        add(this._buildActiveCard());

        // ---- queue ---------------------------------------------------------
        const queueWrap = UI.row({ vertical: true, styleClass: 'ytrawl-queue' });
        const queueTitle = UI.sectionTitle('QUEUE');
        queueWrap.add_child(queueTitle);
        this._queueList = UI.row({ vertical: true });
        queueWrap.add_child(this._queueList);
        add(queueWrap);
        this._queueWrap = queueWrap;
        this._queueWrap.visible = false;

        // ---- download dir --------------------------------------------------
        this._dirField = UI.entry({
            placeholder: '~/Downloads',
            text: this.c.s('download-dir'),
            onChanged: (text) => this.c.setDownloadDir(text),
        });
        this._dirField.visible = false;
        add(this._dirField);

        // ---- extract / run queue ------------------------------------------
        this._extractBtn = UI.primaryButton({
            label: 'Extract',
            onActivate: () => this.c.startExtraction(),
        });
        this._extractBtn.visible = false;
        add(this._extractBtn);

        this._runQueueBtn = UI.ghostButton({
            label: 'Run queue',
            onActivate: () => this.c.runQueue(),
        });
        this._runQueueBtn.visible = false;
        add(this._runQueueBtn);

        // ---- footer: download + queue --------------------------------------
        const footer = UI.row({ vertical: false });
        this._downloadBtn = UI.primaryButton({
            label: 'Download',
            onActivate: () => this.c.startDownload(),
        });
        this._downloadBtn.style = 'flex-grow: 1;';
        this._queueBtn = UI.ghostButton({
            label: 'Queue',
            onActivate: () => this.c.enqueueCurrent(),
        });
        footer.add_child(this._downloadBtn);
        footer.add_child(this._queueBtn);
        add(footer);
        this._footer = footer;
        this._footer.visible = false;
    }

    // ---- sub-builders ------------------------------------------------------

    _buildModeBody() {
        const body = UI.row({ vertical: true });

        const modeRow = UI.row({ vertical: false });
        this._modeButtons = {};
        for (const m of ['video', 'audio', 'custom']) {
            const btn = UI.pillButton({
                label: Model.modeLabel(m),
                onActivate: () => this.c.setDownloadMode(m),
            });
            this._modeButtons[m] = btn;
            modeRow.add_child(btn);
        }
        body.add_child(modeRow);

        // Quality (video mode) — dropdown so Best + all heights never overflow.
        this._qualitySection = UI.row({ vertical: true });
        body.add_child(this._qualitySection);
        this._qualitySection.visible = false;
        this._qualityDropdown = UI.dropdown({
            onChanged: (v) => this.c.setVideoQuality(v),
        });
        this._qualitySection.add_child(this._qualityDropdown.actor);

        // Audio mode
        this._audioSection = UI.row({ vertical: true });
        body.add_child(this._audioSection);
        this._audioSection.visible = false;

        const addr = UI.sectionTitle('AUDIO FORMAT');
        this._audioSection.add_child(addr);
        const fmtRow = UI.row({ vertical: false });
        this._fmtButtons = {};
        for (const f of Model.AUDIO_FORMATS) {
            const btn = UI.pillButton({
                label: f === 'best' ? 'Best' : f.toUpperCase(),
                onActivate: () => this.c.setAudioFormat(f),
            });
            this._fmtButtons[f] = btn;
            fmtRow.add_child(btn);
        }
        this._audioSection.add_child(fmtRow);

        this._trackHeader = UI.sectionTitle('TRACK');
        this._audioSection.add_child(this._trackHeader);
        this._trackDropdown = UI.dropdown({
            onChanged: (v) => this.c.setAudioLanguage(v),
        });
        this._audioSection.add_child(this._trackDropdown.actor);

        // Custom mode
        this._customField = UI.entry({
            placeholder: 'yt-dlp format selector (e.g. bestvideo[height<=1080]+bestaudio)',
            text: this.c.s('custom-format-selector'),
            onChanged: (text) => this.c.setStr('custom-format-selector', text),
        });
        this._customField.style = 'flex-grow: 1;';
        this._customField.visible = false;
        body.add_child(this._customField);

        return body;
    }

    _buildSubsBody() {
        const body = UI.row({ vertical: true });
        this._subsEmbed = UI.toggleRow({
            labelText: 'Embed subtitles into video',
            onToggled: (on) => this.c.setBool('embed-subs', on),
        });
        body.add_child(this._subsEmbed.actor);
        this._subsWriteFile = UI.toggleRow({
            labelText: 'Save subtitle file',
            desc: 'Writes subtitles as a separate .srt/.vtt file, independent of embedding',
            onToggled: (on) => this.c.setBool('write-subs-file', on),
        });
        body.add_child(this._subsWriteFile.actor);
        this._subsAuto = UI.toggleRow({
            labelText: 'Include auto-generated captions',
            onToggled: (on) => this.c.setBool('include-auto-subs', on),
        });
        body.add_child(this._subsAuto.actor);
        const langHeader = UI.sectionTitle('LANGUAGE');
        this._subsLangText = langHeader;
        body.add_child(langHeader);
        this._subsDropdown = UI.dropdown({
            onChanged: (v) => this.c.setStr('sub-language', v),
        });
        body.add_child(this._subsDropdown.actor);
        return body;
    }

    _buildThumbBody() {
        const body = UI.row({ vertical: true });
        this._thumbSave = UI.toggleRow({
            labelText: 'Save thumbnail image',
            desc: 'JPG saved next to the download',
            onToggled: (on) => this.c.setBool('download-thumbnail', on),
        });
        body.add_child(this._thumbSave.actor);
        this._thumbEmbed = UI.toggleRow({
            labelText: 'Embed thumbnail into file metadata',
            onToggled: (on) => this.c.setBool('embed-thumbnail', on),
        });
        body.add_child(this._thumbEmbed.actor);
        return body;
    }

    _buildSponsorBody() {
        const body = UI.row({ vertical: true });
        this._sponToggle = UI.toggleRow({
            labelText: 'Skip sponsor segments',
            desc: 'Via SponsorBlock community data',
            onToggled: (on) => this.c.setBool('sponsor-block', on),
        });
        body.add_child(this._sponToggle.actor);
        const segHeader = UI.sectionTitle('SEGMENTS TO REMOVE');
        body.add_child(segHeader);
        this._sponFlow = UI.row({ vertical: true });
        this._sponCats = {};
        for (const cat of Model.SPONSOR_CATEGORIES) {
            const t = UI.toggleRow({
                labelText: Model.sponsorCategoryLabel(cat),
                onToggled: (on) => this.c.toggleSponsorCategory(cat, on),
            });
            this._sponCats[cat] = t;
            this._sponFlow.add_child(t.actor);
        }
        body.add_child(this._sponFlow);
        return body;
    }

    _buildAfterBody() {
        const body = UI.row({ vertical: true });
        this._afterRow = UI.row({ vertical: false });
        this._afterButtons = {};
        for (const act of Model.POST_DOWNLOAD_ACTIONS) {
            const btn = UI.pillButton({
                label: act.label,
                onActivate: () => this.c.setStr('post-download-action', act.value),
            });
            this._afterButtons[act.value] = btn;
            this._afterRow.add_child(btn);
        }
        body.add_child(this._afterRow);
        return body;
    }

    _buildHistoryBody() {
        const body = UI.row({ vertical: true });
        this._histSave = UI.toggleRow({
            labelText: 'Save download history',
            onToggled: () => this.c.toggleSaveHistory(),
        });
        body.add_child(this._histSave.actor);
        this._histClear = UI.ghostButton({
            label: 'Clear history',
            onActivate: () => this.c.clearHistory(),
        });
        body.add_child(this._histClear);
        this._histList = UI.row({ vertical: true });
        body.add_child(this._histList);
        return body;
    }

    _buildAdvancedBody() {
        const body = UI.row({ vertical: true });
        const add = (w) => body.add_child(w);

        this._rawLogToggle = UI.toggleRow({
            labelText: 'Show raw log',
            onToggled: (on) => {
                this.c.showRawLog = on;
                this.c._refreshUI();
            },
        });
        add(this._rawLogToggle.actor);

        const clip = UI.toggleRow({
            labelText: 'Read URL from clipboard on open',
            onToggled: (on) => this.c.setBool('auto-clipboard', on),
        });
        add(clip.actor);
        this._autoClip = clip;

        const autoExtract = UI.toggleRow({
            labelText: 'Extract pasted URL automatically',
            onToggled: (on) => this.c.setBool('auto-extract-clipboard', on),
        });
        add(autoExtract.actor);
        this._autoExtract = autoExtract;

        const clearAfter = UI.toggleRow({
            labelText: 'Clear input after download',
            onToggled: (on) => this.c.setBool('clear-input-after-download', on),
        });
        add(clearAfter.actor);
        this._clearAfter = clearAfter;

        const archive = UI.toggleRow({
            labelText: 'Skip already-downloaded media',
            desc: 'yt-dlp download archive in your download folder',
            onToggled: (on) => this.c.setBool('use-archive', on),
        });
        add(archive.actor);
        this._archive = archive;

        const clearArchiveBtn = UI.ghostButton({
            label: 'Clear download archive',
            onActivate: () => this.c.clearArchive(),
        });
        add(clearArchiveBtn);

        const reduceMotion = UI.toggleRow({
            labelText: 'Reduce motion',
            desc: 'Turns off the pulsing busy/extracting animation',
            onToggled: (on) => this.c.setBool('reduce-motion', on),
        });
        add(reduceMotion.actor);
        this._reduceMotion = reduceMotion;

        add(UI.sectionTitle('OUTPUT'));
        this._templateField = UI.entry({
            placeholder: 'Output template (default: %(title)s.%(ext)s)',
            text: this.c.s('output-template'),
            onChanged: (t) => this.c.setStr('output-template', t),
        });
        add(this._templateField);

        // Cookies
        add(UI.sectionTitle('COOKIES'));
        this._cookiesBrowserDropdown = UI.dropdown({
            options: Model.BROWSER_OPTIONS,
            value: this.c.s('cookies-from-browser'),
            onChanged: (v) => this.c.setStr('cookies-from-browser', v),
        });
        add(this._cookiesBrowserDropdown.actor);
        this._cookiesProfileField = UI.entry({
            placeholder: 'Profile name or full config path (optional)',
            text: this.c.s('cookies-profile'),
            onChanged: (t) => this.c.setStr('cookies-profile', t),
        });
        this._cookiesProfileField.style = 'flex-grow: 1;';
        add(this._cookiesProfileField);
        this._cookiesFileField = UI.entry({
            placeholder: 'Cookies file path (Netscape format)',
            text: this.c.s('cookies'),
            onChanged: (t) => this.c.setStr('cookies', t),
        });
        this._cookiesFileField.style = 'flex-grow: 1;';
        add(this._cookiesFileField);

        // Proxy / network
        add(UI.sectionTitle('NETWORK'));
        this._proxyField = UI.entry({
            placeholder: 'Proxy URL',
            text: this.c.s('proxy'),
            onChanged: (t) => this.c.setStr('proxy', t),
        });
        this._proxyField.style = 'flex-grow: 1;';
        add(this._proxyField);

        const rateRow = UI.row({ vertical: false });
        this._rateField = UI.entry({
            placeholder: 'Rate limit',
            text: this.c.s('rate-limit'),
            onChanged: (t) => this.c.setStr('rate-limit', t),
        });
        this._rateField.style = 'flex-grow: 1;';
        this._fragField = UI.entry({
            placeholder: 'Concurrent fragments',
            text: this.c.s('concurrent-fragments'),
            onChanged: (t) => this.c.setStr('concurrent-fragments', t),
        });
        this._fragField.style = 'flex-grow: 1;';
        rateRow.add_child(this._rateField);
        rateRow.add_child(this._fragField);
        add(rateRow);

        add(UI.sectionTitle('EXTRA ARGS'));
        this._customArgsField = UI.entry({
            placeholder: 'Extra yt-dlp arguments (space separated)',
            text: this.c.s('custom-args'),
            onChanged: (t) => this.c.setStr('custom-args', t),
        });
        this._customArgsField.style = 'flex-grow: 1;';
        add(this._customArgsField);

        // Destructive (wipes cookies/proxy/custom args/history), so it gets
        // a lightweight two-click confirm instead of firing immediately:
        // first click swaps the label and arms a short window, second click
        // within that window actually resets; anything else (a timeout, or
        // the panel closing) disarms it.
        let resetArmed = false;
        let resetTimeoutId = 0;
        const disarmReset = () => {
            resetArmed = false;
            if (resetTimeoutId) { GLib.source_remove(resetTimeoutId); resetTimeoutId = 0; }
            resetBtn.label = 'Reset settings to defaults';
        };
        const resetBtn = UI.ghostButton({
            label: 'Reset settings to defaults',
            onActivate: () => {
                if (!resetArmed) {
                    resetArmed = true;
                    resetBtn.label = 'Click again to confirm reset';
                    resetTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
                        resetTimeoutId = 0;
                        disarmReset();
                        return GLib.SOURCE_REMOVE;
                    });
                    return;
                }
                disarmReset();
                this.c._deps.resetSettings && this.c._deps.resetSettings();
            },
        });
        this._disarmReset = disarmReset;
        add(resetBtn);

        return body;
    }

    _buildActiveCard() {
        const wrap = UI.row({ vertical: true, styleClass: 'ytrawl-active-card' });
        this._activeCard = wrap;
        this._activeCard.visible = false;

        const head = UI.row({ vertical: false });
        this._activeTitle = UI.label('', 'ytrawl-title');
        this._activeTitle.clutter_text.ellipsize = 2;
        head.add_child(this._activeTitle);

        const actions = UI.row({ vertical: false, x_expand: false });
        this._retryBtn = UI.iconButton({
            icon: 'view-refresh-symbolic',
            tooltip: 'Retry as web client',
            onActivate: () => this.c.retryWithWebClient(),
        });
        this._pauseBtn = UI.iconButton({
            icon: 'media-playback-pause-symbolic',
            tooltip: 'Pause',
            onActivate: () => this.c.pauseActive(),
        });
        this._resumeBtn = UI.iconButton({
            icon: 'media-playback-start-symbolic',
            tooltip: 'Resume',
            onActivate: () => this.c.resumeActive(),
        });
        this._cancelBtn = UI.iconButton({
            icon: 'process-stop-symbolic',
            tooltip: 'Cancel',
            onActivate: () => this.c.cancelActive(),
        });
        this._folderBtn = UI.iconButton({
            icon: 'folder-open-symbolic',
            tooltip: 'Open folder',
            onActivate: () => this.c.activeOutputDir && this.c._deps.openFolder &&
                this.c._deps.openFolder(this.c.activeOutputDir),
        });
        this._clearCardBtn = UI.iconButton({
            icon: 'window-close-symbolic',
            tooltip: 'Clear',
            onActivate: () => this.c.clearActive(),
        });
        for (const b of [this._retryBtn, this._pauseBtn, this._resumeBtn,
            this._cancelBtn, this._folderBtn, this._clearCardBtn]) actions.add_child(b);
        head.add_child(actions);
        wrap.add_child(head);

        this._activeMeta = UI.label('', 'ytrawl-meta');
        wrap.add_child(this._activeMeta);

        this._progressRow = UI.row({ vertical: false });
        this._progress = UI.progressBar();
        this._progressPct = UI.label('', 'ytrawl-meta');
        this._progressPct.style = 'min-width: 52px; text-align: right;';
        this._progressRow.add_child(this._progress.actor);
        this._progressRow.add_child(this._progressPct);
        this._progressRow.visible = false;
        wrap.add_child(this._progressRow);

        this._progressStats = UI.label('', 'ytrawl-hint');
        wrap.add_child(this._progressStats);

        return wrap;
    }

    // ---- input handling ----------------------------------------------------

    _onUrlKey(actor, event) {
        const sym = UI.keySymbol(event);
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (UI.isEscape(sym)) {
            this._onClose();
            return Clutter.EVENT_STOP;
        }
        if (!ctrl) return Clutter.EVENT_PROPAGATE;

        return this._handleCtrlShortcut(sym);
    }

    _anyFieldFocused() {
        const fields = [
            this._urlEntry, this._customField, this._templateField,
            this._cookiesProfileField, this._cookiesFileField, this._proxyField,
            this._rateField, this._fragField, this._customArgsField, this._dirField,
        ];
        return fields.some(f => f && f.has_key_focus());
    }

    _handleCtrlShortcut(sym) {
        switch (sym) {
        case Clutter.KEY_BackSpace:
            this.c.resetInput();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_1:
            this.c.setDownloadMode('video');
            return Clutter.EVENT_STOP;
        case Clutter.KEY_2:
            this.c.setDownloadMode('audio');
            return Clutter.EVENT_STOP;
        case Clutter.KEY_3:
            this.c.setDownloadMode('custom');
            return Clutter.EVENT_STOP;
        case Clutter.KEY_r: case Clutter.KEY_R:
            if (this.c.canRetryAsWebClient) this.c.retryWithWebClient();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_p: case Clutter.KEY_P:
            if (this.c.activeStatus === 'paused') this.c.resumeActive();
            else if (this.c.activeStatus === 'downloading') this.c.pauseActive();
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _onRootKey(actor, event) {
        const sym = UI.keySymbol(event);
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (UI.isEscape(sym)) {
            this._onClose();
            return Clutter.EVENT_STOP;
        }
        if (UI.isEnter(sym)) {
            this._onEnter();
            return Clutter.EVENT_STOP;
        }
        if (!ctrl || this._anyFieldFocused()) return Clutter.EVENT_PROPAGATE;

        return this._handleCtrlShortcut(sym);
    }

    handleStageKey(event) {
        const sym = UI.keySymbol(event);
        if (UI.isEnter(sym)) {
            this._onEnter();
            return;
        }
        if (UI.isEscape(sym)) {
            this._onClose();
        }
    }

    ensureEntryFocus() {
        if (!this._urlEntry) return;
        try {
            if (!this._urlEntry.has_key_focus())
                this._focusUrl();
        } catch (e) { /* ignore */ }
    }

    _focusUrl() {
        if (!this._urlEntry) return;
        try {
            this._urlEntry.grab_key_focus();
            const target = this._urlEntry.clutter_text;
            if (target)
                target.set_cursor_visible(true);
        } catch (e) { /* ignore */ }
    }

    _onEnter() {
        const c = this.c;
        if (this._enterDebounce) return;
        this._enterDebounce = true;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._enterDebounce = false;
            return GLib.SOURCE_REMOVE;
        });
        if (c.mediaInfo && c.activeStatus !== 'downloading') c.startDownload();
        else if (!c.mediaInfo && !c.extracting) c.startExtraction();
    }

    _maybeAutoExtract(text) {
        const c = this.c;
        if (c.extracting || c.downloadInProgress) return;
        const url = Model.cleanUrlText(text || '');
        if (!url || !Model.looksLikeUrl(url)) return;
        if (this._autoExtractId) GLib.source_remove(this._autoExtractId);
        this._autoExtractId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 450, () => {
            this._autoExtractId = null;
            const now = Model.cleanUrlText(this.c.currentUrl || '');
            if (!now || this.c.extracting || this.c.downloadInProgress) return GLib.SOURCE_REMOVE;
            this.c.startExtraction();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._autoExtractId) {
            try { GLib.source_remove(this._autoExtractId); } catch (e) { /* gone */ }
            this._autoExtractId = null;
        }
        if (this._disarmReset) this._disarmReset();
        this._renderPulse(this._extractingLabel, false);
    }

    _closeDropdowns() {
        if (this._trackDropdown) this._trackDropdown.close();
        if (this._subsDropdown) this._subsDropdown.close();
        if (this._cookiesBrowserDropdown) this._cookiesBrowserDropdown.close();
    }

    // ---- render ------------------------------------------------------------

    render() {
        try {
            this._render();
        } catch (e) {
            log('ytrawl render error: ' + (e && e.stack ? e.stack : e));
        }
    }

    _render() {
        const c = this.c;

        // Error banner.
        if (c.errorMessage !== '') {
            this._errRow.visible = true;
            this._errText.text = c.errorMessage;
        } else {
            this._errRow.visible = false;
        }

        // Missing-tool banner.
        if (c.tools && !c.tools.ytDlpOk) {
            this._toolsRow.visible = true;
            this._toolsText.text = 'yt-dlp was not found on PATH — install it to use Ytrawl.';
        } else if (c.tools && !c.tools.ffmpegOk) {
            this._toolsRow.visible = true;
            this._toolsText.text = 'ffmpeg was not found on PATH — some formats and merging features need it.';
        } else {
            this._toolsRow.visible = false;
        }


        // Input state.
        this._clearBtn.visible = c.currentUrl.trim() !== '';
        this._updateEntry(this._urlEntry, c.currentUrl);

        // Hint.
        this._renderHint();

        // Extracting.
        this._extractingLabel.visible = c.extracting;
        this._renderPulse(this._extractingLabel, c.extracting);

        // Media card.
        const hasInfo = c.mediaInfo !== null;
        this._card.visible = hasInfo;
        if (hasInfo) {
            const info = c.mediaInfo;
            this._title.text = info.title;
            this._uploader.text = info.uploader;
            this._durationBadge.text = info.duration > 0 ? Model.formatDuration(info.duration) : '';
            this._durationBadge.visible = info.duration > 0;
            this._renderThumb();
        }

        // Playlist pill.
        this._playlistRow.visible = hasInfo && c.mediaInfo.isPlaylist === true;
        if (this._playlistRow.visible) {
            this._playlistValue.text = String(c.mediaInfo.count || 0) + ' items';
        }

        // Mode section.
        this._modeAcc.actor.visible = hasInfo;
        if (hasInfo) {
            this._modeAcc.setValueText(this._modeValueText(c));
            setPill(this._modeButtons.video, c.downloadMode === 'video');
            setPill(this._modeButtons.audio, c.downloadMode === 'audio');
            setPill(this._modeButtons.custom, c.downloadMode === 'custom');

            const showQuality = c.downloadMode === 'video' && c.availableQualities.length > 0;
            this._qualitySection.visible = showQuality;
            if (showQuality) {
                const opts = [{ label: qualityLabel(c, 'best'), value: 'best' }];
                for (const q of c.availableQualities)
                    opts.push({ label: qualityLabel(c, q), value: q });
                this._qualityDropdown.setOptions(opts);
                this._qualityDropdown.setValue(c.videoQuality);
            }

            const showAudio = c.downloadMode === 'audio';
            this._audioSection.visible = showAudio;
            if (showAudio) {
                for (const f of Model.AUDIO_FORMATS) {
                    setPill(this._fmtButtons[f], c.audioFormat === f);
                }
                this._trackHeader.visible = (c.mediaInfo.audioLanguages || []).length > 0;
                this._trackDropdown.actor.visible = (c.mediaInfo.audioLanguages || []).length > 0;
                if (this._trackDropdown.actor.visible) {
                    this._trackDropdown.setOptions(Model.audioTrackOptions(c.mediaInfo.audioLanguages));
                    this._trackDropdown.setValue(c.audioLanguage);
                }
            }

            const showCustom = c.downloadMode === 'custom';
            this._customField.visible = showCustom;
            this._updateEntry(this._customField, c.s('custom-format-selector'));
        }

        // Subtitles.
        const showSubs = hasInfo && (c.mediaInfo.hasSubs || c.mediaInfo.hasAutoSubs);
        this._subsAcc.actor.visible = showSubs;
        if (showSubs) {
            const parts = [];
            if (c.b('embed-subs')) parts.push('Embed');
            if (c.b('write-subs-file')) parts.push('File');
            if (c.b('include-auto-subs')) parts.push('Auto');
            this._subsAcc.setValueText(parts.join(' · ') || 'Off');
            this._subsEmbed.setChecked(c.b('embed-subs'));
            this._subsWriteFile.setChecked(c.b('write-subs-file'));
            this._subsWriteFile.actor.visible = c.mediaInfo.hasSubs;
            this._subsAuto.setChecked(c.b('include-auto-subs'));
            this._subsAuto.actor.visible = c.mediaInfo.hasAutoSubs;
            this._subsLangText.visible = c.mediaInfo.subLanguages.length > 0;
            this._subsDropdown.actor.visible = c.mediaInfo.subLanguages.length > 0;
            if (this._subsDropdown.actor.visible) {
                this._subsDropdown.setOptions(Model.subtitleOptions(c.mediaInfo.subLanguages));
                this._subsDropdown.setValue(c.s('sub-language'));
            }
        }

        // Thumbnail options.
        this._thumbAcc.actor.visible = hasInfo;
        if (hasInfo) {
            const parts = [];
            if (c.b('download-thumbnail')) parts.push('Save');
            if (c.b('embed-thumbnail')) parts.push('Embed');
            this._thumbAcc.setValueText(parts.join(' · ') || 'Off');
            this._thumbSave.setChecked(c.b('download-thumbnail'));
            this._thumbEmbed.setChecked(c.b('embed-thumbnail'));
        }

        // DRC + SponsorBlock.
        this._drcToggle.actor.visible = hasInfo;
        this._drcToggle.setChecked(c.b('prefer-drc'));
        this._sponAcc.actor.visible = hasInfo;
        if (hasInfo) {
            const cats = c.arr('sponsor-block-categories');
            this._sponAcc.setValueText(c.b('sponsor-block')
                ? `On · ${cats.length} types`
                : 'Off');
            this._sponToggle.setChecked(c.b('sponsor-block'));
            for (const cat of Model.SPONSOR_CATEGORIES) {
                if (this._sponCats[cat])
                    this._sponCats[cat].setChecked(cats.includes(cat));
            }
        }

        // After download.
        const action = c.s('post-download-action');
        this._afterAcc.setValueText(
            Model.POST_DOWNLOAD_ACTIONS.find(a => a.value === action)?.label || 'Nothing');
        for (const act of Model.POST_DOWNLOAD_ACTIONS) {
            setPill(this._afterButtons[act.value], action === act.value);
        }

        // History.
        this._histAcc.setValueText(c.history.length > 0 ? `${c.history.length} URLs` : '');
        this._histSave.setChecked(c.b('save-history'));
        this._histClear.visible = c.history.length > 0;
        this._rebuildHistory(c.history);

        // Advanced.
        this._rawLogToggle.setChecked(c.showRawLog);
        this._autoClip.setChecked(c.b('auto-clipboard'));
        this._autoExtract.setChecked(c.b('auto-extract-clipboard'));
        this._clearAfter.setChecked(c.b('clear-input-after-download'));
        this._archive.setChecked(c.b('use-archive'));
        this._reduceMotion.setChecked(c.b('reduce-motion'));
        this._updateEntry(this._templateField, c.s('output-template'));
        this._cookiesBrowserDropdown.setValue(c.s('cookies-from-browser'));
        this._cookiesProfileField.visible = c.s('cookies-from-browser') !== '';
        this._updateEntry(this._cookiesProfileField, c.s('cookies-profile'));
        this._updateEntry(this._cookiesFileField, c.s('cookies'));
        this._updateEntry(this._proxyField, c.s('proxy'));
        this._updateEntry(this._rateField, c.s('rate-limit'));
        this._updateEntry(this._fragField, c.s('concurrent-fragments'));
        this._updateEntry(this._customArgsField, c.s('custom-args'));
        this._updateEntry(this._dirField, c.s('download-dir'));

        // Raw log.
        this._rawLogBox.visible = c.showRawLog && c.rawLog !== '';
        this._rawLogLabel.text = c.rawLog;

        // Active card.
        this._renderActiveCard();

        // Queue.
        this._rebuildQueue();

        // Footer / extract buttons.
        const noInfo = !hasInfo;
        const notDownloading = c.activeStatus !== 'downloading';
        // Extraction is independent of whatever's already downloading —
        // it's how you queue a *second* item while one is active — so it
        // shouldn't be hidden just because something else is downloading.
        // (It matches _onEnter()'s own condition, which never gated on
        // notDownloading either.)
        this._extractBtn.visible = noInfo && !c.extracting;
        this._extractBtn.label = c.extracting ? 'Extracting…' : 'Extract';
        this._extractBtn.reactive = !c.extracting;
        this._extractBtn.opacity = c.extracting ? 0.7 : 1;
        this._runQueueBtn.visible = noInfo && notDownloading && c.activeStatus !== 'paused' &&
            !c.extracting && c.queue.length > 0;
        this._runQueueBtn.label = `Run queue (${c.queue.length})`;
        this._dirField.visible = hasInfo;
        this._footer.visible = hasInfo && !c.showingDownloadedCard;

        if (this._footer.visible) {
            const size = Model.formatSize(Model.estimateSize(c.mediaInfo, c.makeJob()));
            const isPlaylist = c.mediaInfo && c.mediaInfo.isPlaylist === true;
            this._downloadBtn.label = isPlaylist ? 'Download all' : 'Download';
            setTooltip(this._downloadBtn, size ? `About ${size}` : "");
            this._downloadBtn.visible = !c.downloadInProgress;
            this._queueBtn.label = c.downloadInProgress ? 'Queue next' : 'Queue';
            this._queueBtn.style = c.downloadInProgress ? 'flex-grow: 1;' : '';
            if (c.downloadInProgress) this._downloadBtn.visible = false;
        }
    }

    _updateEntry(entry, value) {
        if (!entry) return;
        if (entry.has_key_focus()) return;
        if (entry.text !== String(value ?? '')) entry.text = String(value ?? '');
    }

    _renderHint() {
        const c = this.c;
        const trimmed = c.currentUrl.trim();
        if (c.extracting || c.downloadInProgress || c.activeStatus === 'preparing') {
            this._hint.visible = false;
            return;
        }
        this._hint.visible = true;
        let text;
        let color;
        if (trimmed === '') {
            text = 'Paste a URL or search YouTube — press Enter';
            color = 'ytrawl-hint-dim';
        } else if (c.normalizedUrl === '' && !c.isSearchQuery) {
            text = 'Not a URL — paste the link or search';
            color = 'ytrawl-hint-bad';
        } else if (c.mediaInfo) {
            text = 'Press Enter to download';
            color = 'ytrawl-hint-ok';
        } else if (c.pastedFromClipboard) {
            text = 'Pasted from clipboard — press Enter to extract';
            color = 'ytrawl-hint-ok';
        } else if (c.isSearchQuery) {
            text = 'Press Enter to search YouTube';
            color = 'ytrawl-hint-ok';
        } else {
            text = 'Press Enter to extract';
            color = 'ytrawl-hint-ok';
        }
        this._hint.text = text;
        this._hint.style_class = color;
    }

    _renderPulse(actor, run) {
        if (!actor) return;
        if (run && this.c.b('reduce-motion')) {
            // Respect "reduce motion": convey the busy state as a static
            // dim, no animation, no timers.
            actor.opacity = 140;
            return;
        }
        if (run) {
            if (actor._ytrawl_pulse) return;
            try {
                if (typeof actor.create_transition === 'function' &&
                    typeof actor.get_transition === 'function') {
                    if (actor.get_transition('ytrawl-pulse')) return;
                    const t = actor.create_transition('ytrawl-pulse');
                    t.property = 'opacity';
                    t.from = 0.45;
                    t.to = 1.0;
                    t.duration = 600;
                    t.progress_mode = Clutter.AnimationMode.EASE_IN_OUT_QUAD;
                    t.repeat_count = -1;
                    t.round_trip = true;
                    t.run();
                    actor._ytrawl_pulse = { kind: 'transition' };
                    return;
                }
            } catch (e) { /* fall through to blink */ }
            let up = false;
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                actor.opacity = up ? 255 : 90;
                up = !up;
                return GLib.SOURCE_CONTINUE;
            });
            actor._ytrawl_pulse = { kind: 'timeout', id };
        } else {
            const p = actor._ytrawl_pulse;
            delete actor._ytrawl_pulse;
            try { if (typeof actor.remove_transition === 'function') actor.remove_transition('ytrawl-pulse'); } catch (e) { /* ignore */ }
            if (p && p.kind === 'timeout') {
                try { GLib.source_remove(p.id); } catch (e) { /* ignore */ }
            }
            actor.opacity = 255;
        }
    }

    _renderThumb() {
        const c = this.c;
        if (c._thumbType === 'file' && c._thumbFile) {
            this._thumb.visible = true;
            this._thumb.gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(c._thumbFile) });
        } else {
            this._thumb.visible = false;
        }
    }

    _rebuildHistory(history) {
        const c = this.c;
        this._histList.destroy_all_children();
        const shown = history.slice().reverse().slice(0, 10);
        for (const url of shown) {
            const item = UI.row({ vertical: false, styleClass: 'ytrawl-history-item' });
            const btn = UI.stWidget(St.Button, {
                label: url,
                style_class: 'ytrawl-history-link',
                x_expand: true,
                can_focus: true,
            });
            UI.connectSafe(btn, 'clicked', () => {
                this.c.currentUrl = url;
                this.c.startExtraction();
            });
            const remove = UI.iconButton({
                icon: 'window-close-symbolic',
                tooltip: 'Remove from history',
                onActivate: () => c.removeHistoryItem(url),
            });
            try { remove.x_expand = false; } catch (e) { /* ignore */ }
            item.add_child(btn);
            item.add_child(remove);
            this._histList.add_child(item);
        }
    }

    _rebuildQueue() {
        const c = this.c;
        if (c.queue.length === 0) {
            this._queueWrap.visible = false;
            return;
        }
        this._queueWrap.visible = true;
        this._queueList.destroy_all_children();
        c.queue.forEach((job, idx) => {
            const item = UI.row({ vertical: false, styleClass: 'ytrawl-queue-item' });
            const text = UI.label(job.title || job.url, 'ytrawl-queue-text');
            text.clutter_text.ellipsize = 2;
            const mode = UI.caption(job.mode || '');
            try { mode.x_expand = false; } catch (e) { /* ignore */ }
            const remove = UI.iconButton({
                icon: 'window-close-symbolic',
                tooltip: 'Remove from queue',
                onActivate: () => c.removeQueued(idx),
            });
            try { remove.x_expand = false; } catch (e) { /* ignore */ }
            item.add_child(text);
            item.add_child(mode);
            item.add_child(remove);
            this._queueList.add_child(item);
        });
    }

    _renderActiveCard() {
        const c = this.c;
        const status = c.activeStatus;
        this._activeCard.visible = status !== '';

        if (status === '') return;

        this._activeTitle.text = c.activeTitle || 'Transfer';

        const phrases = [
            'PULLING STREAMS', 'MUXING TRACKS', 'STITCHING SEGMENTS',
            'REWRITING PARTS', 'RESOLVING FORMATS', 'DEMUXING AUDIO',
        ];
        const meta = status === 'downloading'
            ? phrases[Math.floor(Date.now() / 2800) % phrases.length]
            : status === 'paused' ? 'PAUSED'
            : status === 'completed' ? 'FINISHED'
            : status === 'error' ? (c.activeError || 'ERROR')
            : status === 'cancelled' ? 'CANCELLED'
            : 'PREPARING…';
        this._activeMeta.text = meta;
        this._activeMeta.style_class = status === 'error' ? 'ytrawl-meta-bad' : 'ytrawl-meta';

        this._retryBtn.visible = c.canRetryAsWebClient;
        this._pauseBtn.visible = status === 'downloading';
        this._resumeBtn.visible = status === 'paused';
        this._cancelBtn.visible = status === 'downloading';
        this._folderBtn.visible = status === 'completed' && c.activeOutputDir !== '';
        this._clearCardBtn.visible = status !== 'downloading';

        const hasProgress = c.progress.percentText !== '' || c.progress.size !== '';
        this._progressRow.visible = hasProgress;
        if (hasProgress) {
            this._progress.setFraction(c.progress.percentValue / 100);
            this._progressPct.text = c.progress.percentText;
        }

        const statsParts = [];
        if (c.progress.size) statsParts.push(c.progress.size);
        if (c.progress.speed) statsParts.push('at ' + c.progress.speed);
        if (c.progress.eta) statsParts.push('· ' + c.progress.eta + ' remaining');
        this._progressStats.text = statsParts.join(' ');
        this._progressStats.visible = statsParts.length > 0;
    }

    _modeValueText(c) {
        const q = c.mediaInfo && c.mediaInfo.maxHeight > 0 ? c.mediaInfo.maxHeight + 'p' : '';
        if (c.downloadMode === 'video') {
            if (c.videoQuality !== 'best') return 'Video · ' + c.videoQuality + 'p';
            return q ? 'Video · Best (' + q + ')' : 'Video';
        }
        if (c.downloadMode === 'audio') {
            return 'Audio · ' + (c.audioFormat === 'best' ? 'Best' : c.audioFormat.toUpperCase());
        }
        return 'Custom';
    }
}