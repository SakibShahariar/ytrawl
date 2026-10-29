// SPDX-License-Identifier: MIT
// Advanced preferences panel section, separated from the main panel renderer.

export function buildAdvancedBody(panel, {UI, Model, GLib}) {
        const body = UI.row({ vertical: true });
        const add = (w) => body.add_child(w);

        panel._rawLogToggle = UI.toggleRow({
            labelText: 'Show raw log',
            onToggled: (on) => {
                panel.c.showRawLog = on;
                panel.c._refreshUI();
            },
        });
        add(panel._rawLogToggle.actor);

        const clip = UI.toggleRow({
            labelText: 'Read URL from clipboard on open',
            onToggled: (on) => panel.c.setBool('auto-clipboard', on),
        });
        add(clip.actor);
        panel._autoClip = clip;

        const autoExtract = UI.toggleRow({
            labelText: 'Extract pasted URL automatically',
            onToggled: (on) => panel.c.setBool('auto-extract-clipboard', on),
        });
        add(autoExtract.actor);
        panel._autoExtract = autoExtract;

        const clearAfter = UI.toggleRow({
            labelText: 'Clear input after download',
            onToggled: (on) => panel.c.setBool('clear-input-after-download', on),
        });
        add(clearAfter.actor);
        panel._clearAfter = clearAfter;

        const archive = UI.toggleRow({
            labelText: 'Skip already-downloaded media',
            desc: 'yt-dlp download archive in your download folder',
            onToggled: (on) => panel.c.setBool('use-archive', on),
        });
        add(archive.actor);
        panel._archive = archive;

        const clearArchiveBtn = UI.ghostButton({
            label: 'Clear download archive',
            onActivate: () => panel.c.clearArchive(),
        });
        add(clearArchiveBtn);

        const reduceMotion = UI.toggleRow({
            labelText: 'Reduce motion',
            desc: 'Turns off the pulsing busy/extracting animation',
            onToggled: (on) => panel.c.setBool('reduce-motion', on),
        });
        add(reduceMotion.actor);
        panel._reduceMotion = reduceMotion;

        add(UI.sectionTitle('OUTPUT'));
        panel._templateField = UI.entry({
            placeholder: 'Output template (default: %(title)s.%(ext)s)',
            text: panel.c.s('output-template'),
            onChanged: (t) => panel.c.setStr('output-template', t),
        });
        add(panel._templateField);

        // Cookies
        add(UI.sectionTitle('COOKIES'));
        panel._cookiesBrowserDropdown = UI.dropdown({
            options: Model.BROWSER_OPTIONS,
            value: panel.c.s('cookies-from-browser'),
            onChanged: (v) => panel.c.setStr('cookies-from-browser', v),
        });
        add(panel._cookiesBrowserDropdown.actor);
        panel._cookiesProfileField = UI.entry({
            placeholder: 'Profile name or full config path (optional)',
            text: panel.c.s('cookies-profile'),
            onChanged: (t) => panel.c.setStr('cookies-profile', t),
        });
        panel._cookiesProfileField.style = 'flex-grow: 1;';
        add(panel._cookiesProfileField);
        panel._cookiesFileField = UI.entry({
            placeholder: 'Cookies file path (Netscape format)',
            text: panel.c.s('cookies'),
            onChanged: (t) => panel.c.setStr('cookies', t),
        });
        panel._cookiesFileField.style = 'flex-grow: 1;';
        add(panel._cookiesFileField);

        // Proxy / network
        add(UI.sectionTitle('NETWORK'));
        panel._proxyField = UI.entry({
            placeholder: 'Proxy URL',
            text: panel.c.s('proxy'),
            onChanged: (t) => panel.c.setStr('proxy', t),
        });
        panel._proxyField.style = 'flex-grow: 1;';
        add(panel._proxyField);

        const rateRow = UI.row({ vertical: false });
        panel._rateField = UI.entry({
            placeholder: 'Rate limit',
            text: panel.c.s('rate-limit'),
            onChanged: (t) => panel.c.setStr('rate-limit', t),
        });
        panel._rateField.style = 'flex-grow: 1;';
        panel._fragField = UI.entry({
            placeholder: 'Concurrent fragments',
            text: panel.c.s('concurrent-fragments'),
            onChanged: (t) => panel.c.setStr('concurrent-fragments', t),
        });
        panel._fragField.style = 'flex-grow: 1;';
        rateRow.add_child(panel._rateField);
        rateRow.add_child(panel._fragField);
        add(rateRow);

        add(UI.sectionTitle('EXTRA ARGS'));
        panel._customArgsField = UI.entry({
            placeholder: 'Extra yt-dlp arguments (space separated)',
            text: panel.c.s('custom-args'),
            onChanged: (t) => panel.c.setStr('custom-args', t),
        });
        panel._customArgsField.style = 'flex-grow: 1;';
        add(panel._customArgsField);

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
                panel.c._deps.resetSettings && panel.c._deps.resetSettings();
            },
        });
        panel._disarmReset = disarmReset;
        add(resetBtn);

        return body;
    }
