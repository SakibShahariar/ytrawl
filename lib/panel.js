// SPDX-License-Identifier: MIT
// The top-bar popup panel. Renders controller state into St widgets.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Model from './model.js';
import * as UI from './ui.js';
import {createChapterSection} from './panel-chapters.js';
import {renderHistory, renderQueue} from './panel-lists.js';
import {renderActiveCard} from './panel-active-card.js';
import {createAfterDownloadSection, createSponsorSection} from './panel-options.js';
import {buildAdvancedBody} from './panel-advanced.js';
import {buildPanelSections} from './panel-sections.js';
import {renderPanel} from './panel-render.js';
import {setPulse, updateHint} from './panel-feedback.js';
import {installPanelKeyboard} from './panel-keyboard.js';

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
        installPanelKeyboard(this);

        this.actor = this._buildRoot();
        this.entry = this._urlEntry;
        this._closeDropdowns();

        controller._refresh = () => this.render();
        controller._refreshProgressUI = () => this.refreshProgress();
        controller._refreshHistory = () => this.refreshHistory();
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
        this._sponsorSection = createSponsorSection(UI, Model, this.c);
        this._sponToggle = this._sponsorSection.toggle;
        this._sponFlow = this._sponsorSection.flow;
        this._sponCats = this._sponsorSection.categories;
        return this._sponsorSection.body;
    }

    _buildAfterBody() {
        this._afterSection = createAfterDownloadSection(UI, Model, this.c);
        this._afterRow = this._afterSection.row;
        this._afterButtons = this._afterSection.buttons;
        return this._afterSection.body;
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

    onMenuClosed() {
        if (this._disarmReset) this._disarmReset();
        this._closeDropdowns();
    }

    destroy() {
        if (this._autoExtractId) {
            try { GLib.source_remove(this._autoExtractId); } catch (e) { /* gone */ }
            this._autoExtractId = null;
        }
        if (this._disarmReset) this._disarmReset();
        setPulse(this, this._extractingLabel, false);
    }

    _closeDropdowns() {
        if (this._trackDropdown) this._trackDropdown.close();
        if (this._subsDropdown) this._subsDropdown.close();
        if (this._cookiesBrowserDropdown) this._cookiesBrowserDropdown.close();
    }

    // ---- render ------------------------------------------------------------

    render() {
        try {
            renderPanel(this, {UI, Model, St, Clutter, Gio, GLib, PANEL_WIDTH, PANEL_MAX_HEIGHT, qualityLabel, setPill});
        } catch (e) {
            log('ytrawl render error: ' + (e && e.stack ? e.stack : e));
        }
    }

    _updateEntry(entry, value) {
        if (!entry) return;
        if (entry.has_key_focus()) return;
        UI.setEntryText(entry, value);
    }

    // Called by the controller's throttled progress path. The extension
    // gates this method while the menu is closed to avoid hidden UI work.
    refreshProgress() {
        this._renderActiveCard();
        this._renderRawLog();
    }

    refreshHistory() {
        const c = this.c;
        this._histAcc.setValueText(c.history.length > 0 ? `${c.history.length} URLs` : '');
        this._histSave.setChecked(c.b('save-history'));
        this._histClear.visible = c.history.length > 0;
        this._rebuildHistory(c.history);
    }

    _renderRawLog() {
        const c = this.c;
        this._rawLogBox.visible = c.showRawLog && c.rawLog !== '';
        this._rawLogLabel.text = c.rawLog;
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
        renderHistory(UI, St, this.c, this._histList, history);
    }

    _rebuildQueue() {
        renderQueue(UI, this.c, this._queueWrap, this._queueList);
    }

    _renderActiveCard() {
        renderActiveCard(this);
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