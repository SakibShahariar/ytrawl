// SPDX-License-Identifier: MIT
// Small St widget factories used across the panel.

import St from 'gi://St';
import Clutter from 'gi://Clutter';

export function label(text, styleClass = '', style = '') {
    const l = stWidget(St.Label, {
        text: String(text ?? ''),
        style_class: styleClass,
        y_expand: true,
        x_expand: true,
    });
    if (style) l.style = style;
    return l;
}

export function caption(text) {
    const l = label(text, 'ytrawl-caption');
    try { l.clutter_text.ellipsize = 3; } catch (e) { /* ignore */ }
    return l;
}

const SAFE_ST_PROPS = Object.freeze([
    'text', 'label', 'style_class', 'can_focus', 'reactive',
    'x_expand', 'y_expand', 'x_align', 'y_align', 'vertical',
    'width', 'state', 'icon_name', 'icon_size',
]);

export function stWidget(StType, props) {
    const safe = {};
    for (const k of Object.keys(props || {})) {
        if (SAFE_ST_PROPS.includes(k))
            safe[k] = props[k];
    }
    const isCtor = (c) => typeof c === 'function';
    if (isCtor(StType) && StType === St.Label)
        return new St.Label(safe);
    if (isCtor(StType) && StType === St.Button)
        return new St.Button(safe);
    if (isCtor(StType) && StType === St.Icon)
        return new St.Icon(safe);
    if (isCtor(StType) && StType === St.BoxLayout)
        return new St.BoxLayout(safe);
    if (isCtor(StType) && StType === St.ScrollView)
        return new St.ScrollView(safe);
    if (isCtor(StType) && StType === St.Entry)
        return new St.Entry(safe);
    return new St.Widget(safe);
}

export function keySymbol(event) {
    try {
        if (event && typeof event.get_key_symbol === 'function')
            return event.get_key_symbol();
    } catch (e) { /* ignore */ }
    try {
        if (event && 'keyval' in event)
            return event.keyval;
    } catch (e) { /* ignore */ }
    return 0;
}

export function isEnter(sym) {
    return sym === 0xff0d || sym === 0xff8d ||
        sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter;
}

export function isEscape(sym) {
    return sym === 0xff1b || sym === Clutter.KEY_Escape;
}

export function connectSafe(obj, signal, cb) {
    try {
        obj.connect(signal, cb);
    } catch (e) {
        // signal may not exist in this St fork; ignore
    }
}

export function setTooltip(actor, text) {
    if (!actor || !text) return;
    if (typeof actor.set_tooltip_string === 'function') {
        actor.set_tooltip_string(text);
    } else if (typeof actor.set_tooltip_text === 'function') {
        actor.set_tooltip_text(text);
    } else if ('tooltip_text' in actor) {
        try { actor.tooltip_text = text; } catch (e) { /* ignore */ }
    }
}

// Screen readers don't get tooltip text, so anything we set as a tooltip
// should also become the accessible name unless the caller overrides it.
export function setAccessibleName(actor, text) {
    if (!actor || !text) return;
    try { actor.accessible_name = text; } catch (e) { /* ignore */ }
}

export function row({ vertical = false, styleClass = '', spacing = 10, x_expand = true } = {}) {
    const box = stWidget(St.BoxLayout, {
        vertical,
        style_class: styleClass,
        x_expand,
    });
    if (spacing > 0)
        box.style = `spacing: ${spacing}px;`;
    return box;
}

export function sectionTitle(text) {
    return caption(text);
}

export function pillButton({ label, onActivate, tooltip, selected = false }) {
    const style = 'ytrawl-pill' + (selected ? ' selected' : '');
    const btn = stWidget(St.Button, { label, style_class: style, can_focus: true });
    if (tooltip) setTooltip(btn, tooltip);
    if (onActivate) onClickSafe(btn, onActivate);
    return btn;
}

export function primaryButton({ label, onActivate, tooltip }) {
    const btn = stWidget(St.Button, { label, style_class: 'ytrawl-primary', x_expand: true, can_focus: true });
    if (tooltip) setTooltip(btn, tooltip);
    if (onActivate) onClickSafe(btn, onActivate);
    return btn;
}

export function ghostButton({ label, onActivate, tooltip }) {
    const btn = stWidget(St.Button, { label, style_class: 'ytrawl-ghost', x_expand: true, can_focus: true });
    if (tooltip) setTooltip(btn, tooltip);
    if (onActivate) onClickSafe(btn, onActivate);
    return btn;
}

export function onClickSafe(btn, cb, { debounceMs = 300 } = {}) {
    if (!cb) return;
    let last = 0;
    const fire = () => {
        const now = Date.now();
        if (now - last < debounceMs) return Clutter.EVENT_STOP;
        last = now;
        cb();
        return Clutter.EVENT_PROPAGATE;
    };
    connectSafe(btn, 'clicked', fire);
    connectSafe(btn, 'button-press-event', fire);
}

export function iconButton({ icon, tooltip, accessibleName, onActivate, styleClass = 'ytrawl-icon-btn', x_expand = false }) {
    const btn = stWidget(St.Button, { style_class: styleClass, can_focus: true, x_expand });
    btn.add_child(stWidget(St.Icon, {
        icon_name: icon,
        style_class: 'popup-menu-icon',
        icon_size: 16,
    }));
    if (tooltip) setTooltip(btn, tooltip);
    // Icon-only buttons have no visible label, so a screen reader needs an
    // explicit accessible name — tooltip text alone isn't reliably exposed
    // to AT-SPI. Default to the tooltip when a distinct name isn't given.
    setAccessibleName(btn, accessibleName || tooltip);
    onClickSafe(btn, onActivate);
    return btn;
}

export function toggleRow({ labelText, desc = '', checked = false, onToggled }) {
    const box = row({ styleClass: 'ytrawl-toggle-row' });
    const vbox = row({ vertical: true, styleClass: 'ytrawl-toggle-text' });
    const tLabel = label(labelText, 'ytrawl-toggle-label');
    vbox.add_child(tLabel);
    if (desc) vbox.add_child(label(desc, 'ytrawl-toggle-desc'));
    let lock = false;
    let cur = !!checked;

    let sw;
    const hasNativeSwitch = typeof St.Switch === 'function';
    if (hasNativeSwitch) {
        sw = stWidget(St.Switch, { state: cur });
    } else {
        sw = stWidget(St.Button, { style_class: 'ytrawl-switch-fallback', can_focus: true, reactive: true });
    }

    const paint = (state) => {
        if (hasNativeSwitch) {
            try { sw.state = !!state; } catch (e) { /* ignore */ }
        } else {
            try {
                if (state) sw.add_style_pseudo_class('checked');
                else sw.remove_style_pseudo_class('checked');
            } catch (e) { /* ignore */ }
        }
    };
    paint(cur);

    if (hasNativeSwitch) {
        connectSafe(sw, 'notify::state', (actor) => {
            if (lock) return;
            cur = !!actor.state;
            if (onToggled) onToggled(cur);
        });
    } else {
        onClickSafe(sw, () => {
            cur = !cur;
            paint(cur);
            if (onToggled) onToggled(cur);
        });
    }

    box.add_child(vbox);
    box.add_child(sw);
    box.style = 'min-height: 40px;';

    return {
        actor: box,
        switch: sw,
        setChecked(state) {
            lock = true;
            cur = !!state;
            paint(cur);
            lock = false;
        },
    };
}

export function setPlaceholder(entry, text) {
    const t = text || '';
    if ('placeholder_text' in entry)
        entry.placeholder_text = t;
    else if ('hint_text' in entry)
        entry.hint_text = t;
}

export function entry({ placeholder = '', text = '', onActivate, onKeyDown, onCaptureKey, onChanged } = {}) {
    const e = stWidget(St.Entry, {
        text: String(text ?? ''),
        can_focus: true,
        style_class: 'ytrawl-entry',
        x_expand: true,
    });
    setPlaceholder(e, placeholder);
    if (onActivate) {
        let firing = false;
        const fire = () => {
            if (firing) return;
            firing = true;
            try { onActivate(); } finally { firing = false; }
        };
        connectSafe(e.clutter_text, 'activate', fire);
        connectSafe(e.clutter_text, 'key-press-event', (actor, event) => {
            const sym = keySymbol(event);
            if (isEnter(sym)) {
                fire();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }
    try { e.clutter_text.set_ellipsize(2); } catch (err) { /* ignore */ }
    if (onChanged) {
        connectSafe(e, 'notify::text', () => onChanged(e.text));
    }
    if (onKeyDown) connectSafe(e, 'key-press-event', onKeyDown);
    if (onCaptureKey) connectSafe(e, 'capture-event', onCaptureKey);
    return e;
}

export function progressBar() {
    const track = stWidget(St.Widget, { style_class: 'ytrawl-progress-track', x_expand: true });
    const fill = stWidget(St.Widget, { style_class: 'ytrawl-progress-fill' });
    track.add_child(fill);
    track.set_style('min-height: 8px;');
    fill.set_style('min-height: 8px;');
    fill.opacity = 0;
    return {
        actor: track,
        setFraction(f) {
            const pct = Math.max(0, Math.min(1, f || 0));
            try {
                fill.width = Math.max(0, (track.width || 0) * pct);
            } catch (e) {
                fill.width = 0;
            }
            fill.opacity = pct > 0 ? 255 : 0;
        },
    };
}

export function accordion({ titleText, valueText = '', content, defaultOpen = false, onToggleOpen }) {
    const box = row({ vertical: true, styleClass: 'ytrawl-accordion' });
    const header = stWidget(St.Button, { style_class: 'ytrawl-accordion-header', x_expand: true, can_focus: true });
    setAccessibleName(header, titleText);
    const hbox = row({ vertical: false });
    const hLabel = label(titleText, 'ytrawl-accordion-title');
    const vLabel = caption(valueText);
    const chevronIcon = stWidget(St.Icon, {
        icon_name: defaultOpen ? 'pan-down-symbolic' : 'pan-end-symbolic',
        style_class: 'popup-menu-icon',
        icon_size: 16,
    });
    const chevron = stWidget(St.Button, { style_class: 'ytrawl-chevron', can_focus: false });
    try { chevron.reactive = false; } catch (e) { /* ignore */ }
    chevron.add_child(chevronIcon);
    try { hLabel.x_expand = false; } catch (e) { /* ignore */ }
    try { vLabel.x_expand = false; } catch (e) { /* ignore */ }
    header.add_child(hbox);
    hbox.add_child(hLabel);
    const m = stWidget(St.BoxLayout, { x_expand: true });
    m.add_child(new St.Widget());
    hbox.add_child(m);
    hbox.add_child(vLabel);
    hbox.add_child(chevron);

    const body = row({ vertical: true });
    let open = !!defaultOpen;
    body.visible = open;
    body.opacity = open ? 255 : 0;

    const setOpen = (next) => {
        open = next;
        body.visible = open;
        body.opacity = open ? 255 : 0;
        chevronIcon.icon_name = open ? 'pan-down-symbolic' : 'pan-end-symbolic';
    };
    onClickSafe(header, () => {
        setOpen(!open);
        if (onToggleOpen) onToggleOpen(open);
    });

    if (content) {
        if (Array.isArray(content)) content.forEach(c => body.add_child(c));
        else body.add_child(content);
    }
    box.add_child(header);
    box.add_child(body);

    return {
        actor: box,
        body,
        setOpen,
        setValueText(text) {
            vLabel.text = String(text ?? '');
        },
    };
}

export function dropdown({ options = [], value = '', onChanged, placeholder = 'Select…' }) {
    const box = row({ vertical: true });
    const btn = stWidget(St.Button, {
        style_class: 'ytrawl-dropdown',
        x_expand: true,
        can_focus: true,
    });
    setAccessibleName(btn, placeholder);
    const labelBox = row({ vertical: false });
    const btnLabel = label(value || placeholder, 'ytrawl-dropdown-label');
    // Purely decorative — it sits inside `btn`, which is the actual
    // interactive target, so it shouldn't be its own tab stop.
    const chevronBtn = iconButton({
        icon: 'pan-down-symbolic',
        styleClass: 'ytrawl-chevron',
    });
    try { chevronBtn.can_focus = false; chevronBtn.reactive = false; } catch (e) { /* ignore */ }
    labelBox.add_child(btnLabel);
    labelBox.add_child(new St.Widget());
    labelBox.add_child(chevronBtn);
    btn.add_child(labelBox);

    let listBox = null;
    let open = false;
    let opted = options;

    const close = () => {
        open = false;
        if (listBox) listBox.destroy();
        listBox = null;
    };

    const focusItem = (idx) => {
        if (!listBox) return;
        const children = listBox.get_children();
        if (!children.length) return;
        const clamped = Math.max(0, Math.min(idx, children.length - 1));
        try { global.stage.set_key_focus(children[clamped]); } catch (e) { /* ignore */ }
    };

    // Up/Down/Home/End move the highlighted option; Escape closes and
    // returns focus to the trigger. Enter/Space activate an item via
    // St.Button's own key handling, so they need no extra wiring here.
    const onItemKey = (actor, event) => {
        const sym = event.get_key_symbol();
        if (!listBox) return Clutter.EVENT_PROPAGATE;
        const children = listBox.get_children();
        const idx = children.indexOf(actor);
        if (sym === Clutter.KEY_Down || sym === Clutter.KEY_KP_Down) {
            focusItem(idx + 1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Up || sym === Clutter.KEY_KP_Up) {
            focusItem(idx - 1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Home) {
            focusItem(0);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_End) {
            focusItem(children.length - 1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Escape) {
            close();
            try { global.stage.set_key_focus(btn); } catch (e) { /* ignore */ }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    };

    const rebuildOptions = () => {
        if (!open) return;
        listBox.destroy_all_children();
        for (const opt of opted) {
            const item = stWidget(St.Button, {
                label: opt.label,
                style_class: 'ytrawl-dropdown-item',
                x_expand: true,
                can_focus: true,
            });
            if (opt.value === value) item.add_style_pseudo_class('checked');
            onClickSafe(item, () => {
                if (onChanged) onChanged(opt.value, opt);
                close();
            });
            connectSafe(item, 'key-press-event', onItemKey);
            listBox.add_child(item);
        }
    };
    onClickSafe(btn, () => {
        open = !open;
        if (open) {
            if (!listBox) {
                listBox = row({ vertical: true, styleClass: 'ytrawl-dropdown-list' });
                box.add_child(listBox);
            }

            rebuildOptions();
            focusItem(0);
        } else {
            close();
        }
    });

    return {
        actor: box,
        close,
        setValue(v) {
            if (v !== value) {
                value = v;
                const match = opted.find(o => o.value === v);
                btnLabel.text = match ? match.label : (v || placeholder);
                if (open) rebuildOptions();
            }
        },
        setOptions(o) {
            opted = o;
            const match = o.find(x => x.value === value);
            btnLabel.text = match ? match.label : (value || placeholder);
            if (open) rebuildOptions();
        },
    };
}