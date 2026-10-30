// SPDX-License-Identifier: MIT
// Active-download status and progress card rendering.

export function renderActiveCard(panel) {
    const c = panel.c;
    const status = c.activeStatus;
    panel._activeCard.visible = status !== '';

    if (status === '') return;

    panel._activeTitle.text = c.activeTitle || 'Transfer';

    const phrases = [
        'PULLING STREAMS', 'MUXING TRACKS', 'STITCHING SEGMENTS',
        'REWRITING PARTS', 'RESOLVING FORMATS', 'DEMUXING AUDIO',
    ];
    const meta = status === 'downloading'
        ? phrases[Math.floor(Date.now() / 2800) % phrases.length]
        : status === 'paused' ? 'PAUSED'
        : status === 'completed' ? 'FINISHED'
        : status === 'error' ? (c.activeError || 'ERROR')
        : status === 'cancelled' ? 'CANCELLED'
        : 'PREPARING…';
    panel._activeMeta.text = meta;
    panel._activeMeta.style_class = status === 'error' ? 'ytrawl-meta-bad' : 'ytrawl-meta';

    panel._retryBtn.visible = c.canRetryAsWebClient;
    panel._pauseBtn.visible = status === 'downloading';
    panel._resumeBtn.visible = status === 'paused';
    panel._cancelBtn.visible = status === 'downloading';
    panel._folderBtn.visible = status === 'completed' && c.activeOutputDir !== '';
    panel._clearCardBtn.visible = status !== 'downloading';

    const hasProgress = c.progress.percentText !== '' || c.progress.size !== '';
    panel._progressRow.visible = hasProgress;
    if (hasProgress) {
        panel._progress.setFraction(c.progress.percentValue / 100);
        panel._progressPct.text = c.progress.percentText;
    }

    const statsParts = [];
    if (c.progress.size) statsParts.push(c.progress.size);
    if (c.progress.speed) statsParts.push('at ' + c.progress.speed);
    if (c.progress.eta) statsParts.push('· ' + c.progress.eta + ' remaining');
    panel._progressStats.text = statsParts.join(' ');
    panel._progressStats.visible = statsParts.length > 0;
}


export function buildActiveCard(panel, UI) {
    const wrap = UI.row({ vertical: true, styleClass: 'ytrawl-active-card' });
    panel._activeCard = wrap;
    panel._activeCard.visible = false;

    const head = UI.row({ vertical: false });
    panel._activeTitle = UI.label('', 'ytrawl-title');
    panel._activeTitle.clutter_text.ellipsize = 2;
    head.add_child(panel._activeTitle);

    const actions = UI.row({ vertical: false, x_expand: false });
    panel._retryBtn = UI.iconButton({
        icon: 'view-refresh-symbolic',
        tooltip: 'Retry as web client',
        onActivate: () => panel.c.retryWithWebClient(),
    });
    panel._pauseBtn = UI.iconButton({
        icon: 'media-playback-pause-symbolic',
        tooltip: 'Pause',
        onActivate: () => panel.c.pauseActive(),
    });
    panel._resumeBtn = UI.iconButton({
        icon: 'media-playback-start-symbolic',
        tooltip: 'Resume',
        onActivate: () => panel.c.resumeActive(),
    });
    panel._cancelBtn = UI.iconButton({
        icon: 'process-stop-symbolic',
        tooltip: 'Cancel',
        onActivate: () => panel.c.cancelActive(),
    });
    panel._folderBtn = UI.iconButton({
        icon: 'folder-open-symbolic',
        tooltip: 'Open folder',
        onActivate: () => panel.c.activeOutputDir && panel.c._deps.openFolder &&
            panel.c._deps.openFolder(panel.c.activeOutputDir),
    });
    panel._clearCardBtn = UI.iconButton({
        icon: 'window-close-symbolic',
        tooltip: 'Clear',
        onActivate: () => panel.c.clearActive(),
    });
    for (const button of [panel._retryBtn, panel._pauseBtn, panel._resumeBtn,
        panel._cancelBtn, panel._folderBtn, panel._clearCardBtn]) actions.add_child(button);
    head.add_child(actions);
    wrap.add_child(head);

    panel._activeMeta = UI.label('', 'ytrawl-meta');
    wrap.add_child(panel._activeMeta);

    panel._progressRow = UI.row({ vertical: false });
    panel._progress = UI.progressBar();
    panel._progressPct = UI.label('', 'ytrawl-meta');
    panel._progressPct.style = 'min-width: 52px; text-align: right;';
    panel._progressRow.add_child(panel._progress.actor);
    panel._progressRow.add_child(panel._progressPct);
    panel._progressRow.visible = false;
    wrap.add_child(panel._progressRow);

    panel._progressStats = UI.label('', 'ytrawl-hint');
    wrap.add_child(panel._progressStats);

    return wrap;
}
