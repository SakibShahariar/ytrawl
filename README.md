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
mkdir -p ~/.local/share/gnome-shell/extensions/ytrawl@sakib.dev
cp -r extension.js prefs.js metadata.json stylesheet.css lib schemas LICENSE \
    ~/.local/share/gnome-shell/extensions/ytrawl@sakib.dev/
```

Then either log out/in (X11) or run `Alt+F2` → `r` → `Enter` (Wayland: use
a fresh login session), and enable it:

```bash
gnome-extensions enable ytrawl@sakib.dev
```

## Settings overview

Open preferences with:

```bash
gnome-extensions prefs ytrawl@sakib.dev
```

- **General** — clipboard auto-fill/auto-extract, download-archive
  (skip already-downloaded media), reduced motion, default post-download
  action and audio format.
- **Media** — thumbnails (save/embed), subtitles (embed / save as a
  separate file / include auto-captions), DRC audio preference.
- **SponsorBlock** — category selection for segment removal.
- Cookies, proxy, rate limiting, custom format selectors, and extra
  yt-dlp arguments are available from the panel's own **Advanced**
  section (not the prefs window), since they're the kind of thing you
  tend to adjust per-download rather than once globally.

## Notes

- "Reset settings to defaults" (in the panel's Advanced section) is
  destructive — it wipes cookies, proxy, custom args, and history — and
  requires clicking it twice within a few seconds to confirm.
- "Skip already-downloaded media" keeps a hidden `.ytrawl-archive.txt`
  in your download folder; there's a "Clear download archive" button
  next to it if you need to reset that.

## License

MIT — see [LICENSE](LICENSE).
