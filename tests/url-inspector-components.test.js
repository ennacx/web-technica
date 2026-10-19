import test from 'node:test';
import assert from 'node:assert/strict';
import { componentFieldValue, componentUrlValue, hasHierarchicalPath, pathSegments, canHaveCredentials } from '../src/tools/url-inspector/js/components.js';
import { componentNames, UrlInspectorDocument } from '../src/tools/url-inspector/js/document.js';

test('credentials and port capability follows the URL host and file scheme rules', () => {
    for(const source of ['https://example.com/', 'http://[::1]/', 'ftp://example.com/', 'ws://example.com/', 'custom://host/path']){
        const url = new URL(source);
        assert.equal(canHaveCredentials(url), true, source);
        for(const name of ['username', 'password', 'port']){
            const probe = new URL(url);
            probe[name] = name === 'port' ? '8080' : 'test';
            assert.notEqual(probe[name], '', source + ' ' + name);
        }
    }
    for(const source of ['file:///a', 'file://server/a', 'mailto:hello@example.com', 'data:text/plain,hello', 'custom:/path', 'custom:///path']){
        const url = new URL(source);
        assert.equal(canHaveCredentials(url), false, source);
        for(const name of ['username', 'password', 'port']){
            const probe = new URL(url);
            probe[name] = name === 'port' ? '8080' : 'test';
            assert.equal(probe[name], '', source + ' ' + name);
        }
    }
});

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
        ['', []], ['/', ['/']], ['//', ['/', '', '']],
        ['/a', ['/', 'a']], ['/a//b/', ['/', 'a', '', 'b', '']],
        ['/a%2Fb/c%2fd/%252F', ['/', 'a%2Fb', 'c%2fd', '%252F']],
        ['/a%3Fb/%23c/%E3%81%82/%ZZ', ['/', 'a%3Fb', '%23c', '%E3%81%82', '%ZZ']],
        ['opaque/path', []],
        ['/<script>/x', ['/', '<script>', 'x']]
    ]){
        const result = pathSegments(pathname);
        assert.deepEqual(result, expected);
    }
});

test('opaque paths do not support hierarchy even when their content includes slashes', () => {
    for(const source of ['mailto:hello@example.com', 'data:text/plain,hello', 'data:text/html,<p>/a/b</p>', 'custom:opaque/a']){
        const url = new URL(source);
        assert.equal(hasHierarchicalPath(url), false, source);
        assert.deepEqual(pathSegments(url.pathname), []);
    }
    for(const source of ['https://example.com/a%2Fb/c', 'file:///a/b', 'custom:/a/b', 'custom://host', 'mailto:/hierarchical/path']){
        assert.equal(hasHierarchicalPath(new URL(source)), true, source);
    }
    assert.deepEqual(pathSegments(new URL('https://example.com/a%2Fb/c').pathname), ['/', 'a%2Fb', 'c']);
});
