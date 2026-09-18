// SPDX-License-Identifier: MIT
// Dynamic theme support: reads ~/.config/matugen/matugen-colors.css the same
// way update-checker@local / github-notifier@local do, and produces an
// override stylesheet for Ytrawl's widgets. Falls back to a readable dark
// palette when matugen isn't present.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const FALLBACK = {
    background: '#141311',
    surface: '#1a1917',
    surface_variant: '#262522',
    surface_container: '#211f1d',
    surface_container_low: '#1d1c1a',
    surface_container_high: '#2b2926',
    surface_container_highest: '#35322e',
    on_surface: '#e6e2dd',
    on_surface_variant: '#cac6c1',
    primary: '#cfc6ab',
    on_primary: '#35301d',
    primary_container: '#4c4732',
    on_primary_container: '#ebe2c6',
    secondary: '#cfc5bd',
    on_secondary: '#332f2a',
    secondary_container: '#4c463f',
    on_secondary_container: '#e9e1d8',
    tertiary: '#d6bdca',
    on_tertiary: '#382933',
    tertiary_container: '#514049',
    on_tertiary_container: '#f0dae5',
    error: '#ffb4ab',
    error_container: '#5c3d38',
    on_error_container: '#ffdad5',
    outline: '#8f8b85',
    outline_variant: '#4a4743',
    scrim: '#000000',
};

export function loadMatugenColors() {
    const path = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'matugen', 'matugen-colors.css']);
    try {
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null)) return Object.assign({}, FALLBACK);
        const [, contents] = file.load_contents(null);
        const text = contents ? new TextDecoder().decode(contents) : '';
        const map = {};
        const re = /--([\w_]+)\s*:\s*([^;]+);/g;
        let m;
        while ((m = re.exec(text)) !== null) map[m[1]] = m[2].trim();
        const get = k => map[k] || FALLBACK[k];
        return {
            background: get('background'),
            surface: get('surface'),
            surface_variant: get('surface_variant'),
            surface_container: get('surface_container'),
            surface_container_low: get('surface_container_low'),
            surface_container_high: get('surface_container_high'),
            surface_container_highest: get('surface_container_highest'),
            on_surface: get('on_surface'),
            on_surface_variant: get('on_surface_variant'),
            primary: get('primary'),
            on_primary: get('on_primary'),
            primary_container: get('primary_container'),
            on_primary_container: get('on_primary_container'),
            secondary: get('secondary'),
            on_secondary: get('on_secondary'),
            secondary_container: get('secondary_container'),
            on_secondary_container: get('on_secondary_container'),
            tertiary: get('tertiary'),
            on_tertiary: get('on_tertiary'),
            tertiary_container: get('tertiary_container'),
            on_tertiary_container: get('on_tertiary_container'),
            error: get('error'),
            error_container: get('error_container'),
            on_error_container: get('on_error_container'),
            outline: get('outline'),
            outline_variant: get('outline_variant'),
            scrim: get('scrim'),
        };
    } catch (e) {
        return Object.assign({}, FALLBACK);
    }
}

export function buildYtrawlCss(c) {
    const RGBA = (hex, alpha) => hexToRgba(hex, alpha);
    return `
.ytrawl-menu { min-width: 400px; }

/* ---- surface / container layers ----------------------------------- */
.ytrawl-panel,
.ytrawl-root { background-color: transparent; }
.ytrawl-content { spacing: 6px; }

/* ---- entry --------------------------------------------------------- */
.ytrawl-entry {
    background-color: ${c.surface_container};
    border-color: ${c.outline_variant};
    color: ${c.on_surface};
}
.ytrawl-entry:focus { border-color: ${c.primary}; }
.ytrawl-entry .st-entry-cursor { border-color: ${c.primary}; }
.ytrawl-icon-btn { color: ${c.on_surface_variant}; transition-duration: 100ms; border: 1px solid transparent; }
.ytrawl-icon-btn:hover { background-color: ${RGBA(c.on_surface, 0.08)}; color: ${c.on_surface}; }
.ytrawl-icon-btn:focus {
    background-color: ${RGBA(c.on_surface, 0.08)};
    color: ${c.on_surface};
    border-color: ${c.primary};
}
.ytrawl-icon-btn:active { background-color: ${RGBA(c.primary, 0.18)}; }

/* ---- hint / status -------------------------------------------------*/
.ytrawl-hint { color: ${c.tertiary}; font-size: 11px; }
.ytrawl-hint-dim { color: ${c.on_surface_variant}; font-size: 11px; }
.ytrawl-hint-ok { color: ${c.primary}; font-size: 11px; }
.ytrawl-hint-bad { color: ${c.error}; font-size: 11px; }
.ytrawl-extracting { color: ${c.tertiary}; }
.ytrawl-caption {
    color: ${c.secondary};
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.2px;
}

/* ---- media card — hero, distinct from everything else -------------- */
.ytrawl-card {
    background-color: ${c.primary_container};
    border-color: transparent;
    color: ${c.on_primary_container};
    border-radius: 12px;
}
.ytrawl-title { color: ${c.on_primary_container}; font-weight: 600; font-size: 13px; }
.ytrawl-uploader { color: ${hexToRgba(c.on_primary_container, 0.8)}; font-size: 11px; }
.ytrawl-duration {
    color: ${c.on_primary_container};
    background-color: ${RGBA(c.scrim, 0.45)};
}
.ytrawl-thumb-box {
    background-color: ${RGBA(c.scrim, 0.28)};
    border: 1px solid ${RGBA(c.on_primary_container, 0.18)};
}

/* ---- active-download card — surface container, not hero ------------ */
.ytrawl-active-card {
    background-color: ${c.surface_container};
    border-color: ${c.outline_variant};
    border-radius: 12px;
}
.ytrawl-active-card .ytrawl-title,
.ytrawl-active-card .ytrawl-meta {
    color: ${c.primary};
    font-weight: 700;
    letter-spacing: 1px;
}
.ytrawl-active-card .ytrawl-meta-bad { color: ${c.error}; }

/* ---- pills / buttons ---------------------------------------------- */
.ytrawl-pill {
    background-color: ${c.surface_container_high};
    color: ${c.on_surface};
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 12px;
    transition-duration: 100ms;
    border: 1px solid transparent;
}
.ytrawl-pill:hover { background-color: ${c.surface_container_highest}; }
.ytrawl-pill:focus { background-color: ${c.surface_container_highest}; border-color: ${c.primary}; }
.ytrawl-pill:checked {
    background-color: ${c.primary};
    color: ${c.on_primary};
    font-weight: 600;
}

.ytrawl-primary {
    background-color: ${c.primary};
    color: ${c.on_primary};
    border-radius: 10px;
    padding: 8px 16px;
    font-weight: 600;
    transition-duration: 120ms;
    border: 1px solid transparent;
}
.ytrawl-primary:hover { background-color: ${c.tertiary}; color: ${c.on_tertiary}; }
.ytrawl-primary:focus { background-color: ${c.tertiary}; color: ${c.on_tertiary}; border-color: ${c.on_tertiary}; }
.ytrawl-primary:insensitive,
.ytrawl-primary:disabled { opacity: 0.5; }

.ytrawl-ghost {
    background-color: ${c.surface_container_high};
    color: ${c.on_surface};
    border-radius: 10px;
    padding: 8px 16px;
    border: 1px solid transparent;
}
.ytrawl-ghost:hover { background-color: ${c.secondary_container}; color: ${c.on_secondary_container}; }
.ytrawl-ghost:focus {
    background-color: ${c.secondary_container};
    color: ${c.on_secondary_container};
    border-color: ${c.primary};
}

/* ---- accordion ------------------------------------------------------ */
.ytrawl-accordion-header { border-radius: 10px; padding: 8px 10px; margin-top: 2px; border: 1px solid transparent; }
.ytrawl-accordion-header:hover { background-color: ${c.surface_container}; }
.ytrawl-accordion-header:focus { background-color: ${c.surface_container}; border-color: ${c.primary}; }
.ytrawl-accordion-title { color: ${c.on_surface}; font-weight: 600; font-size: 13px; }

/* ---- toggles --------------------------------------------------------- */
.ytrawl-toggle-label { color: ${c.on_surface}; font-size: 13px; }
.ytrawl-toggle-desc { color: ${c.on_surface_variant}; font-size: 11px; }
.ytrawl-switch-fallback { background-color: ${c.outline_variant}; }
.ytrawl-switch-fallback:checked { background-color: ${c.primary}; }

/* ---- dropdown -------------------------------------------------------- */
.ytrawl-dropdown {
    background-color: ${c.surface_container};
    border-color: ${c.outline_variant};
    color: ${c.on_surface};
}
.ytrawl-dropdown:hover { background-color: ${c.surface_container_high}; }
.ytrawl-dropdown:focus { background-color: ${c.surface_container_high}; border-color: ${c.primary}; }
.ytrawl-dropdown-label { color: ${c.on_surface}; }
.ytrawl-dropdown-list {
    background-color: ${c.surface_container_high};
    border-color: ${c.outline_variant};
}
.ytrawl-dropdown-item { color: ${c.on_surface}; }
.ytrawl-dropdown-item:hover,
.ytrawl-dropdown-item:focus,
.ytrawl-dropdown-item:checked {
    background-color: ${c.primary};
    color: ${c.on_primary};
}

/* ---- progress -------------------------------------------------------- */
.ytrawl-progress-track { background-color: ${c.surface_variant}; }
.ytrawl-progress-fill { background-color: ${c.primary}; }

/* ---- raw log ---------------------------------------------------------- */
.ytrawl-rawlog {
    background-color: ${c.scrim};
    border-color: ${c.outline_variant};
}
.ytrawl-rawlog-text { color: ${c.on_surface_variant}; }

/* ---- queue / playlist / history --------------------------------------- */
.ytrawl-queue {
    background-color: ${c.surface_container};
    border-color: ${c.outline_variant};
}
.ytrawl-queue-item {
    background-color: ${c.surface_container};
    border-color: ${c.outline_variant};
}
.ytrawl-queue-text { color: ${c.on_surface}; font-size: 12px; }
.ytrawl-playlist {
    background-color: ${c.secondary_container};
    border-radius: 10px;
    color: ${c.on_secondary_container};
}
.ytrawl-playlist .ytrawl-caption { color: ${c.on_secondary_container}; }
.ytrawl-history-item:hover { background-color: ${c.surface_container_high}; }
.ytrawl-history-link { color: ${c.on_surface_variant}; }
.ytrawl-history-link:hover { color: ${c.on_surface}; }

/* ---- error ------------------------------------------------------------ */
.ytrawl-error {
    background-color: ${c.error_container};
    border-color: ${c.error};
    color: ${c.on_error_container};
}
.ytrawl-error-text { color: ${c.on_error_container}; font-weight: 500; }
`;
}