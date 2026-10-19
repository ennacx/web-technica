import test from 'node:test';
import assert from 'node:assert/strict';
import { componentFieldValue, componentUrlValue, pathSegments } from '../src/tools/url-inspector/js/components.js';
import { componentNames, UrlInspectorDocument } from '../src/tools/url-inspector/js/document.js';

test('fixed punctuation round-trips component values, including literal hashes in fragments', () => {
    for(const [name, urlValue, fieldValue] of [
        ['protocol', 'https:', 'https'], ['protocol', 'web+demo:', 'web+demo'],
        ['hash', '#results', 'results'], ['hash', '##results', '#results'],
        ['hash', '#a%2Fb', 'a%2Fb'], ['hash', '', ''],
        ['pathname', '/a//b/', '/a//b/']
    ]){
        assert.equal(componentFieldValue(name, urlValue), fieldValue);
        assert.equal(componentUrlValue(name, fieldValue), urlValue);
    }
    assert.equal(componentUrlValue('protocol', 'http:'), 'http:');
    assert.equal(componentUrlValue('protocol', ''), '');
});

test('punctuation-free fields apply through the model and can remove a fragment', () => {
    const document = new UrlInspectorDocument();
    document.setCurrent('https://example.com/a//b%2Fc/?q=a%20b#old');
    const drafts = Object.fromEntries(componentNames.map((name) => [name, componentFieldValue(name, document.lastValidUrl[name])]));
    const apply = () => document.applyComponents(Object.fromEntries(componentNames.map((name) => [name, componentUrlValue(name, drafts[name])])));
    drafts.protocol = 'http';
    drafts.hash = 'new';
    apply();
    assert.equal(document.currentUrl, 'http://example.com/a//b%2Fc/?q=a%20b#new');
    drafts.hash = '';
    apply();
    assert.equal(document.currentUrl, 'http://example.com/a//b%2Fc/?q=a%20b');
    drafts.hash = '#literal';
    apply();
    assert.ok(document.currentUrl.endsWith('##literal'));
});

test('path breadcrumbs start with Root and preserve additional empty segments without decoding', () => {
    for(const [pathname, expected] of [
        ['', ['/']], ['/', ['/']], ['//', ['/', '', '']],
        ['/a', ['/', 'a']], ['/a//b/', ['/', 'a', '', 'b', '']],
        ['/a%2Fb/c%2fd/%252F', ['/', 'a%2Fb', 'c%2fd', '%252F']],
        ['/a%3Fb/%23c/%E3%81%82/%ZZ', ['/', 'a%3Fb', '%23c', '%E3%81%82', '%ZZ']],
        ['opaque/path', ['/', 'opaque', 'path']],
        ['/<script>/x', ['/', '<script>', 'x']]
    ]){
        const result = pathSegments(pathname);
        assert.deepEqual(result, expected);
    }
});
