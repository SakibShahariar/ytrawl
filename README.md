# Ytrawl

**A GNOME Shell download manager powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).**

Paste a media URL into the top-bar panel, choose a format, and download. Manage a queue and history without leaving your desktop.

## Features

- **Format selection** with video, audio, and custom yt-dlp format options.
- **Subtitles and thumbnails** — save or embed subtitles, captions, and artwork.
- **SponsorBlock** segment removal with selectable categories.
- **Queue and history** with playlist limits, download archive, and configurable stop-on-error behavior.
- **Network options** for browser cookies, cookie files, proxies, and rate limits.
- **Download controls** including per-download options, stall timeout, and optional lower CPU/I/O priority.
- **Chapter details** when provided by yt-dlp.
- **Notifications** for completed, failed, and cancelled downloads.
- **Material You colors** through optional Matugen integration.
- **ytui handoff** to send extracted media requests to ytui's shared inbox.

## Requirements

- GNOME Shell 45–51
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [FFmpeg](https://ffmpeg.org/) for stream merging, embedding, and audio conversion
- `curl` for thumbnail previews
- Optional: [Matugen](https://github.com/InioX/matugen)

Set custom executable paths in Preferences when tools are not available on `PATH`.

## Install

```bash
git clone https://github.com/SakibShahariar/ytrawl.git
cd ytrawl
bash scripts/install.sh
```

Log out and back in, then enable the extension:

```bash
gnome-extensions enable ytrawl@sakib.dev
```

Open preferences with:

```bash
gnome-extensions prefs ytrawl@sakib.dev
```

To build a distributable archive:

```bash
bash scripts/package.sh
```

The ZIP is written to `dist/ytrawl.zip`.

## Settings

Preferences cover download behavior, executable paths, media and subtitle handling, SponsorBlock, network and cookies, output templates, and extra yt-dlp arguments. Per-download controls are also available in the panel.

Extra yt-dlp arguments run with your user permissions. Only use arguments from sources you trust.

## Privacy and safety

- Browser-cookie access is sensitive. Select the intended browser profile and protect cookie files.
- Proxy settings can route media, metadata, and thumbnail traffic through the configured proxy. Keep proxy credentials private.
- Logs redact common secrets heuristically; copied logs may still contain sensitive data.
- Download history can be disabled or cleared in **History & Privacy**. Search queries are not saved.
- Downloads are restricted to safe target directories. The extension checks available space when yt-dlp provides a usable size estimate.
- Thumbnail requests have time and size limits, do not follow redirects, and block literal private/loopback hosts. DNS rebinding is not fully prevented.
- **Reset settings** removes saved cookies, proxy settings, custom arguments, and history.

## ytui integration

Use **Send to ytui** after extracting media details to place a request in ytui's shared inbox. ytui imports it later; this does not start a download immediately.

The shared inbox format and safety details are documented in the [ytui repository](https://github.com/SakibShahariar/ytui/blob/master/docs/shared-queue.md).

## License

MIT — see [LICENSE](LICENSE).
