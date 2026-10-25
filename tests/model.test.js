import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDownloadArgs, cleanClipboardUrl, cleanUrlText, formatSize, guessOutputPath, isPartialArtifactName, isPathWithinDirectory, splitCustomArgs } from '../lib/model.js';

test('splits ordinary whitespace-separated arguments', () => {
    assert.deepEqual(splitCustomArgs('--no-warnings --limit-rate 5M'), [
        '--no-warnings', '--limit-rate', '5M',
    ]);
});

test('preserves spaces inside single and double quotes', () => {
    assert.deepEqual(splitCustomArgs('--cookies "/home/user/My Cookies/cookies.txt" --output-template \'%(title)s - %(id)s.%(ext)s\''), [
        '--cookies', '/home/user/My Cookies/cookies.txt',
        '--output-template', '%(title)s - %(id)s.%(ext)s',
    ]);
});

test('supports backslash-escaped spaces', () => {
    assert.deepEqual(splitCustomArgs('--cookies /home/user/My\\ Cookies/cookies.txt'), [
        '--cookies', '/home/user/My Cookies/cookies.txt',
    ]);
});

test('preserves an explicitly empty quoted argument', () => {
    assert.deepEqual(splitCustomArgs('--match-title ""'), ['--match-title', '']);
});

test('rejects an unclosed quote', () => {
    assert.throws(() => splitCustomArgs('--cookies "unfinished path'), /Unclosed quote/);
});

test('limits playlist downloads to the configured first items', () => {
    const job = {
        url: 'https://example.com/playlist',
        mode: 'video',
        quality: 'best',
        info: { isPlaylist: true },
    };
    const settings = {
        downloadDir: '/tmp/ytrawl-test',
        outputTemplate: '%(title)s.%(ext)s',
        playlistLimit: '5',
    };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    const index = args.indexOf('--playlist-items');
    assert.notEqual(index, -1);
    assert.equal(args[index + 1], '1-5');
});

test('does not limit playlist downloads when set to all', () => {
    const job = {
        url: 'https://example.com/playlist',
        mode: 'video',
        quality: 'best',
        info: { isPlaylist: true },
    };
    const settings = {
        downloadDir: '/tmp/ytrawl-test',
        outputTemplate: '%(title)s.%(ext)s',
        playlistLimit: 'all',
    };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args.includes('--playlist-items'), false);
});

test('does not add playlist item limits to a single video', () => {
    const job = {
        url: 'https://example.com/video',
        mode: 'video',
        quality: 'best',
        info: { isPlaylist: false },
    };
    const settings = {
        downloadDir: '/tmp/ytrawl-test',
        outputTemplate: '%(title)s.%(ext)s',
        playlistLimit: '1',
    };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args.includes('--playlist-items'), false);
});


test('formats terabyte-sized downloads without changing smaller units', () => {
    assert.equal(formatSize(1024 ** 4), '1.0 TB');
    assert.equal(formatSize(1024 ** 3), '1.0 GB');
    assert.equal(formatSize(1024 ** 2), '1.0 MB');
    assert.equal(formatSize(1024), '1.0 KB');
});


test('strips the closing angle bracket from autolinked URLs', () => {
    assert.equal(cleanUrlText('<https://example.com/video>'), 'https://example.com/video');
    assert.equal(cleanUrlText('https://example.com/video'), 'https://example.com/video');
});


test('falls back to all playlist items for unknown stored limits', () => {
    const job = {
        url: 'https://example.com/playlist',
        mode: 'video',
        quality: 'best',
        info: { isPlaylist: true },
    };
    const settings = {
        downloadDir: '/tmp/ytrawl-test',
        outputTemplate: '%(title)s.%(ext)s',
        playlistLimit: 'unexpected-legacy-value',
    };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args.includes('--playlist-items'), false);
});


test('contains opened output paths under the configured download directory', () => {
    assert.equal(isPathWithinDirectory('/home/user/Downloads/video.mp4', '/home/user/Downloads'), true);
    assert.equal(isPathWithinDirectory('/home/user/Downloads/../secret.txt', '/home/user/Downloads'), false);
    assert.equal(isPathWithinDirectory('/home/user/Downloads-archive/video.mp4', '/home/user/Downloads'), false);
    assert.equal(isPathWithinDirectory('/home/user/Downloads', '/home/user/Downloads'), false);
});


test('accepts only bounded public HTTP(S) clipboard URLs', () => {
    assert.equal(cleanClipboardUrl('https://example.com/video'), 'https://example.com/video');
    assert.equal(cleanClipboardUrl('javascript:alert(1)'), '');
    assert.equal(cleanClipboardUrl('https://127.0.0.1/private'), '');
    assert.equal(cleanClipboardUrl('https://example.com/video' + 'x'.repeat(4096)), '');
    assert.equal(cleanClipboardUrl('not a URL or media link'), '');
});


test('does not guess an output path for a custom yt-dlp template', () => {
    const job = { mode: 'video' };
    const info = { title: 'Example video' };
    assert.equal(guessOutputPath({ downloadDir: '/home/test/Downloads', outputTemplate: '%(uploader)s/%(title)s.%(ext)s' }, job, info, '/home/test'), '');
    assert.equal(guessOutputPath({ downloadDir: '/home/test/Downloads', outputTemplate: '%(title)s.%(ext)s' }, job, info, '/home/test'), '/home/test/Downloads/Example video.%(ext)s');
});


test('matches partial artifacts only at the title boundary', () => {
    assert.equal(isPartialArtifactName('video.mp4.part', 'video'), true);
    assert.equal(isPartialArtifactName('video.f137.mp4.part', 'video'), true);
    assert.equal(isPartialArtifactName('video.part-Frag12', 'video'), true);
    assert.equal(isPartialArtifactName('videography.mp4.part', 'video'), false);
    assert.equal(isPartialArtifactName('video-editor.mp4.part', 'video'), false);
    assert.equal(isPartialArtifactName('video.mp4', 'video'), false);
});
