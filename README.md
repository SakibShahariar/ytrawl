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
install_dir="$HOME/.local/share/gnome-shell/extensions/ytrawl@sakib.dev"
mkdir -p "$install_dir"
cp -r extension.js prefs.js metadata.json stylesheet.css lib schemas LICENSE "$install_dir/"
glib-compile-schemas "$install_dir/schemas"
```

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
  and audio format.
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

## Notes

- **Reset settings to defaults** (in the panel's Advanced section) is
  destructive — it wipes cookies, proxy, custom args, and history — and
  requires clicking it twice within a few seconds to confirm.
- **Skip already-downloaded media** keeps a hidden `.ytrawl-archive.txt`
  in your download folder; use the adjacent **Clear download archive**
  action if you need to reset it.
- GSettings schemas are compiled locally during installation. The generated
  `schemas/gschemas.compiled` file is intentionally not tracked in Git.

## License

MIT — see [LICENSE](LICENSE).
