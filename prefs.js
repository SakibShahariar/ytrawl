// SPDX-License-Identifier: MIT
// Preferences window for Ytrawl.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import * as Model from './lib/model.js';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function comboRow({ title, settings, key, options }) {
    const listStore = Gio.ListStore.new(Gtk.StringObject);
    for (const opt of options) listStore.append(Gtk.StringObject.new(opt.label));
    const combo = new Gtk.DropDown({
        model: listStore,
        selected: 0,
        expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string'),
    });
    combo.connect('notify::selected', (dd) => {
        const idx = dd.selected;
        if (idx >= 0 && idx < options.length) settings.set_string(key, options[idx].value);
    });
    // Initial selection.
    const current = settings.get_string(key);
    const idx = options.findIndex(o => o.value === current);
    if (idx >= 0) combo.selected = idx;

    const row = new Adw.ActionRow({ title, activatable_widget: combo });
    row.add_suffix(combo);
    return row;
}

function switchRow({ title, subtitle = '', settings, key, inverted = false }) {
    const toggle = new Gtk.Switch();
    const sync = () => {
        const v = settings.get_boolean(key);
        toggle.set_active(inverted ? !v : v);
    };
    const set = () => settings.set_boolean(key, inverted ? !toggle.get_active() : toggle.get_active());
    toggle.connect('notify::active', () => set());
    settings.connect(`changed::${key}`, sync);
    sync();

    const row = new Adw.ActionRow({
        title,
        subtitle,
        activatable_widget: toggle,
    });
    row.add_suffix(toggle);
    return row;
}

function entryRow({ title, subtitle = '', settings, key, placeholder = '', validate = null }) {
    const entry = new Gtk.Entry({
        text: settings.get_string(key),
        placeholder_text: placeholder,
        hexpand: true,
    });
    entry.connect('notify::text', () => {
        if (validate) {
            const message = validate(entry.text);
            if (message) {
                entry.add_css_class('error');
                entry.set_tooltip_text(message);
                return;
            }
            entry.remove_css_class('error');
            entry.set_tooltip_text('');
        }
        settings.set_string(key, entry.text);
    });
    settings.connect(`changed::${key}`, () => {
        if (entry.text !== settings.get_string(key)) entry.text = settings.get_string(key);
    });

    const row = new Adw.ActionRow({
        title,
        subtitle,
        activatable_widget: entry,
    });
    row.add_suffix(entry);
    return row;
}

function groupRow({ title }) {
    const group = new Adw.PreferencesGroup({ title });
    return { group, add: (w) => group.add(w) };
}

function historyPrivacyRows(settings) {
    const toggle = new Gtk.Switch({
        active: settings.get_boolean('save-history'),
        valign: Gtk.Align.CENTER,
    });
    const sync = () => {
        const value = settings.get_boolean('save-history');
        if (toggle.get_active() !== value) toggle.set_active(value);
    };
    toggle.connect('notify::active', () => {
        const enabled = toggle.get_active();
        settings.set_boolean('save-history', enabled);
        if (!enabled) settings.set_strv('history', []);
    });
    settings.connect('changed::save-history', sync);

    const remember = new Adw.ActionRow({
        title: 'Remember download history',
        subtitle: 'Stores previously downloaded URLs in GNOME settings. Turning this off clears saved history.',
        activatable_widget: toggle,
    });
    remember.add_suffix(toggle);

    const clear = new Gtk.Button({
        label: 'Clear history',
        valign: Gtk.Align.CENTER,
    });
    clear.connect('clicked', () => settings.set_strv('history', []));
    const clearRow = new Adw.ActionRow({
        title: 'Clear saved history',
        subtitle: 'Remove all URLs currently stored in history.',
        activatable_widget: clear,
    });
    clearRow.add_suffix(clear);
    return [remember, clearRow];
}

export default class YtrawlPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window._settings = settings; // keep alive
        const page = new Adw.PreferencesPage({ title: 'General' });

        // General
        const general = groupRow({ title: 'General' });
        general.add(entryRow({
            title: 'Download directory',
            subtitle: 'Where media lands. Empty uses ~/Downloads.',
            settings,
            key: 'download-dir',
            placeholder: '~/Downloads',
            validate: (value) => Model.validateDownloadDirectory(value, GLib.get_home_dir()),
        }));
        general.add(switchRow({
            title: 'Read URL from clipboard on open',
            settings,
            key: 'auto-clipboard',
        }));
        general.add(switchRow({
            title: 'Extract pasted URL automatically',
            settings,
            key: 'auto-extract-clipboard',
        }));
        general.add(switchRow({
            title: 'Clear input after download',
            settings,
            key: 'clear-input-after-download',
        }));
        general.add(switchRow({
            title: 'Stop queue after a failed download',
            subtitle: 'Keep remaining queued items until you choose Run queue again.',
            settings,
            key: 'stop-on-queue-error',
        }));
        general.add(switchRow({
            title: 'Skip already-downloaded media',
            subtitle: 'yt-dlp download archive',
            settings,
            key: 'use-archive',
        }));
        general.add(switchRow({
            title: 'Reduce motion',
            subtitle: 'Turns off the pulsing busy/extracting animation',
            settings,
            key: 'reduce-motion',
        }));
        general.add(comboRow({
            title: 'After download',
            settings,
            key: 'post-download-action',
            options: [
                { value: 'nothing', label: 'Nothing' },
                { value: 'copy', label: 'Copy path' },
                { value: 'open', label: 'Open folder' },
                { value: 'openFile', label: 'Open file' },
            ],
        }));
        general.add(comboRow({
            title: 'Default audio format',
            settings,
            key: 'audio-format',
            options: [
                { value: 'best', label: 'Best' },
                { value: 'mp3', label: 'MP3' },
                { value: 'opus', label: 'Opus' },
                { value: 'm4a', label: 'M4A' },
            ],
        }));
        general.add(comboRow({
            title: 'Playlist download limit',
            settings,
            key: 'playlist-limit',
            options: [
                { value: 'all', label: 'All items' },
                { value: '1', label: 'First item only' },
                { value: '5', label: 'First 5 items' },
                { value: '10', label: 'First 10 items' },
                { value: '20', label: 'First 20 items' },
            ],
        }));
        page.add(general.group);

        // History and privacy.
        const privacy = groupRow({ title: 'History & Privacy' });
        for (const row of historyPrivacyRows(settings)) privacy.add(row);
        page.add(privacy.group);

        // Media
        const media = groupRow({ title: 'Media' });
        media.add(switchRow({
            title: 'Save thumbnail image',
            subtitle: 'JPG saved next to the download',
            settings,
            key: 'download-thumbnail',
        }));
        media.add(switchRow({
            title: 'Embed thumbnail into file metadata',
            settings,
            key: 'embed-thumbnail',
        }));
        media.add(switchRow({
            title: 'Embed subtitles into video',
            settings,
            key: 'embed-subs',
        }));
        media.add(switchRow({
            title: 'Save subtitle file',
            subtitle: 'Writes a separate .srt/.vtt, independent of embedding',
            settings,
            key: 'write-subs-file',
        }));
        media.add(switchRow({
            title: 'Include auto-generated captions',
            settings,
            key: 'include-auto-subs',
        }));
        media.add(switchRow({
            title: 'Prefer DRC audio',
            subtitle: 'YouTube “Stable Volume”',
            settings,
            key: 'prefer-drc',
        }));
        page.add(media.group);

        // SponsorBlock
        const sb = groupRow({ title: 'SponsorBlock' });
        sb.add(switchRow({
            title: 'Skip sponsor segments',
            settings,
            key: 'sponsor-block',
        }));
        const sbCats = [
            ['sponsor', 'Sponsor'],
            ['selfpromo', 'Self-promo'],
            ['interaction', 'Interaction'],
            ['intro', 'Intro'],
            ['outro', 'Outro'],
            ['preview', 'Preview'],
            ['filler', 'Filler'],
            ['music_offtopic', 'Non-music'],
        ];
        for (const [value, label] of sbCats) {
            const toggle = new Gtk.Switch();
            const sync = () => {
                const list = settings.get_strv('sponsor-block-categories');
                toggle.set_active(list.includes(value));
            };
            const flip = () => {
                const list = settings.get_strv('sponsor-block-categories');
                const next = toggle.get_active()
                    ? [...list, value]
                    : list.filter(v => v !== value);
                settings.set_strv('sponsor-block-categories', next);
            };
            toggle.connect('notify::active', flip);
            settings.connect('changed::sponsor-block-categories', sync);
            sync();
            const row = new Adw.ActionRow({ title: label, activatable_widget: toggle });
            row.add_suffix(toggle);
            sb.add(row);
        }
        page.add(sb.group);

        // Network & cookies
        const net = groupRow({ title: 'Network & cookies' });
        net.add(entryRow({
            title: 'Proxy URL',
            settings,
            key: 'proxy',
            placeholder: 'http://user:pass@host:port',
        }));
        net.add(entryRow({
            title: 'Rate limit',
            subtitle: 'Optional positive rate, e.g. 5M or 500K',
            settings,
            key: 'rate-limit',
            placeholder: '5M',
            validate: (value) => {
                const rate = value.trim();
                return rate && (!/^\\d+(?:\\.\\d+)?(?:[KMGTPEZY](?:i?B)?)?$/i.test(rate) || Number.parseFloat(rate) <= 0)
                    ? 'Use a positive rate such as 5M or 500K, or leave empty.'
                    : '';
            },
        }));
        net.add(entryRow({
            title: 'Concurrent fragments',
            subtitle: 'Optional positive integer; empty uses yt-dlp default',
            settings,
            key: 'concurrent-fragments',
            placeholder: '4',
            validate: (value) => {
                const count = value.trim();
                return count && (!/^\\d+$/.test(count) || Number(count) < 1)
                    ? 'Use a positive whole number, or leave empty.'
                    : '';
            },
        }));
        net.add(comboRow({
            title: 'Cookies from browser',
            settings,
            key: 'cookies-from-browser',
            options: [
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
            ],
        }));
        net.add(entryRow({
            title: 'Cookies profile',
            subtitle: 'Optional profile name or config path',
            settings,
            key: 'cookies-profile',
        }));
        net.add(entryRow({
            title: 'Cookies file path',
            subtitle: 'Netscape format',
            settings,
            key: 'cookies',
        }));
        page.add(net.group);

        // Output
        const out = groupRow({ title: 'Output' });
        out.add(entryRow({
            title: 'Output template',
            subtitle: 'Default: %(title)s.%(ext)s',
            settings,
            key: 'output-template',
            placeholder: '%(title)s.%(ext)s',
        }));
        out.add(entryRow({
            title: 'Extra yt-dlp arguments',
            subtitle: 'Space separated',
            settings,
            key: 'custom-args',
        }));
        out.add(entryRow({
            title: 'Custom format selector',
            settings,
            key: 'custom-format-selector',
        }));
        page.add(out.group);

        window.add(page);
    }
}