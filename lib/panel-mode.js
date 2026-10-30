// SPDX-License-Identifier: MIT
// Download mode, video quality, and audio format controls.

export function buildModeBody(panel, UI, Model) {
    const body = UI.row({ vertical: true });

    const modeRow = UI.row({ vertical: false });
    panel._modeButtons = {};
    for (const mode of ['video', 'audio', 'custom']) {
        const button = UI.pillButton({
            label: Model.modeLabel(mode),
            onActivate: () => panel.c.setDownloadMode(mode),
        });
        panel._modeButtons[mode] = button;
        modeRow.add_child(button);
    }
    body.add_child(modeRow);

    // Quality (video mode) — dropdown so Best + all heights never overflow.
    panel._qualitySection = UI.row({ vertical: true });
    body.add_child(panel._qualitySection);
    panel._qualitySection.visible = false;
    panel._qualityDropdown = UI.dropdown({
        onChanged: (value) => panel.c.setVideoQuality(value),
    });
    panel._qualitySection.add_child(panel._qualityDropdown.actor);

    // Audio mode
    panel._audioSection = UI.row({ vertical: true });
    body.add_child(panel._audioSection);
    panel._audioSection.visible = false;

    const audioHeader = UI.sectionTitle('AUDIO FORMAT');
    panel._audioSection.add_child(audioHeader);
    const formatRow = UI.row({ vertical: false });
    panel._fmtButtons = {};
    for (const format of Model.AUDIO_FORMATS) {
        const button = UI.pillButton({
            label: format === 'best' ? 'Best' : format.toUpperCase(),
            onActivate: () => panel.c.setAudioFormat(format),
        });
        panel._fmtButtons[format] = button;
        formatRow.add_child(button);
    }
    panel._audioSection.add_child(formatRow);

    panel._trackHeader = UI.sectionTitle('TRACK');
    panel._audioSection.add_child(panel._trackHeader);
    panel._trackDropdown = UI.dropdown({
        onChanged: (value) => panel.c.setAudioLanguage(value),
    });
    panel._audioSection.add_child(panel._trackDropdown.actor);

    // Custom mode
    panel._customField = UI.entry({
        placeholder: 'yt-dlp format selector (e.g. bestvideo[height<=1080]+bestaudio)',
        text: panel.c.s('custom-format-selector'),
        onChanged: (text) => panel.c.setStr('custom-format-selector', text),
    });
    panel._customField.style = 'flex-grow: 1;';
    panel._customField.visible = false;
    body.add_child(panel._customField);

    return body;
}
