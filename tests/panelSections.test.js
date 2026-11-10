// SPDX-License-Identifier: MIT

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panelSource = readFileSync(new URL('../lib/panel.js', import.meta.url), 'utf8');
const sectionsSource = readFileSync(new URL('../lib/panel-sections.js', import.meta.url), 'utf8');

test('panel passes every extracted section builder dependency', () => {
    const call = panelSource.match(/buildPanelSections\(this, content, \{([\s\S]*?)\n        \}\);/);
    assert.ok(call, 'panel must call buildPanelSections with a dependency object');

    for (const dependency of ['createChapterSection', 'buildAdvancedBody']) {
        assert.match(
            call[1],
            new RegExp('\\b' + dependency + '\\b'),
            `panel must pass ${dependency} to buildPanelSections`
        );
        assert.match(
            sectionsSource,
            new RegExp('\\b' + dependency + '\\b'),
            `panel-sections must declare ${dependency} as an injected dependency`
        );
    }
});
