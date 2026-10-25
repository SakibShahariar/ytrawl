# Ytrawl

A lightweight GNOME Shell extension for downloading media via
[yt-dlp](https://github.com/yt-dlp/yt-dlp), driven from a panel dropdown in
the top bar. Paste a URL, pick a quality/format, and download — with
subtitles, thumbnails, SponsorBlock, cookies/proxy support, a queue, and
history along the way.

## Requirements

- GNOME Shell 45–50
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on `PATH`
- [`ffmpeg`](https://ffmpeg.org/) on `PATH` (needed for merging separate
  video/audio streams, embedding subtitles/thumbnails, and audio format
  conversion)
- `curl` on `PATH` (used for thumbnail preview fetching)
- Optional: [`matugen`](https://github.com/InioX/matugen) if you want the
  panel to pick up your system's Material You palette automatically

If either `yt-dlp` or `ffmpeg` isn't found, the panel shows a banner
saying so the next time you open it.

## Install

```bash
git clone https://github.com/SakibShahariar/ytrawl.git
cd ytrawl
bash scripts/install.sh
```

The installer copies the extension files to your local GNOME Shell extensions
directory and compiles the GSettings schema. It does not enable the extension
automatically. To package a distributable ZIP instead, run:

```bash
bash scripts/package.sh
```

The archive is written to `dist/ytrawl.zip`. Both scripts require the usual
GNOME/GSettings tools; packaging additionally requires `zip`.

Then log out and back in. On X11, you can also restart GNOME Shell with
`Alt+F2` → `r` → `Enter`; on Wayland, use a fresh login session. Enable
the extension:

```bash
gnome-extensions enable ytrawl@sakib.dev
```

## Settings overview

Open preferences with:

```bash
gnome-extensions prefs ytrawl@sakib.dev
```

- **General** — clipboard auto-fill/auto-extract, download archive (skip
  already-downloaded media), reduced motion, default post-download action,
  audio format, and playlist download limit.
- **Media** — thumbnails (save/embed), subtitles (embed/save separately/
  include auto-captions), and DRC audio preference.
- **SponsorBlock** — category selection for segment removal.
- **Network & cookies** in preferences — proxy, rate limit, browser cookies,
  cookie-file path, and browser profile.
- **Output** in preferences — output template, extra yt-dlp arguments, and
  custom format selector.
- **Advanced** in the panel — per-download options and controls, including
  cookies, proxy, rate limiting, custom format selectors, and extra
  yt-dlp arguments.

The network and output options are available in both places so you can
either set persistent defaults in preferences or adjust them from the panel.

Extra yt-dlp arguments run with your user permissions, so only enter arguments
from sources you trust. Ytrawl passes them as separate process arguments; it
does not evaluate them through a shell.

## Notes

- Download directories may be absolute paths or use `~/...`. Empty settings use
  `~/Downloads`; `/`, `/proc`, `/sys`, and `/dev` are rejected as unsafe targets.
- **Reset settings to defaults** (in the panel's Advanced section) is
  destructive — it wipes cookies, proxy, custom args, and history — and
  requires clicking it twice within a few seconds to confirm.
- **Skip already-downloaded media** keeps a hidden `.ytrawl-archive.txt`
  in your download folder; use the adjacent **Clear download archive**
  action if you need to reset it.
- **Open file** only opens paths lexically inside the configured download
  directory. This check does not resolve symlinks, so a symlink-based escape is
  not prevented.
- **Stop queue after a failed download** (in preferences) leaves remaining
  items queued when a download fails. Use **Run queue** to continue manually.
- **Playlist download limit** applies to playlist URLs only. Choose all items,
  the first item, or the first 5, 10, or 20 items in preferences.
- GSettings schemas are compiled locally during installation. The generated
  `schemas/gschemas.compiled` file is intentionally not tracked in Git.
- Download history is stored in GNOME settings. You can disable **Remember
  download history** or clear saved URLs in the **History & Privacy** section
  of preferences. With remembering disabled, newly downloaded URLs are not
  persisted.
- Thumbnail previews use a private directory under the user's cache
  directory. Ytrawl removes leftover preview files when the extension starts
  and removes the current preview when it is replaced or the extension stops.
  Thumbnail requests are limited to 3 redirects and 15 seconds, and curl is asked
  to cap each response at 1 MiB. Literal private/loopback hosts are blocked, but
  DNS rebinding and redirects to private addresses are not fully prevented.

## License

MIT — see [LICENSE](LICENSE).
