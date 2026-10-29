// SPDX-License-Identifier: MIT
// Keyboard shortcuts and focus handling for the panel.

import Clutter from 'gi://Clutter';
import * as UI from './ui.js';

export function installPanelKeyboard(panel) {
    Object.assign(panel, {

    _onUrlKey(actor, event) {
        const sym = UI.keySymbol(event);
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (UI.isEscape(sym)) {
            this._onClose();
            return Clutter.EVENT_STOP;
        }
        if (!ctrl) return Clutter.EVENT_PROPAGATE;

        return this._handleCtrlShortcut(sym);
    },

    _anyFieldFocused() {
        const fields = [
            this._urlEntry, this._customField, this._templateField,
            this._cookiesProfileField, this._cookiesFileField, this._proxyField,
            this._rateField, this._fragField, this._customArgsField, this._dirField,
        ];
        return fields.some(f => f && f.has_key_focus());
    },

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
    },

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
    },

    handleStageKey(event) {
        const sym = UI.keySymbol(event);
        if (UI.isEnter(sym)) {
            this._onEnter();
            return;
        }
        if (UI.isEscape(sym)) {
            this._onClose();
        }
    },

    ensureEntryFocus() {
        if (!this._urlEntry) return;
        try {
            if (!this._urlEntry.has_key_focus())
                this._focusUrl();
        } catch (e) { /* ignore */ }
    },

    _focusUrl() {
        if (!this._urlEntry) return;
        try {
            this._urlEntry.grab_key_focus();
            const target = this._urlEntry.clutter_text;
            if (target)
                target.set_cursor_visible(true);
        } catch (e) { /* ignore */ }
    }

    });
}
