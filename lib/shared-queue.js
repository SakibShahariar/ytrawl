// SPDX-License-Identifier: MIT
// Optional inbox shared with ytui. Missing ytui is not an error: this module
// only writes a small JSON file and never starts a download itself.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Model from './model.js';

const MAX_QUEUE_BYTES = 1024 * 1024;
const LOCK_WAIT_MS = 2000;
const STALE_LOCK_SECONDS = 30;

function queuePath() {
    return GLib.build_filenamev([GLib.get_user_state_dir(), 'ytui', 'shared-queue.json']);
}

function ensureDirectory(path) {
    const dir = GLib.path_get_dirname(path);
    GLib.mkdir_with_parents(dir, 0o700);
    try { GLib.chmod(dir, 0o700); } catch (e) { /* permissions may be managed by the host */ }
}

function emptyQueue() {
    return { version: 1, items: [] };
}

function readQueue(path) {
    if (!GLib.file_test(path, GLib.FileTest.EXISTS)) return emptyQueue();
    let text = '';
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        if (!ok) throw new Error('could not read shared queue file');
        text = new TextDecoder().decode(contents);
    } catch (e) {
        throw new Error('Could not read ytui shared queue: ' + (e.message || String(e)));
    }
    if (text.length > MAX_QUEUE_BYTES) throw new Error('ytui shared queue file is too large');
    let queue;
    try { queue = JSON.parse(text); } catch (e) { throw new Error('ytui shared queue JSON is invalid'); }
    if (!queue || queue.version !== 1 || !Array.isArray(queue.items))
        throw new Error('Unsupported ytui shared queue format');
    return queue;
}

function withLock(path, callback) {
    ensureDirectory(path);
    const lockPath = path + '.lock';
    const lockFile = Gio.File.new_for_path(lockPath);
    const deadline = GLib.get_monotonic_time() + LOCK_WAIT_MS * 1000;
    let stream = null;
    while (!stream && GLib.get_monotonic_time() < deadline) {
        try {
            stream = lockFile.create(Gio.FileCreateFlags.PRIVATE, null);
            stream.write_all(new TextEncoder().encode(String(Math.floor(GLib.get_real_time() / 1000000))), null);
            stream.close(null);
        } catch (e) {
            try {
                if (GLib.file_test(lockPath, GLib.FileTest.EXISTS)) {
                    const info = lockFile.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
                    const modified = info.get_modification_date_time().to_unix();
                    const now = Math.floor(GLib.get_real_time() / 1000000);
                    if (now - modified > STALE_LOCK_SECONDS) {
                        lockFile.delete(null);
                        continue;
                    }
                } else {
                    throw e;
                }
            } catch (lockError) {
                if (!GLib.file_test(lockPath, GLib.FileTest.EXISTS)) throw lockError;
            }
            GLib.usleep(20 * 1000);
        }
    }
    if (!stream) throw new Error('ytui shared queue is busy; try again shortly');
    try {
        return callback();
    } finally {
        try { lockFile.delete(null); } catch (e) { /* another process already removed a stale lock */ }
    }
}

function writeQueue(path, queue) {
    const text = JSON.stringify(queue, null, 2) + '\n';
    if (text.length > MAX_QUEUE_BYTES) throw new Error('ytui shared queue would become too large');
    if (!GLib.file_set_contents(path, text)) throw new Error('could not write ytui shared queue');
    try { GLib.chmod(path, 0o600); } catch (e) { /* keep the file usable on unusual filesystems */ }
}

/**
 * Append a download request for ytui. IDs make retries idempotent; the TUI
 * removes only accepted IDs after importing them into its persistent queue.
 */
export function appendSharedQueueItem(item) {
    const path = queuePath();
    if (!item || typeof item.id !== 'string' || !item.id ||
        typeof item.url !== 'string' || !Model.isSafePublicUrl(item.url)) {
        throw new Error('Only a valid public HTTP(S) media URL can be shared with ytui');
    }
    if (!['video', 'audio'].includes(item.mode)) throw new Error('Unsupported shared queue mode');
    return withLock(path, () => {
        const queue = readQueue(path);
        if (queue.items.some(existing => existing.id === item.id)) return { path, duplicate: true };
        queue.items.push({
            version: 1,
            id: item.id,
            url: item.url,
            title: String(item.title || '').slice(0, 512),
            mode: item.mode,
            quality: String(item.quality || 'best').slice(0, 128),
            audio_format: String(item.audio_format || '').slice(0, 32),
            created_at: String(item.created_at || new Date().toISOString()),
        });
        writeQueue(path, queue);
        return { path, duplicate: false };
    });
}
