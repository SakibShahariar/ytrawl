// SPDX-License-Identifier: MIT
// Chapter accordion for the media card, separated from the main panel renderer.

export function createChapterSection({ UI, Model }) {
    const list = UI.row({ vertical: true, styleClass: 'ytrawl-chapters-list' });
    const accordion = UI.accordion({
        titleText: 'Chapters',
        content: list,
    });
    accordion.actor.visible = false;

    return {
        accordion,
        render(chapters) {
            const items = Array.isArray(chapters) ? chapters : [];
            accordion.actor.visible = items.length > 0;
            list.destroy_all_children();
            for (const chapter of items) {
                const row = UI.row({ vertical: false, styleClass: 'ytrawl-chapter-row' });
                const timestamp = UI.label(Model.formatDuration(chapter.startTime), 'ytrawl-meta');
                timestamp.style = 'min-width: 54px;';
                const title = UI.label(chapter.title, 'ytrawl-chapter-title');
                title.clutter_text.ellipsize = 2;
                title.x_expand = true;
                row.add_child(timestamp);
                row.add_child(title);
                list.add_child(row);
            }
        },
    };
}
