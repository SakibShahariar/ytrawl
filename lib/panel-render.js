// SPDX-License-Identifier: MIT
// Main panel state-to-widget rendering, separated from panel construction.

export function renderPanel(panel, {UI, Model, St, Clutter, Gio, GLib, PANEL_WIDTH, PANEL_MAX_HEIGHT, qualityLabel, setPill}) {
        const c = panel.c;

        // Error banner.
        if (c.errorMessage !== '') {
            panel._errRow.visible = true;
            panel._errText.text = c.errorMessage;
        } else {
            panel._errRow.visible = false;
        }

        // Missing-tool banner.
        if (c.tools && !c.tools.ytDlpOk) {
            panel._toolsRow.visible = true;
            panel._toolsText.text = c.s('yt-dlp-path').trim()
                ? 'The configured yt-dlp executable could not run. Check Preferences → Executables.'
                : 'yt-dlp was not found on PATH — install it or set its path in Preferences.';
        } else if (c.tools && !c.tools.ffmpegOk) {
            panel._toolsRow.visible = true;
            panel._toolsText.text = c.s('ffmpeg-path').trim()
                ? 'The configured ffmpeg executable could not run. Check Preferences → Executables.'
                : 'ffmpeg was not found on PATH — install it or set its path in Preferences.';
        } else {
            panel._toolsRow.visible = false;
        }


        // Input state.
        panel._clearBtn.visible = c.currentUrl.trim() !== '';
        panel._updateEntry(panel._urlEntry, c.currentUrl);

        // Hint.
        panel._renderHint();

        // Extracting.
        panel._extractingLabel.visible = c.extracting;
        panel._cancelExtractionBtn.visible = c.extracting;
        panel._renderPulse(panel._extractingLabel, c.extracting);

        // Media card.
        const hasInfo = c.mediaInfo !== null;
        panel._card.visible = hasInfo;
        panel._openSourceBtn.visible = hasInfo &&
            Model.isSafePublicUrl(c.mediaInfo.webpage_url || c.extractedUrl || c.currentUrl);
        if (hasInfo) {
            const info = c.mediaInfo;
            panel._title.text = info.title;
            panel._uploader.text = info.uploader;
            panel._durationBadge.text = info.duration > 0 ? Model.formatDuration(info.duration) : '';
            panel._durationBadge.visible = info.duration > 0;
            panel._renderThumb();
        }

        // Playlist pill.
        panel._playlistRow.visible = hasInfo && c.mediaInfo.isPlaylist === true;
        if (panel._playlistRow.visible) {
            panel._playlistValue.text = String(c.mediaInfo.count || 0) + ' items';
        }

        // The chapter section owns its row widgets and visibility state.
        panel._chapters.render(hasInfo ? c.mediaInfo.chapters : []);

        // Mode section.
        panel._modeAcc.actor.visible = hasInfo;
        if (hasInfo) {
            panel._modeAcc.setValueText(panel._modeValueText(c));
            setPill(panel._modeButtons.video, c.downloadMode === 'video');
            setPill(panel._modeButtons.audio, c.downloadMode === 'audio');
            setPill(panel._modeButtons.custom, c.downloadMode === 'custom');

            const showQuality = c.downloadMode === 'video' && c.availableQualities.length > 0;
            panel._qualitySection.visible = showQuality;
            if (showQuality) {
                const opts = [{ label: qualityLabel(c, 'best'), value: 'best' }];
                for (const q of c.availableQualities)
                    opts.push({ label: qualityLabel(c, q), value: q });
                panel._qualityDropdown.setOptions(opts);
                panel._qualityDropdown.setValue(c.videoQuality);
            }

            const showAudio = c.downloadMode === 'audio';
            panel._audioSection.visible = showAudio;
            if (showAudio) {
                for (const f of Model.AUDIO_FORMATS) {
                    setPill(panel._fmtButtons[f], c.audioFormat === f);
                }
                panel._trackHeader.visible = (c.mediaInfo.audioLanguages || []).length > 0;
                panel._trackDropdown.actor.visible = (c.mediaInfo.audioLanguages || []).length > 0;
                if (panel._trackDropdown.actor.visible) {
                    panel._trackDropdown.setOptions(Model.audioTrackOptions(c.mediaInfo.audioLanguages));
                    panel._trackDropdown.setValue(c.audioLanguage);
                }
            }

            const showCustom = c.downloadMode === 'custom';
            panel._customField.visible = showCustom;
            panel._updateEntry(panel._customField, c.s('custom-format-selector'));
        }

        // Subtitles.
        const showSubs = hasInfo && (c.mediaInfo.hasSubs || c.mediaInfo.hasAutoSubs);
        panel._subsAcc.actor.visible = showSubs;
        if (showSubs) {
            const parts = [];
            if (c.b('embed-subs')) parts.push('Embed');
            if (c.b('write-subs-file')) parts.push('File');
            if (c.b('include-auto-subs')) parts.push('Auto');
            panel._subsAcc.setValueText(parts.join(' · ') || 'Off');
            panel._subsEmbed.setChecked(c.b('embed-subs'));
            panel._subsWriteFile.setChecked(c.b('write-subs-file'));
            panel._subsWriteFile.actor.visible = c.mediaInfo.hasSubs;
            panel._subsAuto.setChecked(c.b('include-auto-subs'));
            panel._subsAuto.actor.visible = c.mediaInfo.hasAutoSubs;
            panel._subsLangText.visible = c.mediaInfo.subLanguages.length > 0;
            panel._subsDropdown.actor.visible = c.mediaInfo.subLanguages.length > 0;
            if (panel._subsDropdown.actor.visible) {
                panel._subsDropdown.setOptions(Model.subtitleOptions(c.mediaInfo.subLanguages));
                panel._subsDropdown.setValue(c.s('sub-language'));
            }
        }

        // Thumbnail options.
        panel._thumbAcc.actor.visible = hasInfo;
        if (hasInfo) {
            const parts = [];
            if (c.b('download-thumbnail')) parts.push('Save');
            if (c.b('embed-thumbnail')) parts.push('Embed');
            panel._thumbAcc.setValueText(parts.join(' · ') || 'Off');
            panel._thumbSave.setChecked(c.b('download-thumbnail'));
            panel._thumbEmbed.setChecked(c.b('embed-thumbnail'));
        }

        // DRC + SponsorBlock.
        panel._drcToggle.actor.visible = hasInfo;
        panel._drcToggle.setChecked(c.b('prefer-drc'));
        panel._sponAcc.actor.visible = hasInfo;
        if (hasInfo) {
            const cats = c.arr('sponsor-block-categories');
            panel._sponAcc.setValueText(c.b('sponsor-block')
                ? `On · ${cats.length} types`
                : 'Off');
            panel._sponToggle.setChecked(c.b('sponsor-block'));
            for (const cat of Model.SPONSOR_CATEGORIES) {
                if (panel._sponCats[cat])
                    panel._sponCats[cat].setChecked(cats.includes(cat));
            }
        }

        // After download.
        const action = c.s('post-download-action');
        panel._afterAcc.setValueText(
            Model.POST_DOWNLOAD_ACTIONS.find(a => a.value === action)?.label || 'Nothing');
        for (const act of Model.POST_DOWNLOAD_ACTIONS) {
            setPill(panel._afterButtons[act.value], action === act.value);
        }

        // History.
        panel._histAcc.setValueText(c.history.length > 0 ? `${c.history.length} URLs` : '');
        panel._histSave.setChecked(c.b('save-history'));
        panel._histClear.visible = c.history.length > 0;
        panel._rebuildHistory(c.history);

        // Advanced.
        panel._rawLogToggle.setChecked(c.showRawLog);
        panel._autoClip.setChecked(c.b('auto-clipboard'));
        panel._autoExtract.setChecked(c.b('auto-extract-clipboard'));
        panel._clearAfter.setChecked(c.b('clear-input-after-download'));
        panel._archive.setChecked(c.b('use-archive'));
        panel._reduceMotion.setChecked(c.b('reduce-motion'));
        panel._updateEntry(panel._templateField, c.s('output-template'));
        panel._cookiesBrowserDropdown.setValue(c.s('cookies-from-browser'));
        panel._cookiesProfileField.visible = c.s('cookies-from-browser') !== '';
        panel._updateEntry(panel._cookiesProfileField, c.s('cookies-profile'));
        panel._updateEntry(panel._cookiesFileField, c.s('cookies'));
        panel._updateEntry(panel._proxyField, c.s('proxy'));
        panel._updateEntry(panel._rateField, c.s('rate-limit'));
        panel._updateEntry(panel._fragField, c.s('concurrent-fragments'));
        panel._updateEntry(panel._customArgsField, c.s('custom-args'));
        panel._updateEntry(panel._dirField, c.s('download-dir'));

        // Raw log.
        panel._renderRawLog();

        // Active card.
        panel._renderActiveCard();

        // Queue.
        panel._rebuildQueue();

        // Footer / extract buttons.
        const noInfo = !hasInfo;
        const notDownloading = c.activeStatus !== 'downloading';
        // Extraction is independent of whatever's already downloading —
        // it's how you queue a *second* item while one is active — so it
        // shouldn't be hidden just because something else is downloading.
        // (It matches _onEnter()'s own condition, which never gated on
        // notDownloading either.)
        panel._extractBtn.visible = noInfo && !c.extracting;
        panel._extractBtn.label = c.extracting ? 'Extracting…' : 'Extract';
        panel._extractBtn.reactive = !c.extracting;
        panel._extractBtn.opacity = c.extracting ? 0.7 : 1;
        panel._runQueueBtn.visible = (noInfo || c.activeStatus === 'error') &&
            notDownloading && c.activeStatus !== 'paused' &&
            !c.extracting && c.queue.length > 0;
        panel._runQueueBtn.label = `Run queue (${c.queue.length})`;
        panel._dirField.visible = hasInfo;
        panel._footer.visible = hasInfo && !c.showingDownloadedCard;

        if (panel._footer.visible) {
            const size = Model.formatSize(Model.estimateSize(c.mediaInfo, c.makeJob()));
            const isPlaylist = c.mediaInfo && c.mediaInfo.isPlaylist === true;
            panel._downloadBtn.label = isPlaylist ? 'Download all' : 'Download';
            setTooltip(panel._downloadBtn, size ? `About ${size}` : "");
            panel._downloadBtn.visible = !c.downloadInProgress;
            panel._queueBtn.label = c.downloadInProgress ? 'Queue next' : 'Queue';
            panel._queueBtn.style = c.downloadInProgress ? 'flex-grow: 1;' : '';
            if (c.downloadInProgress) panel._downloadBtn.visible = false;
        }
    }
