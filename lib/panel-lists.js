// SPDX-License-Identifier: MIT
// History and queued-job list rendering for the top-bar popup panel.

export function renderHistory(UI, St, controller, list, history) {
    list.destroy_all_children();
    const shown = history.slice().reverse().slice(0, 10);
    for (const url of shown) {
        const item = UI.row({ vertical: false, styleClass: 'ytrawl-history-item' });
        const btn = UI.stWidget(St.Button, {
            label: url,
            style_class: 'ytrawl-history-link',
            x_expand: true,
            can_focus: true,
        });
        UI.connectSafe(btn, 'clicked', () => {
            controller.currentUrl = url;
            controller.startExtraction();
        });
        const remove = UI.iconButton({
            icon: 'window-close-symbolic',
            tooltip: 'Remove from history',
            onActivate: () => controller.removeHistoryItem(url),
        });
        try { remove.x_expand = false; } catch (e) { /* ignore */ }
        item.add_child(btn);
        item.add_child(remove);
        list.add_child(item);
    }
}

export function renderQueue(UI, controller, wrap, list) {
    if (controller.queue.length === 0) {
        wrap.visible = false;
        list.destroy_all_children();
        return;
    }

    wrap.visible = true;
    list.destroy_all_children();
    controller.queue.forEach((job, idx) => {
        const item = UI.row({ vertical: false, styleClass: 'ytrawl-queue-item' });
        const title = UI.label(job.title || job.url, 'ytrawl-queue-text');
        title.clutter_text.ellipsize = 2;
        const mode = UI.caption(job.mode || '');
        try { mode.x_expand = false; } catch (e) { /* ignore */ }
        const remove = UI.iconButton({
            icon: 'window-close-symbolic',
            tooltip: 'Remove from queue',
            onActivate: () => controller.removeQueued(idx),
        });
        try { remove.x_expand = false; } catch (e) { /* ignore */ }
        item.add_child(title);
        item.add_child(mode);
        item.add_child(remove);
        list.add_child(item);
    });
}
