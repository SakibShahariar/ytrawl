// SPDX-License-Identifier: MIT
// Root popup widget and scrollable content container.

export function buildPanelRoot(panel, {UI, St, Clutter, PANEL_WIDTH}) {
    const root = UI.stWidget(St.BoxLayout, {
        vertical: true,
        width: PANEL_WIDTH,
        style_class: 'ytrawl-panel',
    });

    panel._scroll = UI.stWidget(St.ScrollView, {
        x_expand: true,
        y_expand: true,
        style_class: 'ytrawl-scroll',
    });
    panel._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

    const content = UI.stWidget(St.BoxLayout, {
        vertical: true,
        style_class: 'ytrawl-content',
        width: PANEL_WIDTH - 24,
        y_align: Clutter.ActorAlign.START,
    });

    panel._content = content;
    panel._scroll.add_child(content);
    root.add_child(panel._scroll);

    panel._buildSections(content);

    // Key handling on the root catches Ctrl+ shortcuts while a button or
    // switch holds keyboard focus.
    UI.connectSafe(root, 'key-press-event', (actor, event) => panel._onRootKey(actor, event));

    return root;
}
