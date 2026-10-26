import assert from 'node:assert/strict';
import test from 'node:test';

import { archivePath, buildDownloadArgs, cleanClipboardUrl, cleanUrlText, formatSize, guessOutputPath, isPartialArtifactName, isPathWithinDirectory, isSafePublicUrl, isSearchQuery, redactSensitiveLogText, splitCustomArgs, validateDownloadDirectory } from '../lib/model.js';

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
    assert.equal(cleanClipboardUrl('  https://example.com/video  '), 'https://example.com/video');
    assert.equal(cleanClipboardUrl('javascript:alert(1)'), '');
    assert.equal(cleanClipboardUrl('file:///etc/passwd'), '');
    assert.equal(cleanClipboardUrl('ftp://example.com/video'), '');
    assert.equal(cleanClipboardUrl('https://127.0.0.1/private'), '');
    assert.equal(cleanClipboardUrl('https://localhost/private'), '');
    assert.equal(cleanClipboardUrl('https://[::1]/private'), '');
    assert.equal(cleanClipboardUrl('https://example.com/video' + 'x'.repeat(4096)), '');
    assert.equal(cleanClipboardUrl('not a URL or media link'), '');
});


test('rejects non-public IP literal hosts in thumbnail URLs', () => {
    for (const host of [
        '127.0.0.1',
        '10.0.0.4',
        '100.64.0.1',
        '169.254.10.20',
        '172.20.1.2',
        '192.0.2.10',
        '192.168.1.1',
        '198.18.0.1',
        '198.51.100.4',
        '203.0.113.5',
        '224.0.0.1',
        '255.255.255.255',
        '[::]',
        '[::1]',
        '[::ffff:127.0.0.1]',
        '[fc00::1]',
        '[fd12:3456::1]',
        '[fe80::1]',
        '[ff02::1]',
        '[2001:db8::1]',
    ]) {
        assert.equal(isSafePublicUrl('https://' + host + '/thumbnail.jpg'), false, host);
    }
    assert.equal(isSafePublicUrl('https://i.ytimg.com/vi/example/hqdefault.jpg'), true);
    assert.equal(isSafePublicUrl('https://cdn.example.com/thumb.jpg'), true);
});

test('does not guess an output path for a custom yt-dlp template', () => {
    const job = { mode: 'video' };
    const info = { title: 'Example video' };
    assert.equal(guessOutputPath({ downloadDir: '/home/test/Downloads', outputTemplate: '%(uploader)s/%(title)s.%(ext)s' }, job, info, '/home/test'), '');
    assert.equal(guessOutputPath({ downloadDir: '/home/test/Downloads', outputTemplate: '%(title)s.%(ext)s' }, job, info, '/home/test'), '');
});


test('matches partial artifacts only at the title boundary', () => {
    assert.equal(isPartialArtifactName('video.mp4.part', 'video'), true);
    assert.equal(isPartialArtifactName('video.f137.mp4.part', 'video'), true);
    assert.equal(isPartialArtifactName('video.part-Frag12', 'video'), true);
    assert.equal(isPartialArtifactName('video.f137.mp4.part-Frag2', 'video'), true);
    assert.equal(isPartialArtifactName('video.f140.m4a.part-Frag12', 'video'), true);
    assert.equal(isPartialArtifactName('videography.mp4.part', 'video'), false);
    assert.equal(isPartialArtifactName('video-editor.mp4.part', 'video'), false);
    assert.equal(isPartialArtifactName('video.mp4', 'video'), false);
});


test('validates download directories while preserving empty and home defaults', () => {
    assert.equal(validateDownloadDirectory('', '/home/test'), '');
    assert.equal(validateDownloadDirectory('~/Downloads', '/home/test'), '');
    assert.equal(validateDownloadDirectory('relative/Downloads', '/home/test'), 'Download directory must be an absolute path or begin with ~/.' );
    assert.notEqual(validateDownloadDirectory('/', '/home/test'), '');
    assert.notEqual(validateDownloadDirectory('/proc/media', '/home/test'), '');
    assert.notEqual(validateDownloadDirectory('/home/test/Downloads\nunsafe', '/home/test'), '');
});


test('places the intended URL before custom yt-dlp arguments', () => {
    const job = {
        url: 'https://example.com/video',
        mode: 'video',
        quality: 'best',
        info: { isPlaylist: false },
    };
    const settings = {
        downloadDir: '/tmp/ytrawl-test',
        outputTemplate: '%(title)s.%(ext)s',
        customArgs: '--limit-rate 5M',
    };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.ok(args.indexOf(job.url) < args.indexOf('--limit-rate'));
    assert.equal(args[args.indexOf('--limit-rate') + 1], '5M');
});


test('builds DRC video selectors with explicit quality fallbacks', () => {
    const job = { url: 'https://example.com/video', mode: 'video', quality: '720', info: {} };
    const settings = { downloadDir: '/tmp/ytrawl-test', outputTemplate: '%(title)s.%(ext)s', preferDrc: true };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args[args.indexOf('-f') + 1], "(bestvideo[height<=720]+bestaudio[format_id$='-drc'])/(bestvideo[height<=720]+bestaudio)/best[height<=720]");
});

test('builds DRC audio selectors with language and normal-audio fallbacks', () => {
    const job = { url: 'https://example.com/audio', mode: 'audio', audioFormat: 'best', audioLanguage: 'en', info: {} };
    const settings = { downloadDir: '/tmp/ytrawl-test', outputTemplate: '%(title)s.%(ext)s', preferDrc: true };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args[args.indexOf('-f') + 1], "bestaudio[language=en][format_id$='-drc']/bestaudio[language=en]/bestaudio");
});

test('builds a DRC-aware best-quality video selector with normal fallback', () => {
    const job = { url: 'https://example.com/video', mode: 'video', quality: 'best', info: {} };
    const settings = { downloadDir: '/tmp/ytrawl-test', outputTemplate: '%(title)s.%(ext)s', preferDrc: true };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args[args.indexOf('-f') + 1],
        "(bestvideo*+bestaudio[format_id$='-drc'])/(bestvideo*+bestaudio)/best");
});

test('builds DRC audio selector with a normal-audio fallback when no language is selected', () => {
    const job = { url: 'https://example.com/audio', mode: 'audio', audioFormat: 'best', audioLanguage: '', info: {} };
    const settings = { downloadDir: '/tmp/ytrawl-test', outputTemplate: '%(title)s.%(ext)s', preferDrc: true };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args[args.indexOf('-f') + 1],
        "bestaudio[format_id$='-drc']/bestaudio");
});

test('uses the ordinary audio selector when DRC is disabled', () => {
    const job = { url: 'https://example.com/audio', mode: 'audio', audioFormat: 'best', audioLanguage: 'en', info: {} };
    const settings = { downloadDir: '/tmp/ytrawl-test', outputTemplate: '%(title)s.%(ext)s', preferDrc: false };
    const args = buildDownloadArgs(job, settings, false, '/home/test');
    assert.equal(args[args.indexOf('-f') + 1], 'bestaudio[language=en]/bestaudio');
});


test('redacts obvious cookie paths, proxy credentials, and token arguments', () => {
    const log = redactSensitiveLogText('--cookies /home/user/.config/browser/cookies.txt --proxy http://alice:secret@proxy.example:8080 --token=abc123');
    assert.match(log, /--cookies \[redacted\]/);
    assert.match(log, /--proxy \[redacted\]/);
    assert.match(log, /--token=\[redacted\]/);
    assert.doesNotMatch(log, /cookies\.txt|alice:secret|abc123/);
    assert.match(redactSensitiveLogText('Proxy URL: http://alice:secret@proxy.example:8080'), /Proxy URL: \[redacted\]/i);
});


test('uses one shared archive path for yt-dlp arguments and archive clearing', () => {
    assert.equal(archivePath('/home/test/Downloads'), '/home/test/Downloads/.ytrawl-archive.txt');
    assert.equal(archivePath('/'), '/.ytrawl-archive.txt');
    const args = buildDownloadArgs(
        { url: 'https://example.com/video', mode: 'video', quality: 'best', info: { isPlaylist: false } },
        { downloadDir: '/home/test/Downloads', outputTemplate: '%(title)s.%(ext)s', useArchive: true },
        false,
        '/home/test',
    );
    const archiveIndex = args.indexOf('--download-archive');
    assert.notEqual(archiveIndex, -1);
    assert.equal(args[archiveIndex + 1], archivePath('/home/test/Downloads'));
});


test('distinguishes raw search text from media URLs for privacy-sensitive history', () => {
    assert.equal(isSearchQuery('private medical lecture'), true);
    assert.equal(isSearchQuery('ytsearch1:private medical lecture'), false);
    assert.equal(isSearchQuery('https://example.com/video'), false);
    assert.equal(isSearchQuery('example.com/video'), false);
});
