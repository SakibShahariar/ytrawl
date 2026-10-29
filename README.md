# Ytrawl

A lightweight GNOME Shell extension for downloading media via
[yt-dlp](https://github.com/yt-dlp/yt-dlp), driven from a panel dropdown in
the top bar. Paste a URL, pick a quality/format, and download — with
subtitles, thumbnails, SponsorBlock, cookies/proxy support, a queue, and
history along the way.

## Requirements

- GNOME Shell 45–51 (GNOME Shell 51 metadata support added; live Shell 51 smoke test still recommended)
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on `PATH`, or set its absolute executable path in Preferences
- [`ffmpeg`](https://ffmpeg.org/) on `PATH`, or set its absolute executable path in Preferences (needed for merging separate
  video/audio streams, embedding subtitles/thumbnails, and audio format
  conversion)
- `curl` on `PATH` (used for thumbnail preview fetching)
- Optional: [`matugen`](https://github.com/InioX/matugen) if you want the
  panel to pick up your system's Material You palette automatically

If either executable isn't found at its configured path (or on `PATH` when its setting is empty), the panel shows a banner the next time you open it. Configured paths must be absolute; they are passed as individual argv items, never through a shell.

## Download process priority

Preferences → Network includes **Lower download CPU and I/O priority**, disabled by default. When enabled, downloads are wrapped with Linux `nice +10` and `ionice` best-effort class priority 7; the setting does not change metadata extraction or the default execution path. Gio.Subprocess does not expose portable CPU/I/O priority setters, so this relies on the Linux `nice` and `ionice` utilities. If either utility is unavailable, Ytrawl reports the configuration error instead of silently pretending the priority was applied.

## Stalled downloads

In Preferences → Network, **Stall timeout (minutes)** is optional and disabled by default. Set it to a value from 1 to 1440 to fail a download if yt-dlp emits no progress update for that many minutes. The timeout resets whenever progress arrives, and a stalled job is terminated with its child processes, partial artifacts are cleaned up, and the queue follows the normal stop-on-error setting. Slow but progressing downloads are not timed out.

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
- **Executables** — optional absolute paths for `yt-dlp` and `ffmpeg`; leave
  either field empty to use the corresponding command from `PATH`.
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

- For development diagnostics, launch GNOME Shell with `YTRAWL_DEBUG=1` in its
  environment to warn when `stWidget()` drops unsupported properties. Normal
  operation remains silent; restart the shell session after changing the environment.
- **Cookies from browser** reads authentication cookies from the selected browser/profile; choose the matching profile when the browser has multiple profiles. Treat cookie access as sensitive. **Proxy URL** applies to yt-dlp network requests, so it can route video, metadata, and thumbnail traffic through that proxy; credentials in the URL should be kept private.
- The panel's raw log redacts obvious cookie paths, proxy values, credentialed URLs,
  and named token/password arguments. This is heuristic display-only filtering, not
  a complete secret detector; treat copied logs as potentially sensitive.
- Metadata extraction times out after 2 minutes and rejects JSON output over 8 MiB. Large playlists or search results may exceed the limit; try opening a single video URL instead. The size check happens after subprocess output is collected, so it is not a hard peak-memory cap.
- **Concurrent fragments** is left at yt-dlp's built-in default unless you set a positive integer in preferences. Raising it can speed up fragmented downloads on a fast connection, but also increases simultaneous network requests and disk/CPU pressure; keep the default on modest machines.
- Download directories may be absolute paths or use `~/...`. Empty settings use
  `~/Downloads`; `/`, `/proc`, `/sys`, and `/dev` are rejected as unsafe targets.
  Before downloading, Ytrawl checks available filesystem space when yt-dlp metadata
  includes a usable size estimate. If the estimate plus a 10% margin exceeds free
  space, it shows a warning but does not block the download. Unknown sizes and
  filesystem-query failures do not prevent downloading.
- **Reset settings to defaults** (in the panel's Advanced section) is
  destructive — it wipes cookies, proxy, custom args, and history — and
  requires clicking it twice within a few seconds to confirm.
- **Skip already-downloaded media** keeps a hidden `.ytrawl-archive.txt`
  in your download folder; use the adjacent **Clear download archive**
  action if you need to reset it.
- **Open file** only opens paths lexically inside the configured download
  directory and refuses paths that traverse symlink components. This is
  intentionally conservative: downloads reached through symlinked directories
  may not open, even when their resolved target is inside the download folder.
- **Stop queue after a failed download** (in preferences) leaves remaining
  items queued when a download fails. Use **Run queue** to continue manually.
- **Playlist download limit** applies to playlist URLs only. Choose all items,
  the first item, or the first 5, 10, or 20 items in preferences.
- GSettings schemas are compiled locally during installation. The generated
  `schemas/gschemas.compiled` file is intentionally not tracked in Git.
- Download history is stored in GNOME settings. You can disable **Remember
  download history** or clear saved URLs in the **History & Privacy** section
  of Preferences. While history is disabled, new downloads are not added to memory
  or persisted, so turning it back on will not save URLs from the opt-out period.
  Raw search queries (`ytsearch:` or plain search text) are never added to history.
- Thumbnail previews use a private directory under the user's cache
  directory. Ytrawl removes leftover preview files when the extension starts
  and removes the current preview when it is replaced or the extension stops.
  Thumbnail requests have a 15-second timeout and a 1 MiB response limit. Curl
  does not follow redirects, preventing redirect-to-private-address fetches;
  thumbnails hosted behind redirects may therefore be unavailable. Literal
  private/loopback hosts are blocked, but DNS rebinding is not fully prevented.

## License

MIT — see [LICENSE](LICENSE).


## Send requests to ytui

After pasting a URL and extracting its media details, use **Send to ytui** in the footer to add it to ytui's shared download inbox. The request stays pending until ytui imports it on startup or you choose **Import shared queue from Ytrawl** from ytui's colon command palette. This is separate from Ytrawl's own Queue and does not start a download in either app immediately.

The shared inbox defaults to `$XDG_STATE_HOME/ytui/shared-queue.json` (normally `~/.local/state/ytui/shared-queue.json`). If ytui is not installed or not running, Ytrawl can still write the request for later. The file uses a versioned JSON format with a lock file and atomic replacement; malformed files, lock timeouts, and invalid URLs are reported without affecting Ytrawl's local queue. See the [shared queue format and safety notes](https://github.com/SakibShahariar/ytui/blob/master/docs/shared-queue.md).
