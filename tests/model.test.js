import assert from 'node:assert/strict';
import test from 'node:test';

import { splitCustomArgs } from '../lib/model.js';

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
