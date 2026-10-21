import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDownloadArgs, splitCustomArgs } from '../lib/model.js';

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
