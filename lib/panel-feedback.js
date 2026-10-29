// SPDX-License-Identifier: MIT
// Input guidance and reduced-motion-aware busy indicator behavior.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

export function updateHint(panel, ) {
        const c = panel.c;
        const trimmed = c.currentUrl.trim();
        if (c.extracting || c.downloadInProgress || c.activeStatus === 'preparing') {
            panel._hint.visible = false;
            return;
        }
        panel._hint.visible = true;
        let text;
        let color;
        if (trimmed === '') {
            text = 'Paste a URL or search YouTube — press Enter';
            color = 'ytrawl-hint-dim';
        } else if (c.normalizedUrl === '' && !c.isSearchQuery) {
            text = 'Not a URL — paste the link or search';
            color = 'ytrawl-hint-bad';
        } else if (c.mediaInfo) {
            text = 'Press Enter to download';
            color = 'ytrawl-hint-ok';
        } else if (c.pastedFromClipboard) {
            text = 'Pasted from clipboard — press Enter to extract';
            color = 'ytrawl-hint-ok';
        } else if (c.isSearchQuery) {
            text = 'Press Enter to search YouTube';
            color = 'ytrawl-hint-ok';
        } else {
            text = 'Press Enter to extract';
            color = 'ytrawl-hint-ok';
        }
        panel._hint.text = text;
        panel._hint.style_class = color;
    }
export function setPulse(panel, actor, run) {
        if (!actor) return;
        if (run && panel.c.b('reduce-motion')) {
            // Respect "reduce motion": convey the busy state as a static
            // dim, no animation, no timers.
            actor.opacity = 140;
            return;
        }
        if (run) {
            if (actor._ytrawl_pulse) return;
            try {
                if (typeof actor.create_transition === 'function' &&
                    typeof actor.get_transition === 'function') {
                    if (actor.get_transition('ytrawl-pulse')) return;
                    const t = actor.create_transition('ytrawl-pulse');
                    t.property = 'opacity';
                    t.from = 0.45;
                    t.to = 1.0;
                    t.duration = 600;
                    t.progress_mode = Clutter.AnimationMode.EASE_IN_OUT_QUAD;
                    t.repeat_count = -1;
                    t.round_trip = true;
                    t.run();
                    actor._ytrawl_pulse = { kind: 'transition' };
                    return;
                }
            } catch (e) { /* fall through to blink */ }
            let up = false;
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                actor.opacity = up ? 255 : 90;
                up = !up;
                return GLib.SOURCE_CONTINUE;
            });
            actor._ytrawl_pulse = { kind: 'timeout', id };
        } else {
            const p = actor._ytrawl_pulse;
            delete actor._ytrawl_pulse;
            try { if (typeof actor.remove_transition === 'function') actor.remove_transition('ytrawl-pulse'); } catch (e) { /* ignore */ }
            if (p && p.kind === 'timeout') {
                try { GLib.source_remove(p.id); } catch (e) { /* ignore */ }
            }
            actor.opacity = 255;
        }
    }

