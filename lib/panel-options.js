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
