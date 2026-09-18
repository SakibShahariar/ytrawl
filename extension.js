// SPDX-License-Identifier: MIT
// Ytrawl — yt-dlp media downloads docked in your GNOME top bar.

import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {YtrawlController} from './lib/controller.js';
import {YtrawlPanel} from './lib/panel.js';
import {openPath} from './lib/ytdlp.js';
import {connectSafe, stWidget} from './lib/ui.js';
import {loadMatugenColors, buildYtrawlCss} from './lib/matugen.js';

const ICON_NAME = 'edit-download-symbolic';
const MATUGEN_CSS_PATH = ['ytrawl-matugen.css'];

export default class YtrawlExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._controller = new YtrawlController({
            settings: this._settings,
            deps: {
                getClipboardText: (cb) => this._getClipboard(cb),
                notify: (title, body, icon) => this._notify(title, body, icon),
                openFolder: (path) => openPath(path),
                resetSettings: () => this._resetSettings(),
            },
        });

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._setTooltip('Ytrawl — paste a URL to download');

        this._icon = stWidget(St.Icon, {
            icon_name: ICON_NAME,
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);

        this._panel = new YtrawlPanel(this._controller, {
            menu: this._indicator.menu,
            onClose: () => this._indicator.menu.close(),
        });

        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        item.actor.add_style_class_name('ytrawl-root');
        item.actor.add_child(this._panel.actor);
        this._indicator.menu.addMenuItem(item);

        // Scope our override stylesheet to the menu (matugen palette).
        this._indicator.menu.box.add_style_class_name('ytrawl-menu');

        // Live matugen colors: apply at launch, whenever the menu opens, and on
        // file change like update-checker/github-notifier do.
        this._matugenThemeFile = null;
        this._matugenCss = null;
        this._matugenMonitor = null;
        this._applyMatugenTheme();
        this._setupMatugenMonitor();

        // Route every controller state change through the panel and the
        // bar-icon pulse/tooltip.
        this._controller._refresh = () => {
            this._panel.render();
            this._syncButton();
        };

        this._menuOpen = false;
        this._stageKeyId = null;
        // Only listen at the stage level while the menu is actually open —
        // this was previously a permanently-installed global key hook, which
        // is more than the feature (routing Enter/Escape into a
        // reactive:false menu item) needs and is the kind of thing GNOME
        // Shell extension review tends to flag.
        connectSafe(this._indicator.menu, 'open-state-changed', (menu, open) => {
            this._menuOpen = open;
            if (open) {
                this._applyMatugenTheme();
                this._onPanelOpened();
                this._connectStageKey();
            } else {
                this._disconnectStageKey();
            }
        });

        Main.panel.addToStatusArea(this.metadata.uuid, this._indicator, 0, 'right');
    }

    disable() {
        this._menuOpen = false;
        this._removeMatugenTheme();
        this._disconnectStageKey();
        this._icon.remove_all_transitions();
        if (this._panel) {
            this._panel.destroy();
        }
        if (this._indicator) {
            this._indicator.menu.close();
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._controller) {
            this._controller.destroy();
            this._controller = null;
        }
        this._panel = null;
        this._settings = null;
    }

    _connectStageKey() {
        if (this._stageKeyId !== null) return;
        try {
            this._stageKeyId = global.stage.connect('key-press-event', (actor, event) => {
                if (!this._panel) return;
                this._panel.ensureEntryFocus();
                this._panel.handleStageKey(event);
            });
        } catch (e) { /* stage key-press not available */ }
    }

    _disconnectStageKey() {
        if (this._stageKeyId !== null) {
            try { global.stage.disconnect(this._stageKeyId); } catch (e) { /* ignore */ }
            this._stageKeyId = null;
        }
    }

    _onPanelOpened() {
        this._controller.onPanelOpened();
        if (this._panel && this._panel.entry) {
            this._panel.entry.grab_key_focus();
            try { this._panel.entry.clutter_text.set_selection(0, -1); } catch (e) { /* ignore */ }
        }
    }

    _getClipboard(cb) {
        try {
            St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clip, text) => {
                cb(text || '');
            });
        } catch (e) {
            cb('');
        }
    }

    _notify(title, body, icon) {
        const name = icon || 'emblem-downloads-symbolic';
        Main.notify(title, body, {
            gicon: new Gio.ThemedIcon({ name }),
        });
    }

    _resetSettings() {
        const keys = [
            'download-dir', 'auto-clipboard', 'auto-extract-clipboard',
            'clear-input-after-download', 'audio-format', 'advanced-visible',
            'output-template', 'cookies', 'cookies-from-browser',
            'cookies-profile', 'proxy', 'rate-limit', 'concurrent-fragments',
            'custom-format-selector', 'custom-args', 'download-thumbnail',
            'embed-thumbnail', 'embed-subs', 'include-auto-subs', 'write-subs-file',
            'prefer-drc', 'sponsor-block', 'sponsor-block-categories', 'use-archive',
            'save-history', 'history', 'sub-language', 'post-download-action',
            'reduce-motion',
        ];
        for (const key of keys) {
            try { this._settings.reset(key); } catch (e) { /* skip */ }
        }
        this._controller.history = [...this._settings.get_strv('history')];
        this._controller.clearActive();
        this._controller.resetInput();
        this._controller._refreshUI();
    }

    _syncButton() {
        const c = this._controller;
        const busy = c.extracting || c.downloadInProgress;
        this._pulseIcon(busy);

        let tooltip = 'Ytrawl — paste a URL to download';
        if (c.extracting) tooltip = 'Extracting…';
        else if (c.downloadInProgress) tooltip = `Downloading ${c.progress.percentText}`.trim();
        this._setTooltip(tooltip);
    }

    _setTooltip(text) {
        if (!this._indicator) return;
        const actor = this._indicator;
        if (typeof actor.set_tooltip_string === 'function') {
            actor.set_tooltip_string(text);
        } else if (typeof actor.set_tooltip_text === 'function') {
            actor.set_tooltip_text(text);
        } else if ('tooltip_text' in actor) {
            actor.tooltip_text = text;
        }
    }

    _pulseIcon(run) {
        if (!this._icon) return;
        if (run && this._settings && this._settings.get_boolean('reduce-motion')) {
            this._icon.remove_all_transitions();
            if (this._pulseTimer) {
                try { GLib.source_remove(this._pulseTimer); } catch (e) { /* ignore */ }
                this._pulseTimer = null;
            }
            this._icon.opacity = 140;
            return;
        }
        if (run) {
            if (this._pulseTimer) return;
            try {
                if (typeof this._icon.create_transition === 'function' &&
                    typeof this._icon.get_transition === 'function') {
                    if (this._icon.get_transition('ytrawl-busy')) return;
                    const t = this._icon.create_transition('ytrawl-busy');
                    t.property = 'opacity';
                    t.from = 0.4;
                    t.to = 1.0;
                    t.duration = 700;
                    t.progress_mode = Clutter.AnimationMode.EASE_IN_OUT_QUAD;
                    t.repeat_count = -1;
                    t.round_trip = true;
                    t.run();
                    return;
                }
            } catch (e) { /* fall through to blink */ }
            let up = false;
            this._pulseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                this._icon.opacity = up ? 255 : 90;
                up = !up;
                return GLib.SOURCE_CONTINUE;
            });
        } else {
            if (this._pulseTimer) {
                try { GLib.source_remove(this._pulseTimer); } catch (e) { /* ignore */ }
                this._pulseTimer = null;
            }
            try { if (typeof this._icon.remove_transition === 'function') this._icon.remove_transition('ytrawl-busy'); } catch (e) { /* ignore */ }
            this._icon.opacity = 255;
        }
    }

    _matugenCssPath() {
        return GLib.build_filenamev([GLib.get_user_cache_dir(), ...MATUGEN_CSS_PATH]);
    }

    _applyMatugenTheme() {
        try {
            const colors = loadMatugenColors();
            if (!colors) return;
            const css = buildYtrawlCss(colors);
            if (css === this._matugenCss) return;

            const cachePath = this._matugenCssPath();
            const ok = GLib.file_set_contents(cachePath, css);
            if (!ok) return;

            let theme = null;
            try {
                const stage = global.stage ?? global.display?.get_stage?.() ?? null;
                if (stage) {
                    const ctx = St.ThemeContext.get_for_stage(stage);
                    theme = ctx?.get_theme() ?? null;
                }
            } catch (e) { /* ignore */ }

            if (theme && this._matugenThemeFile) {
                try { theme.unload_stylesheet(this._matugenThemeFile); } catch (e) { /* ignore */ }
            }
            const file = Gio.File.new_for_path(cachePath);
            if (theme) {
                theme.load_stylesheet(file);
                this._matugenThemeFile = file;
                try { this._indicator?.menu?.box?.queue_relayout(); } catch (e) { /* ignore */ }
            }
            this._matugenCss = css;
        } catch (e) {
            logError(e, 'Ytrawl matugen theme failed');
        }
    }

    _setupMatugenMonitor() {
        const path = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'matugen', 'matugen-colors.css']);
        const file = Gio.File.new_for_path(path);
        try {
            this._matugenMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        } catch (e) {
            this._matugenMonitor = null;
            return;
        }
        connectSafe(this._matugenMonitor, 'changed', (monitor, _file, _other, eventType) => {
            if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                eventType === Gio.FileMonitorEvent.CHANGED) {
                this._applyMatugenTheme();
            }
        });
    }

    _removeMatugenTheme() {
        if (this._matugenThemeFile) {
            try {
                const theme = St.ThemeContext.get_for_stage(global.stage)?.get_theme();
                if (theme) theme.unload_stylesheet(this._matugenThemeFile);
            } catch (e) { /* ignore */ }
            this._matugenThemeFile = null;
        }
        if (this._matugenMonitor) {
            try { this._matugenMonitor.cancel(); } catch (e) { /* ignore */ }
            this._matugenMonitor = null;
        }
        this._matugenCss = null;
    }
}