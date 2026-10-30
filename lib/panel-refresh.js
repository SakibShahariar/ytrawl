// SPDX-License-Identifier: MIT
// Targeted panel refresh operations, kept separate from widget construction.

import St from 'gi://St';
import * as UI from './ui.js';
import {renderHistory, renderQueue} from './panel-lists.js';
import {renderActiveCard} from './panel-active-card.js';

export function updateEntry(entry, value) {
    if (!entry || entry.has_key_focus()) return;
    UI.setEntryText(entry, value);
}

export function refreshProgress(panel) {
    renderActiveCard(panel);
    renderRawLog(panel);
}

export function refreshQueue(panel) {
    const c = panel.c;
    renderQueue(UI, c, panel._queueWrap, panel._queueList);
    const notDownloading = c.activeStatus !== 'downloading';
    panel._runQueueBtn.visible = (!c.mediaInfo || c.activeStatus === 'error') &&
        notDownloading && c.activeStatus !== 'paused' && !c.extracting && c.queue.length > 0;
    panel._runQueueBtn.label = `Run queue (${c.queue.length})`;
}

export function refreshHistory(panel) {
    const c = panel.c;
    panel._histAcc.setValueText(c.history.length > 0 ? `${c.history.length} URLs` : '');
    panel._histSave.setChecked(c.b('save-history'));
    panel._histClear.visible = c.history.length > 0;
    renderHistory(UI, St, c, panel._histList, c.history);
}

export function renderRawLog(panel) {
    const c = panel.c;
    panel._rawLogBox.visible = c.showRawLog && c.rawLog !== '';
    panel._rawLogLabel.text = c.rawLog;
}

export function renderThumb(panel, Gio) {
    const c = panel.c;
    if (c._thumbType === 'file' && c._thumbFile) {
        panel._thumb.visible = true;
        panel._thumb.gicon = new Gio.FileIcon({file: Gio.File.new_for_path(c._thumbFile)});
    } else {
        panel._thumb.visible = false;
    }
}
