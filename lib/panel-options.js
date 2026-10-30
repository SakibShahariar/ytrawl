// SPDX-License-Identifier: MIT
// Focused builders for SponsorBlock and post-download action settings.

export function createAfterDownloadSection(UI, Model, controller) {
    const body = UI.row({ vertical: true });
    const row = UI.row({ vertical: false });
    const buttons = {};
    for (const action of Model.POST_DOWNLOAD_ACTIONS) {
        const button = UI.pillButton({
            label: action.label,
            onActivate: () => controller.setStr('post-download-action', action.value),
        });
        buttons[action.value] = button;
        row.add_child(button);
    }
    body.add_child(row);
    return { body, row, buttons };
}

export function createSponsorSection(UI, Model, controller) {
    const body = UI.row({ vertical: true });
    const toggle = UI.toggleRow({
        labelText: 'Skip sponsor segments',
        desc: 'Via SponsorBlock community data',
        onToggled: (on) => controller.setBool('sponsor-block', on),
    });
    body.add_child(toggle.actor);
    body.add_child(UI.sectionTitle('SEGMENTS TO REMOVE'));

    const flow = UI.row({ vertical: true });
    const categories = {};
    for (const category of Model.SPONSOR_CATEGORIES) {
        const categoryToggle = UI.toggleRow({
            labelText: Model.sponsorCategoryLabel(category),
            onToggled: (on) => controller.toggleSponsorCategory(category, on),
        });
        categories[category] = categoryToggle;
        flow.add_child(categoryToggle.actor);
    }
    body.add_child(flow);
    return { body, toggle, flow, categories };
}


export function buildSubsBody(panel, UI) {
    const body = UI.row({ vertical: true });
    panel._subsEmbed = UI.toggleRow({
        labelText: 'Embed subtitles into video',
        onToggled: (on) => panel.c.setBool('embed-subs', on),
    });
    body.add_child(panel._subsEmbed.actor);
    panel._subsWriteFile = UI.toggleRow({
        labelText: 'Save subtitle file',
        desc: 'Writes subtitles as a separate .srt/.vtt file, independent of embedding',
        onToggled: (on) => panel.c.setBool('write-subs-file', on),
    });
    body.add_child(panel._subsWriteFile.actor);
    panel._subsAuto = UI.toggleRow({
        labelText: 'Include auto-generated captions',
        onToggled: (on) => panel.c.setBool('include-auto-subs', on),
    });
    body.add_child(panel._subsAuto.actor);
    const langHeader = UI.sectionTitle('LANGUAGE');
    panel._subsLangText = langHeader;
    body.add_child(langHeader);
    panel._subsDropdown = UI.dropdown({
        onChanged: (value) => panel.c.setStr('sub-language', value),
    });
    body.add_child(panel._subsDropdown.actor);
    return body;
}

export function buildThumbBody(panel, UI) {
    const body = UI.row({ vertical: true });
    panel._thumbSave = UI.toggleRow({
        labelText: 'Save thumbnail image',
        desc: 'JPG saved next to the download',
        onToggled: (on) => panel.c.setBool('download-thumbnail', on),
    });
    body.add_child(panel._thumbSave.actor);
    panel._thumbEmbed = UI.toggleRow({
        labelText: 'Embed thumbnail into file metadata',
        onToggled: (on) => panel.c.setBool('embed-thumbnail', on),
    });
    body.add_child(panel._thumbEmbed.actor);
    return body;
}
