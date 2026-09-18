// SPDX-License-Identifier: MIT
// Subprocess backend. Everything runs as argv arrays (no shell), so URLs,
// cookies, and user settings are never shell-interpolated.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const SIGSTOP = 19;
const SIGCONT = 18;

function launcher(flags) {
    const l = new Gio.SubprocessLauncher({ flags });
    // yt-dlp's progress template output must be unbuffered to stream live.
    l.setenv('PYTHONUNBUFFERED', '1', true);
    return l;
}

function bytesToString(bytes) {
    if (!bytes) return '';
    if (typeof bytes === 'string') return bytes;
    try {
        if (ArrayBuffer.isView(bytes))
            return new TextDecoder().decode(bytes);
        return new TextDecoder().decode(new Uint8Array(bytes));
    } catch (e) {
        try { return String(bytes); } catch (e2) { return ''; }
    }
}

/**
 * Run a command, capture stdout/stderr, and resolve once it exits.
 * Returns { output, error, exitCode, exitStatus } — output/error are strings.
 */
export function run({ argv, maxOutput = 1048576 }) {
    return new Promise((resolve) => {
        const sub = launcher(
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        ).spawnv(argv);

        // Read the whole streams with communicate — communicate finishes
        // after both pipes are drained and the child is reaped.
        sub.communicate_utf8_async(null, null, (src, res) => {
            try {
                const [, outBytes, errBytes] = src.communicate_utf8_finish(res);
                const exitCode = src.get_exit_status();
                let exitStatus = 1;
                try {
                    if (src.get_if_exited() && exitCode === 0) exitStatus = 0;
                } catch (e) {
                    exitStatus = exitCode === 0 ? 0 : 1;
                }
                resolve({
                    output: bytesToString(outBytes).slice(0, maxOutput),
                    error: bytesToString(errBytes).slice(0, maxOutput),
                    exitCode,
                    exitStatus,
                });
            } catch (e) {
                resolve({ output: '', error: '', exitCode: 1, exitStatus: 0 });
            }
        });
    });
}

/**
 * Streaming process with fine control (pause/resume/kill) and incremental
 * output. Both stdout and stderr are pumped line-by-line to onLine().
 */
export class StreamProc {
    constructor(argv) {
        this._sub = launcher(
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        ).spawnv(argv);
        this._done = false;
        this._onLine = null;
        this._onExit = null;
        this._events = 0; // 2 pipe EOFs + 1 wait = 3 means finished

        this._pump(this._sub.get_stdout_pipe());
        this._pump(this._sub.get_stderr_pipe());
        this._sub.wait_async(null, (proc, res) => {
            try {
                proc.wait_finish(res);
            } catch (e) {
                // force_exit before wait is handled below
            }
            this._maybeFinish();
        });
    }

    onLine(fn) {
        this._onLine = fn;
    }

    onExit(fn) {
        this._onExit = fn;
    }

    _pump(stream) {
        if (!stream) {
            this._maybeFinish();
            return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
        const loop = () => {
            stream.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, null, (src, res) => {
                let bytes = null;
                try {
                    bytes = src.read_bytes_finish(res);
                } catch (e) {
                    bytes = null;
                }
                if (!bytes || bytes.get_size() === 0) {
                    // Flush any trailing partial line, then EOF.
                    buffer += decoder.decode();
                    buffer = this._emitLines(buffer);
                    if (buffer !== '' && this._onLine) this._onLine(buffer);
                    this._maybeFinish();
                    return;
                }
                let data = '';
                try {
                    data = decoder.decode(bytes.get_data(), { stream: true });
                } catch (e) {
                    data = bytesToString(bytes.get_data());
                }
                buffer += data;
                buffer = this._emitLines(buffer);
                loop();
            });
        };
        loop();
    }

    _emitLines(buffer) {
        if (!this._onLine) return buffer;
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            this._onLine(line);
        }
        return buffer;
    }

    _maybeFinish() {
        this._events += 1;
        if (this._done || this._events < 3) return;
        this._done = true;
        let exitCode = 1;
        let exitStatus = 1;
        try {
            if (this._sub.get_if_exited()) {
                exitCode = this._sub.get_exit_status();
                exitStatus = 0;
            } else if (this._sub.get_if_signaled()) {
                exitCode = 128 + this._sub.get_term_sig();
                exitStatus = 1;
            }
        } catch (e) {
            // Child not reaped yet; treat as failed cleanly.
        }
        if (this._onExit) this._onExit(exitCode, exitStatus);
    }

    pause() {
        try {
            this._sub.send_signal(SIGSTOP);
        } catch (e) {
            // Already gone.
        }
    }

    resume() {
        try {
            this._sub.send_signal(SIGCONT);
        } catch (e) {
            // Already gone.
        }
    }

    kill() {
        try {
            this._sub.force_exit();
        } catch (e) {
            // Already gone.
        }
    }
}

/**
 * Download media extracts to a temp file so the panel can render it as a
 * thumbnail. tmp names are unique per call; the caller owns cleanup.
 */
export function fetchToFile(url, tmpPath) {
    const argv = [
        'curl', '-sL', '--max-time', '15', '--max-filesize', '1048576',
        '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        '-o', tmpPath, String(url),
    ];
    return run({ argv }).then(({ exitCode, exitStatus }) => ({
        ok: exitCode === 0 && exitStatus === 0,
    }));
}

// Spawn non-shell helpers with argv (no shell interpretation).
export function openPath(path) {
    try {
        const [, pid] = GLib.spawn_async(
            null,
            ['xdg-open', String(path)],
            null,
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null,
        );
        // Reap automatically.
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {});
    } catch (e) {
        log(`Ytrawl: failed to open ${path}: ${e.message}`);
    }
}

export function copyToClipboard(text) {
    GLib.spawn_async(
        null,
        ['sh', '-c', 'printf %s "$1" | wl-copy', 'ytrawl-copy', String(text)],
        null,
        GLib.SpawnFlags.SEARCH_PATH,
        null,
    );
}

export function makeDir(dir) {
    return run({ argv: ['mkdir', '-p', dir], maxOutput: 4096 });
}

export async function toolVersions() {
    let ytDlp = '';
    let ytDlpOk = false;
    let ffmpeg = '';
    let ffmpegOk = false;
    try {
        const y = await run({ argv: ['yt-dlp', '--version'], maxOutput: 512 });
        ytDlp = y.output.trim();
        ytDlpOk = y.exitCode === 0 && ytDlp !== '';
    } catch (e) {
        /* not installed */
    }
    try {
        const f = await run({ argv: ['ffmpeg', '-version'], maxOutput: 512 });
        const line = f.output.split('\n')[0] || '';
        ffmpeg = line.split(' ')[2] || line;
        ffmpegOk = f.exitCode === 0 && ffmpeg !== '';
    } catch (e) {
        /* not installed */
    }
    return { ytDlp, ytDlpOk, ffmpeg, ffmpegOk };
}