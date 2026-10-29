// SPDX-License-Identifier: MIT
// Top-level panel sections and media controls, separated from panel lifecycle code.

export function buildPanelSections(panel, main, {UI, Model, St, Clutter, Gio, GLib, PANEL_WIDTH, PANEL_MAX_HEIGHT, qualityLabel, setPill}) {
        const add = (w) => main.add_child(w);

        // ---- error banner -------------------------------------------------
        const errRow = UI.row({ vertical: false, styleClass: 'ytrawl-error' });
        const errText = UI.label('', 'ytrawl-error-text');
        const errClose = UI.iconButton({
            icon: 'window-close-symbolic',
            tooltip: 'Dismiss',
            onActivate: () => {
                panel.c.errorMessage = '';
                panel.c._refreshUI();
            },
        });
        const errSpacer = new St.Widget()
        errRow.add_child(errText);
        errRow.add_child(errSpacer);
        errRow.add_child(errClose);
        add(errRow);
        panel._errRow = errRow;
        panel._errText = errText;

        // ---- missing-tool banner -------------------------------------------
        // Surfaces controller.tools (populated by detectTools() on every
        // panel open) instead of letting the user discover a missing
        // yt-dlp/ffmpeg only after an extraction/download attempt fails.
        const toolsRow = UI.row({ vertical: false, styleClass: 'ytrawl-error' });
        const toolsText = UI.label('', 'ytrawl-error-text');
        toolsRow.add_child(toolsText);
        add(toolsRow);
        toolsRow.visible = false;
        panel._toolsRow = toolsRow;
        panel._toolsText = toolsText;

        // ---- URL entry ----------------------------------------------------
        const urlRow = UI.row({ vertical: false });
        panel._urlEntry = UI.entry({
            placeholder: 'Paste a URL or search…',
            text: panel.c.currentUrl,
            onActivate: () => panel._onEnter(),
            onChanged: (text) => {
                panel.c.currentUrl = text;
                panel.c.pastedFromClipboard = false;
                // Drop the stale media card once the text diverges.
                if (panel.c.mediaInfo &&
                    Model.cleanUrlText(text) !== panel.c.extractedUrl) {
                    panel.c.mediaInfo = null;
                }
                panel._maybeAutoExtract(text);
            },
            onCaptureKey: (actor, event) => panel._onUrlKey(actor, event),
        });
        panel._urlEntry.style = 'flex-grow: 1;';
        const pasteBtn = UI.iconButton({
            icon: 'edit-paste-symbolic',
            tooltip: 'Paste from clipboard',
            onActivate: () => {
                panel.c.readClipboard(true);
                panel._focusUrl();
            },
        });
        const clearBtn = UI.iconButton({
            icon: 'edit-clear-all-symbolic',
            tooltip: 'Clear input',
            onActivate: () => {
                panel.c.resetInput();
                panel._focusUrl();
            },
        });
        const goBtn = UI.iconButton({
            icon: 'media-playback-start-symbolic',
            tooltip: 'Extract / download',
            onActivate: () => panel._onEnter(),
        });
        urlRow.add_child(panel._urlEntry);
        urlRow.add_child(pasteBtn);
        urlRow.add_child(goBtn);
        urlRow.add_child(clearBtn);
        add(urlRow);
        panel._clearBtn = clearBtn;
        panel._goBtn = goBtn;

        // ---- hint / extracting -------------------------------------------
        panel._hint = UI.label('', 'ytrawl-hint');
        panel._hint.clutter_text.ellipsize = 2;
        add(panel._hint);

        const extractingRow = UI.row();
        panel._extractingLabel = UI.label('Extracting media information…', 'ytrawl-extracting');
        extractingRow.add_child(panel._extractingLabel);
        panel._cancelExtractionBtn = UI.iconButton({
            icon: 'process-stop-symbolic',
            tooltip: 'Cancel extraction',
            onActivate: () => panel.c.cancelActive(),
        });
        extractingRow.add_child(panel._cancelExtractionBtn);
        add(extractingRow);
        panel._extractingLabel.visible = false;
        panel._cancelExtractionBtn.visible = false;

        // ---- media card ---------------------------------------------------
        const card = UI.stWidget(St.BoxLayout, { style_class: 'ytrawl-card', x_expand: true });
        const thumbBox = UI.stWidget(St.Widget, { style_class: 'ytrawl-thumb-box' });
        panel._thumb = UI.stWidget(St.Icon, {
            style_class: 'ytrawl-thumb',
            icon_size: 96,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        thumbBox.add_child(panel._thumb);
        const infoCol = UI.row({ vertical: true });
        panel._durationBadge = UI.label('', 'ytrawl-duration');
        panel._durationBadge.visible = false;
        panel._title = UI.label('', 'ytrawl-title');
        panel._uploader = UI.label('', 'ytrawl-uploader');
        panel._openSourceBtn = UI.iconButton({
            icon: 'web-browser-symbolic',
            tooltip: 'Open source in browser',
            onActivate: () => panel.c.openSourceUrl(),
        });
        panel._openSourceBtn.visible = false;
        infoCol.add_child(panel._durationBadge);
        infoCol.add_child(panel._title);
        infoCol.add_child(panel._uploader);
        infoCol.add_child(panel._openSourceBtn);
        card.add_child(thumbBox);
        card.add_child(infoCol);
        try { card.width = PANEL_WIDTH - 24; } catch (e) { /* ignore */ }
        card.style = 'margin-top: 4px;';
        add(card);
        panel._card = card;
        panel._thumbSeq = 0;

        // ---- chapters -----------------------------------------------------
        panel._chapters = createChapterSection({ UI, Model });
        panel._chaptersAcc = panel._chapters.accordion;
        add(panel._chaptersAcc.actor);

        // ---- mode section -------------------------------------------------
        panel._modeAcc = UI.accordion({
            titleText: 'Mode',
            content: panel._buildModeBody(),
        });
        add(panel._modeAcc.actor);
        panel._modeAcc.actor.visible = false;

        // ---- playlist pill -------------------------------------------------
        const plRow = UI.row({ vertical: false, styleClass: 'ytrawl-playlist' });
        const plLabel = UI.label('Playlist', 'ytrawl-toggle-label');
        panel._playlistValue = UI.caption('');
        const plSpacer = new St.Widget()
        plRow.add_child(plLabel);
        plRow.add_child(plSpacer);
        plRow.add_child(panel._playlistValue);
        add(plRow);
        panel._playlistRow = plRow;
        panel._playlistRow.visible = false;

        // ---- subtitles -----------------------------------------------------
        panel._subsAcc = UI.accordion({
            titleText: 'Subtitles',
            content: panel._buildSubsBody(),
        });
        add(panel._subsAcc.actor);
        panel._subsAcc.actor.visible = false;

        // ---- thumbnail ----------------------------------------------------
        panel._thumbAcc = UI.accordion({
            titleText: 'Thumbnail',
            content: panel._buildThumbBody(),
        });
        add(panel._thumbAcc.actor);
        panel._thumbAcc.actor.visible = false;

        // ---- DRC -----------------------------------------------------------
        panel._drcToggle = UI.toggleRow({
            labelText: 'Prefer DRC audio',
            desc: 'YouTube “Stable Volume” for consistent loudness',
            onToggled: (on) => panel.c.setBool('prefer-drc', on),
        });
        add(panel._drcToggle.actor);
        panel._drcToggle.actor.visible = false;

        // ---- SponsorBlock --------------------------------------------------
        panel._sponAcc = UI.accordion({
            titleText: 'SponsorBlock',
            content: panel._buildSponsorBody(),
        });
        add(panel._sponAcc.actor);
        panel._sponAcc.actor.visible = false;

        // ---- after download ------------------------------------------------
        panel._afterAcc = UI.accordion({
            titleText: 'After download',
            content: panel._buildAfterBody(),
        });
        add(panel._afterAcc.actor);

        // ---- history -------------------------------------------------------
        panel._histAcc = UI.accordion({
            titleText: 'History',
            content: panel._buildHistoryBody(),
        });
        add(panel._histAcc.actor);

        // ---- advanced ------------------------------------------------------
        panel._advAcc = UI.accordion({
            titleText: 'Advanced',
            defaultOpen: panel.c.b('advanced-visible'),
            content: buildAdvancedBody(panel, {UI, Model, GLib}),
            onToggleOpen: (open) => panel.c.setBool('advanced-visible', open),
        });
        add(panel._advAcc.actor);

        // ---- raw log -------------------------------------------------------
        panel._rawLogBox = UI.stWidget(St.ScrollView, {
            style_class: 'ytrawl-rawlog',
            x_expand: true,
        });
        panel._rawLogLabel = UI.label('', 'ytrawl-rawlog-text');
        panel._rawLogBox.add_child(panel._rawLogLabel);
        panel._rawLogBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        panel._rawLogBox.visible = false;
        add(panel._rawLogBox);

        // ---- active download card -----------------------------------------
        add(panel._buildActiveCard());

        // ---- queue ---------------------------------------------------------
        const queueWrap = UI.row({ vertical: true, styleClass: 'ytrawl-queue' });
        const queueTitle = UI.sectionTitle('QUEUE');
        queueWrap.add_child(queueTitle);
        panel._queueList = UI.row({ vertical: true });
        queueWrap.add_child(panel._queueList);
        add(queueWrap);
        panel._queueWrap = queueWrap;
        panel._queueWrap.visible = false;

        // ---- download dir --------------------------------------------------
        panel._dirField = UI.entry({
            placeholder: '~/Downloads',
            text: panel.c.s('download-dir'),
            onChanged: (text) => panel.c.setDownloadDir(text),
        });
        panel._dirField.visible = false;
        add(panel._dirField);

        // ---- extract / run queue ------------------------------------------
        panel._extractBtn = UI.primaryButton({
            label: 'Extract',
            onActivate: () => panel.c.startExtraction(),
        });
        panel._extractBtn.visible = false;
        add(panel._extractBtn);

        panel._runQueueBtn = UI.ghostButton({
            label: 'Run queue',
            onActivate: () => panel.c.runQueue(),
        });
        panel._runQueueBtn.visible = false;
        add(panel._runQueueBtn);

        // ---- footer: download + queue --------------------------------------
        const footer = UI.row({ vertical: false });
        panel._downloadBtn = UI.primaryButton({
            label: 'Download',
            onActivate: () => panel.c.startDownload(),
        });
        panel._downloadBtn.style = 'flex-grow: 1;';
        panel._queueBtn = UI.ghostButton({
            label: 'Queue',
            onActivate: () => panel.c.enqueueCurrent(),
        });
        panel._shareBtn = UI.ghostButton({
            label: 'Send to ytui',
            onActivate: () => panel.c.sendToYtuiSharedQueue(),
        });
        footer.add_child(panel._downloadBtn);
        footer.add_child(panel._queueBtn);
        footer.add_child(panel._shareBtn);
        add(footer);
        panel._footer = footer;
        panel._footer.visible = false;
    }
