// SPDX-License-Identifier: MIT
// Pure helpers ported from the Otoru QML model (OtoruModel.js).
// No GI imports: keep this file free of shell bindings so it stays testable.

export function fmtSize(f) {
    if (!f) return 0;
    return Number(f.filesize) || Number(f.filesize_approx) || 0;
}

export function formatSize(bytes) {
    const b = Number(bytes);
    if (!b || Number.isNaN(b) || b <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
    }
    return (i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + units[i];
}

// Strip prose debris off the tail of a URL: punctuation, quotes, and
// closing brackets ("see https://x.com/a," / "(https://x.com/a)" pastes).
export function stripUrlJunk(u) {
    return String(u).replace(/[.,;:!?)\]}>"'\u2019\u201d]+$/, '');
}

// Normalize whatever the user pastes into a usable URL, or '' if it can't
// be one: trim, take the first http(s) URL (even inside prose), strip
// trailing junk, and auto-prefix https:// for bare hosts (youtube.com/...).
export function cleanUrlText(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    // Explicit ytsearch: prefixes are already valid yt-dlp input.
    if (/^ytsearch/i.test(t)) return stripUrlJunk(t);
    const m = /https?:\/\/\S+/i.exec(t);
    if (m) return stripUrlJunk(m[0]);
    if (!/\s/.test(t) && t.indexOf('.') >= 0) {
        return 'https://' + stripUrlJunk(t);
    }
    return '';
}

export function looksLikeUrl(text) {
    return cleanUrlText(text) !== '';
}

export function cleanClipboardUrl(text, maxLength = 4096) {
    const raw = String(text || '');
    if (!raw || raw.length > maxLength) return '';
    const trimmed = raw.trim();
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
    // Do not let cleanUrlText's bare-host convenience turn explicit schemes
    // such as ftp: or javascript: into an https URL.
    if (scheme && !/^(https?|ytsearch)$/i.test(scheme[1]) && !scheme[1].includes('.')) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return '';
    const cleaned = cleanUrlText(raw);
    return isSafePublicUrl(cleaned) ? cleaned : '';
}

// Non-empty text that isn't a URL and isn't an explicit ytsearch: prefix —
// the candidate for "search YouTube for this".
export function isSearchQuery(text) {
    const t = String(text || '').trim();
    return t !== '' && cleanUrlText(t) === '' && !/^ytsearch/i.test(t);
}

// Resolve raw input to the URL yt-dlp should see.
export function resolveUrl(text) {
    const raw = String(text || '').trim();
    const url = cleanUrlText(raw);
    if (url !== '') return url;
    if (isSearchQuery(raw)) return 'ytsearch1:' + raw;
    return '';
}

export function expandHome(path, home) {
    const p = String(path || '');
    if (p.startsWith('~')) return (home || '') + p.substring(1);
    return p;
}

export function shouldReuseMediaInfo(info, cachedUrl, requestedUrl, fetchedAt, now = Date.now(), ttlMs = 5 * 60 * 1000) {
    return !!info &&
        String(cachedUrl || '') !== '' &&
        String(cachedUrl) === String(requestedUrl) &&
        Number.isFinite(fetchedAt) &&
        fetchedAt > 0 &&
        now >= fetchedAt &&
        now - fetchedAt < ttlMs;
}

export function validateRateLimit(value) {
    const rate = String(value || '').trim();
    return rate && (!/^\d+(?:\.\d+)?(?:[KMGTPEZY](?:i?B)?)?$/i.test(rate) ||
        Number.parseFloat(rate) <= 0)
        ? 'Use a positive rate such as 5M or 500K, or leave empty.'
        : '';
}

export function validateConcurrentFragments(value) {
    const count = String(value || '').trim();
    return count && (!/^\d+$/.test(count) || Number(count) < 1)
        ? 'Use a positive whole number, or leave empty.'
        : '';
}

// Stall detection is opt-in. Keep the upper bound finite so malformed
// settings cannot overflow timer calculations or silently disable detection.
export function validateStallTimeoutMinutes(value) {
    const minutes = String(value || '').trim();
    return minutes && (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 1440)
        ? 'Use a whole number from 1 to 1440 minutes, or leave empty to disable.'
        : '';
}

export function validateDownloadDirectory(path, home) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/[\u0000-\u001f\u007f]/.test(raw))
        return 'Download directory contains invalid control characters.';
    if (raw === '~') {
        path = home || '';
    } else if (raw.startsWith('~/')) {
        path = (home || '') + raw.slice(1);
    } else if (raw.startsWith('~')) {
        return 'Use an absolute path or a path beginning with ~/.';
    }
    const value = String(path || '').trim();
    if (!value.startsWith('/'))
        return 'Download directory must be an absolute path or begin with ~/.';
    const normalized = normalizeAbsolutePath(value);
    if (!normalized || normalized === '/' || /^\/(proc|sys|dev)(\/|$)/.test(normalized))
        return 'Choose a writable download directory outside /, /proc, /sys, or /dev.';
    return '';
}

function normalizeAbsolutePath(path) {
    const value = String(path || '');
    if (!value.startsWith('/')) return '';
    const parts = [];
    for (const part of value.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
    }
    return '/' + parts.join('/');
}

// Lexically contain a path under the configured directory. This does not
// resolve symlinks; callers must not treat it as a filesystem sandbox.
export function isPathWithinDirectory(path, directory) {
    const candidate = normalizeAbsolutePath(path);
    const root = normalizeAbsolutePath(directory);
    return !!candidate && !!root && candidate !== root &&
        candidate.startsWith(root.endsWith('/') ? root : root + '/');
}

export function cookiesFromBrowserArg(settings) {
    const browser = String(settings.cookiesFromBrowser || '').trim().toLowerCase();
    if (!browser) return null;
    const profile = String(settings.cookiesProfile || '').trim();
    if (profile) return browser + ':' + profile;
    return browser;
}

export function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const parts = [];
    if (h > 0) parts.push(String(h));
    parts.push(String(m).padStart(h > 0 ? 2 : 1, '0'));
    parts.push(String(r).padStart(2, '0'));
    return parts.join(':');
}

export function parseVideoInfo(info) {
    const formats = Array.isArray(info.formats) ? info.formats : [];
    const heights = [];
    let hasAudio = false;
    const audioLanguages = [];
    for (const f of formats) {
        if (f && f.height && Number(f.height) > 0) heights.push(Number(f.height));
        if (f && f.acodec && String(f.acodec).toLowerCase() !== 'none') {
            hasAudio = true;
            if (f.language) {
                const lang = String(f.language).toLowerCase().split(/[-_]/)[0];
                if (lang && lang !== '' && !audioLanguages.includes(lang)) audioLanguages.push(lang);
            }
        }
    }

    let hasSubs = false;
    let hasAutoSubs = false;
    const subLanguages = [];
    try {
        hasSubs = info.subtitles && Object.keys(info.subtitles).length > 0;
        hasAutoSubs = info.automatic_captions && Object.keys(info.automatic_captions).length > 0;
        // Every language yt-dlp reported, manual + auto, deduped and sorted.
        for (const set of [info.subtitles, info.automatic_captions]) {
            if (!set) continue;
            for (const code of Object.keys(set)) {
                const c = String(code).toLowerCase();
                if (c && !subLanguages.includes(c)) subLanguages.push(c);
            }
        }
        subLanguages.sort();
    } catch (e) {
        // Keep going with the fields we have.
    }

    // Prefer non-webp URLs and rewrite YouTube's vi_webp/*.webp to jpg when
    // webp is all we get (Qt/St has no webp path we rely on here).
    let thumbnail = '';
    const thumbs = Array.isArray(info.thumbnails) ? info.thumbnails : [];
    for (const t of thumbs) {
        const tu = t && t.url ? String(t.url) : '';
        if (tu && !/\.webp($|\?)/i.test(tu)) thumbnail = tu;
    }
    if (!thumbnail && info.thumbnail) thumbnail = String(info.thumbnail);
    if (/\.webp($|\?)/i.test(thumbnail)) {
        thumbnail = thumbnail.replace('/vi_webp/', '/vi/').replace(/\.webp/i, '.jpg');
    }

    const chapters = Array.isArray(info.chapters)
        ? info.chapters.map((chapter, index) => ({
            startTime: Number(chapter && chapter.start_time),
            title: String(chapter && chapter.title || `Chapter ${index + 1}`),
        })).filter(chapter => Number.isFinite(chapter.startTime) && chapter.startTime >= 0)
        : [];

    return {
        isPlaylist: false,
        title: String(info.title || 'Unknown title'),
        thumbnail,
        duration: Number(info.duration) || 0,
        chapters,
        uploader: String(info.uploader || info.channel || info.artist || ''),
        formats,
        hasAudio,
        maxHeight: heights.length > 0 ? Math.max(...heights) : 0,
        extractor: String(info.extractor || ''),
        audioLanguages,
        hasSubs,
        hasAutoSubs,
        subLanguages,
        webpage_url: String(info.webpage_url || ''),
    };
}

export function parseInfo(raw) {
    try {
        const info = JSON.parse(String(raw || '{}'));
        if (!info || typeof info !== 'object') return null;

        // Playlists arrive as {_type:"playlist", entries:[...]}. For plain URLs
        // this is flat extraction (entry stubs only — the download re-extracts
        // each item itself); for ytsearchN it wraps fully-extracted entries.
        // A single fully-extracted result (ytsearch1) is unwrapped to its video.
        if (info._type === 'playlist' || Array.isArray(info.entries)) {
            const entries = info.entries || [];
            if (entries.length === 1 &&
                Array.isArray(entries[0].formats) &&
                entries[0].formats.length > 0) {
                return parseVideoInfo(entries[0]);
            }
            return {
                isPlaylist: true,
                count: Number(info.playlist_count) || entries.length,
                title: String(info.title || 'Playlist'),
                thumbnail: '',
                duration: 0,
                chapters: [],
                uploader: String(info.uploader || info.channel || ''),
                formats: [],
                hasAudio: true,
                maxHeight: 0,
                extractor: String(info.extractor || ''),
                audioLanguages: [],
                hasSubs: false,
                hasAutoSubs: false,
                subLanguages: [],
                webpage_url: String(info.webpage_url || ''),
            };
        }

        return parseVideoInfo(info);
    } catch (e) {
        return null;
    }
}

export const VIDEO_QUALITIES = [2160, 1440, 1080, 720, 480, 360, 240];

export function availableVideoQualities(maxHeight) {
    return VIDEO_QUALITIES.filter(q => maxHeight >= q).map(String);
}

// Flat playlist extraction carries no formats, so the real max height is
// unknown — offer every rung and let yt-dlp cap each entry on its own.
export function allVideoQualities() {
    return VIDEO_QUALITIES.map(String);
}

export function bestAudioFormat(formats, lang) {
    let best = null;
    let bestScore = -1;
    for (const f of formats) {
        if (!f.acodec || String(f.acodec).toLowerCase() === 'none') continue;
        if (lang && String(f.language || '').toLowerCase().split(/[-_]/)[0] !== lang) continue;
        const score = fmtSize(f) || Number(f.abr) || 0;
        if (score > bestScore) {
            bestScore = score;
            best = f;
        }
    }
    return best;
}

export function bestVideoFormat(formats, maxHeight) {
    let best = null;
    let bestScore = -1;
    for (const f of formats) {
        if (!f.vcodec || String(f.vcodec).toLowerCase() === 'none') continue;
        const h = Number(f.height) || 0;
        if (maxHeight > 0 && h > maxHeight) continue;
        const score = fmtSize(f) || Number(f.tbr) * 125 || h;
        if (score > bestScore) {
            bestScore = score;
            best = f;
        }
    }
    return best;
}

export function estimateQualitySize(info, height) {
    if (!info || !Array.isArray(info.formats)) return 0;
    const v = bestVideoFormat(info.formats, Number(height) || 0);
    const a = bestAudioFormat(info.formats, '');
    return fmtSize(v) + (vHasAudio(v) ? 0 : fmtSize(a));
}

function vHasAudio(f) {
    return !!(f && f.acodec && String(f.acodec).toLowerCase() !== 'none');
}

// Returns true only when both sizes are known and estimated output plus a
// modest 10% margin would exceed available space. Unknown estimates never block.
export function isDiskSpaceLow(freeBytes, estimatedBytes) {
    const free = Number(freeBytes);
    const estimated = Number(estimatedBytes);
    if (!Number.isFinite(free) || !Number.isFinite(estimated) || free < 0 || estimated <= 0)
        return false;
    return free < estimated * 1.1;
}

export function estimateSize(info, job) {
    if (!info || !Array.isArray(info.formats)) return 0;
    const j = job || {};
    const mode = j.mode || 'best';
    if (mode === 'custom') return 0;
    if (mode === 'audio') return fmtSize(bestAudioFormat(info.formats, j.audioLanguage || ''));
    const maxH = (mode === 'video' && j.quality && j.quality !== 'best')
        ? (Number(j.quality) || 0)
        : 0;
    const v = bestVideoFormat(info.formats, maxH);
    const a = bestAudioFormat(info.formats, '');
    // A muxed best-video stream already carries its audio track.
    return fmtSize(v) + (vHasAudio(v) ? 0 : fmtSize(a));
}

export function progressTemplate() {
    return 'progress:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|' +
        '%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|' +
        '%(progress._total_bytes_estimate_str)s|%(playlist_index)s|%(n_entries)s';
}

function stripAnsi(s) {
    return String(s || '').replace(/\x1b\[[0-9;]*m/g, '');
}

export function parseProgressLine(line) {
    const prefix = 'progress:';
    const s = stripAnsi(line || '');
    if (!s.startsWith(prefix)) return null;
    const parts = s.substring(prefix.length).split('|');

    const field = (i) => {
        const v = parts[i] ? parts[i].trim() : '';
        if (!v || v === 'NA' || v.includes('Unknown')) return '';
        return v;
    };

    const percentText = field(0);
    let percent = 0;
    if (percentText) {
        const n = parseFloat(percentText.replace('%', ''));
        if (!Number.isNaN(n)) percent = Math.max(0, Math.min(100, n));
    }

    const downloaded = field(3);
    const total = field(4) || field(5);
    const idx = field(6);
    const count = field(7);
    const itemPrefix = idx && count ? `[${idx}/${count}] ` : '';

    return {
        percent,
        percentText,
        speed: field(1),
        eta: field(2),
        downloaded,
        total,
        sizeText: itemPrefix + (downloaded && total ? `${downloaded} / ${total}` : downloaded),
    };
}

// Media URLs that came out of remote-controlled metadata may only reach
// curl or the image downloader when they look like plain http(s).
export function isWebUrl(url) {
    return /^https?:\/\//i.test(String(url || ''));
}

// Reject common non-public literal address ranges before curl touches
// thumbnail URLs scraped from third-party pages. This deliberately includes
// IPv4-mapped IPv6 and special-use/documentation ranges. It is not a complete
// SSRF boundary: DNS rebinding and a hostname resolving to a private address
// are not prevented by this string-only check.
const PRIVATE_HOST_PATTERN = new RegExp(
    '^(' +
    'localhost' +
    '|0\\.\\d+\\.\\d+\\.\\d+' +
    '|10\\.\\d+\\.\\d+\\.\\d+' +
    '|100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d+\\.\\d+' +
    '|127\\.\\d+\\.\\d+\\.\\d+' +
    '|169\\.254\\.\\d+\\.\\d+' +
    '|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+' +
    '|192\\.0\\.(0|2)\\.\\d+' +
    '|192\\.168\\.\\d+\\.\\d+' +
    '|198\\.(18|19)\\.\\d+\\.\\d+' +
    '|198\\.51\\.100\\.\\d+' +
    '|203\\.0\\.113\\.\\d+' +
    '|22[4-9]\\.\\d+\\.\\d+\\.\\d+' +
    '|23\\.\\d+\\.\\d+\\.\\d+' +
    '|24\\d\\.\\d+\\.\\d+\\.\\d+' +
    '|25[0-5]\\.\\d+\\.\\d+\\.\\d+' +
    '|\\[?::\\]?' +
    '|\\[?::1\\]?' +
    '|::ffff:.*' +
    '|fc[0-9a-f]{2}:.*' +
    '|fd[0-9a-f]{2}:.*' +
    '|fe[89ab][0-9a-f]:.*' +
    '|ff[0-9a-f]{2}:.*' +
    '|2001:db8:.*' +
    ')$', 'i');

export function isSafePublicUrl(url) {
    if (!isWebUrl(url)) return false;
    try {
        const authority = String(url).replace(/^https?:\/\//i, '').split(/[/?#]/)[0].split('@').pop();
        const bracketEnd = authority.indexOf(']');
        const host = authority.startsWith('[') && bracketEnd >= 0
            ? authority.slice(1, bracketEnd)
            : authority.split(':')[0];
        return !PRIVATE_HOST_PATTERN.test(host);
    } catch (e) {
        return false;
    }
}

export function normalizeSharedQueueItem(item) {
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id))
        throw new Error('Shared queue item ID is invalid');
    const url = String(item.url || '');
    if (url.length > 4096 || url !== url.trim() || !isSafePublicUrl(url))
        throw new Error('Shared queue URL must be a valid public HTTP(S) URL');
    const mode = String(item.mode || '');
    if (!['video', 'audio'].includes(mode)) throw new Error('Shared queue mode must be video or audio');
    const clean = (value, max, fallback = '') =>
        String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
    return {
        id: item.id,
        url,
        title: clean(item.title, 512),
        mode,
        quality: clean(item.quality, 128, 'best'),
        audio_format: clean(item.audio_format, 32),
        created_at: clean(item.created_at, 64, new Date().toISOString()),
    };
}

// Shared with guessOutputPath() and the post-cancel partial-file cleanup so
// both agree on what yt-dlp would have named the file from this title.
export function sanitizeTitleForFilename(title) {
    return String(title || 'download').replace(/[\/\\?%*:|"<>]/g, '_');
}

export function isPartialArtifactName(name, titlePrefix) {
    const filename = String(name || '');
    const prefix = String(titlePrefix || '');
    if (!prefix || !filename.startsWith(prefix)) return false;
    const suffix = filename.slice(prefix.length);
    if (!/^[ ._]/.test(suffix)) return false;
    return filename.endsWith('.part') || filename.endsWith('.ytdl') ||
        /\.part-Frag\d*$/.test(filename);
}


export function validateExecutablePath(value) {
    const path = String(value ?? '').trim();
    if (!path) return '';
    if (/[\u0000-\u001f\u007f]/.test(path)) return 'Path must not contain control characters.';
    if (!path.startsWith('/')) return 'Enter an absolute executable path, or leave empty to use PATH.';
    return '';
}

export function infoCommand(url, settings, useWebClient, home) {
    const pathError = validateExecutablePath(settings.ytDlpPath || '');
    if (pathError) throw new Error('yt-dlp path: ' + pathError);
    const args = [String(settings.ytDlpPath || '').trim() || 'yt-dlp', '--no-warnings', '--dump-single-json', '--skip-download'];
    // Search queries need real (non-flat) extraction to return the resolved
    // video instead of a playlist stub.
    if (!/^ytsearch/i.test(String(url))) args.push('--flat-playlist');
    if (useWebClient) args.push('--extractor-args', 'youtube:player_client=web');
    else args.push('--extractor-args', 'youtube:player_client=android');
    if (settings.proxy && String(settings.proxy).trim()) {
        args.push('--proxy', String(settings.proxy).trim());
    }
    const browserCookies = cookiesFromBrowserArg(settings);
    if (browserCookies) {
        args.push('--cookies-from-browser', browserCookies);
    } else if (settings.cookies && String(settings.cookies).trim()) {
        args.push('--cookies', expandHome(String(settings.cookies).trim(), home));
    }
    args.push(String(url));
    return args;
}

export function versionCommand(path = '') {
    return [String(path || '').trim() || 'yt-dlp', '--version'];
}

export function ffmpegVersionCommand(path = '') {
    return [String(path || '').trim() || 'ffmpeg', '-version'];
}

export function mkdirCommand(dir, home) {
    return ['mkdir', '-p', expandHome(dir, home)];
}

export function splitCustomArgs(argString) {
    const s = String(argString || '');
    const args = [];
    let token = '';
    let quote = null;
    let escaped = false;
    let started = false;

    for (const ch of s) {
        if (escaped) {
            token += ch;
            escaped = false;
            started = true;
            continue;
        }
        if (ch === '\\' && quote !== "'") {
            escaped = true;
            started = true;
            continue;
        }
        if (quote !== null) {
            if (ch === quote) quote = null;
            else token += ch;
            started = true;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            started = true;
            continue;
        }
        if (/\s/.test(ch)) {
            if (started) {
                args.push(token);
                token = '';
                started = false;
            }
            continue;
        }
        token += ch;
        started = true;
    }

    if (escaped) token += '\\';
    if (quote !== null) throw new Error('Unclosed quote in extra yt-dlp arguments.');
    if (started) args.push(token);
    return args;
}

export function archivePath(directory) {
    return String(directory || '').replace(/\/+$/, '') + '/.ytrawl-archive.txt';
}

export function buildDownloadArgs(job, settings, useWebClient, home) {
    const ytDlpPathError = validateExecutablePath(settings.ytDlpPath || '');
    if (ytDlpPathError) throw new Error('yt-dlp path: ' + ytDlpPathError);
    const ffmpegPathError = validateExecutablePath(settings.ffmpegPath || '');
    if (ffmpegPathError) throw new Error('ffmpeg path: ' + ffmpegPathError);
    const args = [
        String(settings.ytDlpPath || '').trim() || 'yt-dlp', '--newline', '--no-warnings', '--no-colors', '--progress',
        '--progress-delta', '0.3',
        '--progress-template', progressTemplate(),
        '--print', 'after_move:filepath',
    ];
    if (settings.ffmpegPath && String(settings.ffmpegPath).trim()) {
        args.push('--ffmpeg-location', String(settings.ffmpegPath).trim());
    }
    if (useWebClient) args.push('--extractor-args', 'youtube:player_client=web');
    else args.push('--extractor-args', 'youtube:player_client=android');

    const outDir = expandHome(settings.downloadDir, home);
    args.push('-P', outDir);

    if (settings.outputTemplate && String(settings.outputTemplate).trim()) {
        args.push('-o', String(settings.outputTemplate).trim());
    }
    if (settings.proxy && String(settings.proxy).trim()) {
        args.push('--proxy', String(settings.proxy).trim());
    }
    const browserCookies = cookiesFromBrowserArg(settings);
    if (browserCookies) {
        args.push('--cookies-from-browser', browserCookies);
    } else if (settings.cookies && String(settings.cookies).trim()) {
        args.push('--cookies', expandHome(String(settings.cookies).trim(), home));
    }
    const rateLimit = String(settings.rateLimit || '').trim();
    const rateLimitError = validateRateLimit(rateLimit);
    if (rateLimitError) throw new Error(rateLimitError);
    if (rateLimit) args.push('--limit-rate', rateLimit);

    const concurrentFragments = String(settings.concurrentFragments || '').trim();
    const concurrentFragmentsError = validateConcurrentFragments(concurrentFragments);
    if (concurrentFragmentsError) throw new Error(concurrentFragmentsError);
    if (concurrentFragments) args.push('--concurrent-fragments', concurrentFragments);
    if (settings.sponsorBlock === true) {
        const cats = Array.isArray(settings.sponsorBlockCategories)
            ? settings.sponsorBlockCategories.join(',')
            : '';
        if (cats) args.push('--sponsorblock-remove', cats);
    }
    if (settings.useArchive === true) {
        args.push('--download-archive', archivePath(outDir));
    }

    if (job.info && job.info.isPlaylist === true) {
        // Unknown or legacy values intentionally fall back to all items.
        const limit = String(settings.playlistLimit || 'all');
        if (/^(1|5|10|20)$/.test(limit)) {
            args.push('--playlist-items', '1-' + limit);
        }
    }

    if (settings.downloadThumbnail === true) {
        args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
    }
    if (settings.embedThumbnail === true) {
        args.push('--embed-thumbnail');
    }
    if (settings.embedSubs === true || settings.includeAutoSubs === true || settings.writeSubsFile === true) {
        const subLang = String(settings.subLanguage || 'all').trim();
        args.push('--sub-langs', subLang || 'all');
        if (settings.embedSubs === true) args.push('--embed-subs');
        // Explicit --write-subs so a plain (non-embedded) manual-subtitle
        // sidecar file is reachable even when the user doesn't want the
        // subs burned into the video.
        if (settings.writeSubsFile === true) args.push('--write-subs');
        if (settings.includeAutoSubs === true ||
            (settings.embedSubs === true && job.info && !job.info.hasSubs && job.info.hasAutoSubs)) {
            args.push('--write-auto-subs');
        }
    }

    // DRC preference relies on YouTube's "-drc" format-id suffix; other
    // sites fall through the alternate selectors unchanged.
    const preferDrc = settings.preferDrc === true;
    const mode = job.mode || 'best';
    if (mode === 'audio') {
        args.push('-x');
        const af = job.audioFormat || settings.audioFormat || 'best';
        if (af && String(af) !== 'best') args.push('--audio-format', String(af));
        let langFilter = '';
        if (job.audioLanguage && String(job.audioLanguage) !== '') {
            langFilter = '[language=' + String(job.audioLanguage) + ']';
        }
        if (preferDrc || langFilter !== '') {
            const base = 'bestaudio' + langFilter;
            const selectors = [];
            if (preferDrc) selectors.push(base + "[format_id$='-drc']");
            selectors.push(base);
            if (langFilter !== '') selectors.push('bestaudio');
            args.push('-f', selectors.join('/'));
        }
    } else if (mode === 'custom') {
        const sel2 = settings.customFormatSelector ? String(settings.customFormatSelector).trim() : '';
        if (sel2) args.push('-f', sel2);
    } else if (mode === 'video') {
        const q = job.quality || 'best';
        if (q !== 'best') {
            const video = 'bestvideo[height<=' + q + ']+bestaudio';
            if (preferDrc) {
                const drc = 'bestvideo[height<=' + q + "]+bestaudio[format_id$='-drc']";
                args.push('-f', '(' + drc + ')/(' + video + ')/best[height<=' + q + ']');
            } else {
                args.push('-f', video + '/best[height<=' + q + ']');
            }
        } else if (preferDrc) {
            args.push('-f', "(bestvideo*+bestaudio[format_id$='-drc'])/(bestvideo*+bestaudio)/best");
        }
    }

    args.push(String(job.url));
    if (settings.customArgs && String(settings.customArgs).trim()) {
        args.push(...splitCustomArgs(settings.customArgs));
    }
    return args;
}

// Gio.Subprocess has no portable priority setters. On Linux, opt-in priority
// lowering wraps only the download command with nice/ionice; default argv is
// returned unchanged, and callers must supply resolved utility paths.
export function wrapDownloadCommand(argv, settings, tools = {}) {
    if (settings.lowerDownloadPriority !== true) return [...argv];
    const nicePath = String(tools.nicePath || '');
    const ionicePath = String(tools.ionicePath || '');
    if (!nicePath || !ionicePath) {
        throw new Error('Lower download priority requires the Linux nice and ionice utilities.');
    }
    return [
        nicePath, '-n', '10',
        ionicePath, '-c', '2', '-n', '7',
        ...argv,
    ];
}

// Raw logs are display-only diagnostics; keep the tail bounded.
export function capLog(text) {
    const s = String(text || '');
    return s.length > 65536 ? s.substring(s.length - 65536) : s;
}

// Heuristic display-only redaction; this is not a comprehensive secret scanner.
export function redactSensitiveLogText(text) {
    return String(text || '')
        .replace(/(--(?:cookies|proxy|add-header|username|password|token|api-key|apikey|secret)(?:=|\s+))(?:(?:"[^"]*")|(?:'[^']*')|[^\s]+)/gi, '$1[redacted]')
        .replace(/\b(proxy(?:\s+url)?|cookies?(?: file| path)?|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*([=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1$2[redacted]')
        .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1[redacted]@');
}
export function friendlyError(stderr, exitCode, exitSignal) {
    const s = String(stderr || '');
    if (exitSignal !== 0) return 'Download cancelled.';
    if (exitCode === 127 ||
        s.toLowerCase().includes('command not found') ||
        s.includes('yt-dlp: not found')) {
        return 'yt-dlp is not installed or not on PATH.';
    }
    if (s.toLowerCase().includes('ffmpeg')) {
        return 'ffmpeg is required for this download. Please install ffmpeg.';
    }
    if (s.includes('Unsupported URL')) {
        return 'Unsupported website or URL.';
    }
    if (/sign in|login|authentication|auth required|authenticate/i.test(s)) {
        return 'Authentication required.';
    }
    if (/private|removed|unavailable|not available|blocked|copyright|age restricted/i.test(s)) {
        return 'Media unavailable.';
    }
    if (/requested format|format not available/i.test(s)) {
        return 'Selected format unavailable.';
    }
    if (/403|forbidden|access denied/i.test(s)) {
        return 'Access denied (HTTP 403). Try updating yt-dlp, using cookies, or retry as web client.';
    }
    if (/not available in your country|geo.*restrict|this content is not available/i.test(s)) {
        return 'Geo-blocked in your region.';
    }
    if (/certificate verify failed|ssl/i.test(s)) {
        return 'SSL/TLS certificate error.';
    }
    if (/http error|timed out|temporary failure|network|could not send|connection/i.test(s)) {
        return 'Network error.';
    }
    const first = s.split('\n')[0] || '';
    return 'Download failed' + (first ? ': ' + first : '');
}

export function guessOutputPath(settings, job, info, home) {
    // Templates are not concrete paths: yt-dlp chooses the final extension and may
    // post-process or move the output. Only after_move:filepath is authoritative.
    return '';
}

export const SPONSOR_CATEGORIES = [
    'sponsor', 'selfpromo', 'interaction', 'intro', 'outro',
    'preview', 'filler', 'music_offtopic',
];

const SPONSOR_NAMES = {
    sponsor: 'Sponsor',
    selfpromo: 'Self-promo',
    interaction: 'Interaction',
    intro: 'Intro',
    outro: 'Outro',
    preview: 'Preview',
    filler: 'Filler',
    music_offtopic: 'Non-music',
};

export function sponsorCategoryLabel(cat) {
    return SPONSOR_NAMES[cat] || cat;
}

export const AUDIO_FORMATS = ['best', 'mp3', 'opus', 'm4a'];

export function modeLabel(mode) {
    if (mode === 'video') return 'Video';
    if (mode === 'audio') return 'Audio';
    if (mode === 'custom') return 'Custom';
    return mode;
}

export function audioTrackOptions(langs) {
    const opts = [{ value: '', label: 'Original' }];
    for (const lang of langs || []) opts.push({ value: lang, label: lang });
    return opts;
}

export const LANGUAGE_NAMES = {
    aa: 'Afar', ab: 'Abkhazian', ae: 'Avestan', af: 'Afrikaans', ak: 'Akan',
    am: 'Amharic', an: 'Aragonese', ar: 'Arabic', as: 'Assamese', av: 'Avaric',
    ay: 'Aymara', az: 'Azerbaijani',
    ba: 'Bashkir', be: 'Belarusian', bg: 'Bulgarian', bh: 'Bihari', bi: 'Bislama',
    bm: 'Bambara', bn: 'Bengali', bo: 'Tibetan', br: 'Breton', bs: 'Bosnian',
    ca: 'Catalan', ce: 'Chechen', ch: 'Chamorro', co: 'Corsican', cr: 'Cree',
    cs: 'Czech', cu: 'Church Slavic', cv: 'Chuvash', cy: 'Welsh',
    da: 'Danish', de: 'German', dv: 'Divehi', dz: 'Dzongkha',
    ee: 'Ewe', el: 'Greek', en: 'English', eo: 'Esperanto', es: 'Spanish',
    et: 'Estonian', eu: 'Basque',
    fa: 'Persian', ff: 'Fula', fi: 'Finnish', fj: 'Fijian', fo: 'Faroese',
    fr: 'French', fy: 'Western Frisian',
    ga: 'Irish', gd: 'Scottish Gaelic', gl: 'Galician', gn: 'Guarani',
    gu: 'Gujarati', gv: 'Manx',
    ha: 'Hausa', he: 'Hebrew', hi: 'Hindi', ho: 'Hiri Motu', hr: 'Croatian',
    ht: 'Haitian', hu: 'Hungarian', hy: 'Armenian', hz: 'Herero',
    ia: 'Interlingua', id: 'Indonesian', ie: 'Interlingue', ig: 'Igbo',
    ii: 'Sichuan Yi', ik: 'Inupiaq', io: 'Ido', is: 'Icelandic', it: 'Italian',
    iu: 'Inuktitut',
    ja: 'Japanese', jv: 'Javanese',
    ka: 'Georgian', kg: 'Kongo', ki: 'Kikuyu', kj: 'Kuanyama', kk: 'Kazakh',
    kl: 'Kalaallisut', km: 'Khmer', kn: 'Kannada', ko: 'Korean', kr: 'Kanuri',
    ks: 'Kashmiri', ku: 'Kurdish', kv: 'Komi', kw: 'Cornish', ky: 'Kirghiz',
    la: 'Latin', lb: 'Luxembourgish', lg: 'Ganda', li: 'Limburgan', ln: 'Lingala',
    lo: 'Lao', lt: 'Lithuanian', lu: 'Luba-Katanga', lv: 'Latvian',
    mg: 'Malagasy', mh: 'Marshallese', mi: 'Maori', mk: 'Macedonian',
    ml: 'Malayalam', mn: 'Mongolian', mr: 'Marathi', ms: 'Malay', mt: 'Maltese',
    my: 'Burmese',
    na: 'Nauru', nb: 'Norwegian Bokmål', nd: 'North Ndebele', ne: 'Nepali',
    ng: 'Ndonga', nl: 'Dutch', nn: 'Norwegian Nynorsk', no: 'Norwegian',
    nr: 'South Ndebele', nv: 'Navajo', ny: 'Chichewa',
    oc: 'Occitan', oj: 'Ojibwa', om: 'Oromo', or: 'Oriya', os: 'Ossetian',
    pa: 'Punjabi', pi: 'Pali', pl: 'Polish', ps: 'Pashto', pt: 'Portuguese',
    qu: 'Quechua',
    rm: 'Romansh', rn: 'Kirundi', ro: 'Romanian', ru: 'Russian', rw: 'Kinyarwanda',
    sa: 'Sanskrit', sc: 'Sardinian', sd: 'Sindhi', se: 'Northern Sami',
    sg: 'Sango', si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', sm: 'Samoan',
    sn: 'Shona', so: 'Somali', sq: 'Albanian', sr: 'Serbian', ss: 'Swati',
    st: 'Southern Sotho', su: 'Sundanese', sv: 'Swedish', sw: 'Swahili',
    ta: 'Tamil', te: 'Telugu', tg: 'Tajik', th: 'Thai', ti: 'Tigrinya',
    tk: 'Turkmen', tl: 'Tagalog', tn: 'Tswana', to: 'Tongan', tr: 'Turkish',
    ts: 'Tsonga', tt: 'Tatar', tw: 'Twi', ty: 'Tahitian',
    ug: 'Uighur', uk: 'Ukrainian', ur: 'Urdu', uz: 'Uzbek',
    ve: 'Venda', vi: 'Vietnamese', vo: 'Volapük',
    wa: 'Walloon', wo: 'Wolof',
    xh: 'Xhosa',
    yi: 'Yiddish', yo: 'Yoruba',
    za: 'Zhuang', zh: 'Chinese', zu: 'Zulu',
};

export function subtitleOptions(langs) {
    const opts = [{ value: 'all', label: 'All' }];
    for (const code of langs || []) {
        const c = String(code);
        let label = LANGUAGE_NAMES[c];
        if (!label) {
            // Compound codes like "en-US", "zh-Hans" → "English (US)", "Chinese (Hans)"
            const dash = c.indexOf('-');
            if (dash > 0 && LANGUAGE_NAMES[c.substring(0, dash)]) {
                label = LANGUAGE_NAMES[c.substring(0, dash)] +
                    ' (' + c.substring(dash + 1) + ')';
            } else {
                label = c;
            }
        }
        opts.push({ value: c, label });
    }
    return opts;
}

export const BROWSER_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'brave', label: 'Brave' },
    { value: 'chrome', label: 'Chrome' },
    { value: 'chromium', label: 'Chromium' },
    { value: 'edge', label: 'Edge' },
    { value: 'firefox', label: 'Firefox' },
    { value: 'opera', label: 'Opera' },
    { value: 'safari', label: 'Safari' },
    { value: 'vivaldi', label: 'Vivaldi' },
    { value: 'whale', label: 'Whale' },
];

export const POST_DOWNLOAD_ACTIONS = [
    { value: 'nothing', label: 'Nothing' },
    { value: 'copy', label: 'Copy path' },
    { value: 'open', label: 'Open folder' },
    { value: 'openFile', label: 'Open file' },
];