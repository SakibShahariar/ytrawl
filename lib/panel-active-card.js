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
