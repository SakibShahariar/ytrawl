// SPDX-License-Identifier: MIT
// The top-bar popup panel. Renders controller state into St widgets.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Model from './model.js';
import * as UI from './ui.js';
import {createChapterSection} from './panel-chapters.js';
import {createAfterDownloadSection, createSponsorSection, buildSubsBody, buildThumbBody} from './panel-options.js';
import {buildAdvancedBody} from './panel-advanced.js';
import {buildPanelSections} from './panel-sections.js';
import {renderPanel} from './panel-render.js';
import {setPulse, updateHint} from './panel-feedback.js';
import {installPanelKeyboard} from './panel-keyboard.js';
import * as PanelRefresh from './panel-refresh.js';
import {buildActiveCard} from './panel-active-card.js';
import {buildHistoryBody} from './panel-lists.js';
import {buildModeBody} from './panel-mode.js';
import {buildPanelRoot} from './panel-root.js';

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
        controller._refreshQueue = () => this.refreshQueue();
        this.render();
    }

    _buildRoot() {
        return buildPanelRoot(this, {UI, St, Clutter, PANEL_WIDTH});
    }

    _buildModeBody() {
        return buildModeBody(this, UI, Model);
    }

    _buildSubsBody() {
        return buildSubsBody(this, UI);
    }

    _buildThumbBody() {
        return buildThumbBody(this, UI);
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
        return buildHistoryBody(this, UI);
    }

    _buildActiveCard() {
        return buildActiveCard(this, UI);
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
        PanelRefresh.updateEntry(entry, value);
    }

    // Called by the controller's throttled progress path. The extension
    // gates this method while the menu is closed to avoid hidden UI work.
    refreshProgress() {
        PanelRefresh.refreshProgress(this);
    }

    refreshQueue() {
        PanelRefresh.refreshQueue(this);
    }

    refreshHistory() {
        PanelRefresh.refreshHistory(this);
    }

    _renderRawLog() {
        PanelRefresh.renderRawLog(this);
    }

    _renderThumb() {
        PanelRefresh.renderThumb(this, Gio);
    }

    _rebuildHistory(history) {
        PanelRefresh.renderHistoryItems(this, history);
    }

    _rebuildQueue() {
        PanelRefresh.renderQueueItems(this);
    }

    _renderActiveCard() {
        PanelRefresh.renderActiveCard(this);
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