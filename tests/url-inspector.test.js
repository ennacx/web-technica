import test from 'node:test';
import assert from 'node:assert/strict';
import { componentNames, UrlInspectorDocument } from '../src/tools/url-inspector/js/document.js';

const draftsFor = (document, changes) => ({ ...Object.fromEntries(componentNames.map((name) => [name, document.lastValidUrl[name]])), ...changes });

test('hostname validation uses the target scheme rather than HTTP normalization', () => {
    for(const [source, changes, expected] of [
        ['custom://host/path', { hostname: 'EXAMPLE.ORG' }, 'custom://EXAMPLE.ORG/path'],
        ['https://example.com/path', { hostname: 'EXAMPLE.ORG' }, 'https://example.org/path'],
        ['file://server/path', { hostname: 'localhost' }, 'file:///path'],
        ['file://server/path', { hostname: 'LOCALHOST' }, 'file:///path'],
        ['custom://host/path', { hostname: 'localhost' }, 'custom://localhost/path'],
        ['https://example.com/path', { protocol: 'file:', hostname: 'localhost' }, 'file:///path'],
        ['file://server/path', { protocol: 'https:', hostname: 'LOCALHOST' }, 'https://localhost/path']
    ]){
        const document = new UrlInspectorDocument();
        document.setCurrent(source);
        document.applyComponents(draftsFor(document, changes));
        assert.equal(document.currentUrl, expected, source + ' ' + JSON.stringify(changes));
        assert.equal(document.originalUrl, source);
    }
});

test('scheme-aware hostname validation still rejects other URL components atomically', () => {
    for(const source of ['https://example.com/path', 'custom://host/path', 'file://server/path']){
        for(const hostname of ['other/path', 'user@other', 'other?query', 'other#fragment', 'other:8080', 'bad host', 'other\\path']){
            const document = new UrlInspectorDocument();
            document.setCurrent(source);
            assert.throws(() => document.applyComponents(draftsFor(document, { hostname, pathname: '/must-not-commit' })), (error) => error.component === 'hostname');
            assert.equal(document.currentUrl, source);
        }
    }
});

test('component transactions validate credentials and port against the rebuilt URL', () => {
    const document = new UrlInspectorDocument();
    for(const original of ['file://server/a', 'mailto:hello@example.com', 'custom:/path']){
        document.setCurrent(original);
        for(const name of ['username', 'password', 'port']){
            assert.throws(() => document.applyComponents(draftsFor(document, { [name]: name === 'port' ? '8080' : 'test' })), (error) => error.component === name);
            assert.equal(document.currentUrl, original);
        }
    }
    document.setCurrent('https://user:secret@example.com:8443/a');
    const before = document.currentUrl;
    assert.throws(() => document.applyComponents(draftsFor(document, { protocol: 'file:' })));
    assert.equal(document.currentUrl, before);
    document.applyComponents(draftsFor(document, { protocol: 'file:', username: '', password: '', port: '' }));
    assert.equal(document.currentUrl, 'file://example.com/a');
    assert.throws(() => document.applyComponents(draftsFor(document, { username: 'forbidden', pathname: '/other' })));
    assert.equal(document.currentUrl, 'file://example.com/a');
    document.applyComponents(draftsFor(document, { protocol: 'https:', username: 'allowed', port: '8080' }));
    assert.equal(document.currentUrl, 'https://allowed@example.com:8080/a');

    document.setCurrent('custom://user:secret@host:8080/path');
    document.applyComponents(draftsFor(document, { hostname: '', username: '', password: '', port: '' }));
    assert.equal(document.currentUrl, 'custom:///path');
    assert.throws(() => document.applyComponents(draftsFor(document, { password: 'forbidden' })));
    assert.equal(document.currentUrl, 'custom:///path');
    document.applyComponents(draftsFor(document, { hostname: 'host', password: 'allowed', port: '8080' }));
    assert.equal(document.lastValidUrl.password, 'allowed');
    assert.equal(document.lastValidUrl.port, '8080');
});

test('empty query keys and values remain separate ordered rows after editing', () => {
    for(const query of ['?=', '?=&=']){
        const document = new UrlInspectorDocument();
        document.setCurrent('https://example.com/' + query);
        const count = query === '?=' ? 1 : 2;
        assert.deepEqual(document.rows.map(({ key, value }) => [key, value]), Array.from({ length: count }, () => ['', '']));
        const id = document.rows[0].id;
        document.editRow(id, 'value', 'temporary');
        document.editRow(id, 'value', '');
        assert.equal(document.currentUrl, 'https://example.com/' + query);
        assert.equal(new Set(document.rows.map((row) => row.id)).size, count);
    }
});

test('an empty fragment marker is kept until the fragment is explicitly changed', () => {
    const document = new UrlInspectorDocument();
    const original = 'https://example.com/#';
    document.setCurrent(original);
    assert.equal(document.lastValidUrl.hash, '');
    assert.equal(document.currentUrl, original);
    document.applyComponents(draftsFor(document, { pathname: '/changed' }));
    assert.equal(document.currentUrl, 'https://example.com/changed#');
    document.applyComponents(draftsFor(document, { hash: '#value' }));
    document.applyComponents(draftsFor(document, { hash: '' }));
    assert.equal(document.currentUrl, 'https://example.com/changed');
    document.reset();
    assert.equal(document.currentUrl, original);
});

test('direct input stays exact; Original is saved only once and survives Invalid/Clear/Reset', () => {
    const document = new UrlInspectorDocument();
    document.setCurrent('/relative');
    assert.equal(document.valid, false);
    assert.equal(document.originalUrl, null);
    const original = 'HTTPS://Example.COM:443/?q=a%20b&flag#';
    document.setCurrent(original);
    assert.equal(document.currentUrl, original);
    assert.equal(document.originalUrl, original);
    document.setCurrent('https://example.com/?a=2');
    assert.equal(document.originalUrl, original);
    const parsed = document.lastValidUrl;
    const rows = document.rows;
    document.setCurrent('broken input');
    assert.equal(document.currentUrl, 'broken input');
    assert.equal(document.lastValidUrl, parsed);
    assert.equal(document.rows, rows);
    document.storeOriginal();
    assert.equal(document.originalUrl, original);
    document.setCurrent('');
    document.reset();
    assert.equal(document.currentUrl, original);
    assert.equal(document.valid, true);
    document.setCurrent('https://example.com/?a=3');
    document.storeOriginal();
    document.setCurrent('');
    document.reset();
    assert.equal(document.currentUrl, 'https://example.com/?a=3');
});

test('standard URL parsing supports IPs, IDN, credentials, encodings and opaque schemes', () => {
    const document = new UrlInspectorDocument();
    for(const url of [
        'http://127.0.0.1:8080/path?x=1#part',
        'https://[2001:db8::1]:8443/a',
        'https://例え.テスト/%E3%81%82',
        'https://user:p%40ss@example.com/',
        'mailto:hello@example.com', 'data:text/plain,hello',
        'https://example.com/?', 'https://example.com/#'
    ]){
        document.setCurrent(url);
        assert.equal(document.valid, true, url);
        assert.equal(document.currentUrl, url);
    }
    for(const url of ['no url', '/path?a=1', 'https://', 'https://example.com:99999/']){
        document.setCurrent(url);
        assert.equal(document.valid, false, url);
    }
});

test('query edits preserve duplicate keys, order and stable IDs through all operations', () => {
    const document = new UrlInspectorDocument();
    document.setCurrent('https://example.com/?tag=photo&tag=travel&=empty&flag');
    const [first, second] = document.rows;
    document.editRow(second.id, 'value', 'roadster & a=b');
    assert.deepEqual([...new URL(document.currentUrl).searchParams], [['tag', 'photo'], ['tag', 'roadster & a=b'], ['', 'empty'], ['flag', '']]);
    document.moveRow(second.id, -1);
    assert.equal(document.rows[0].id, second.id);
    assert.equal(new URL(document.currentUrl).searchParams.get('tag'), 'roadster & a=b');
    document.deleteRow(first.id);
    assert.equal(document.rows.length, 3);
    const id = document.addRow();
    document.editRow(id, 'key', 'new');
    document.editRow(id, 'value', '');
    assert.equal(document.rows.at(-1).id, id);
    assert.ok(document.currentUrl.endsWith('&new='));
    document.setCurrent('invalid');
    const text = document.currentUrl;
    document.editRow(id, 'value', 'ignored');
    document.deleteRow(id);
    document.addRow();
    assert.equal(document.currentUrl, text);
});

test('query semantics use URLSearchParams including a second question mark and encoded delimiters', () => {
    const document = new UrlInspectorDocument();
    document.setCurrent('https://example.com/?a=1&&b=2?c=3&q=a+b&r=a%20b&x=%26%3D&flag');
    assert.deepEqual(document.rows.map(({ key, value }) => [key, value]), [
        ['a', '1'], ['b', '2?c=3'], ['q', 'a b'], ['r', 'a b'], ['x', '&='], ['flag', '']
    ]);
    const id = document.rows[0].id;
    document.editRow(id, 'value', '2');
    assert.ok(document.currentUrl.includes('b=2%3Fc%3D3&q=a+b&r=a+b&x=%26%3D&flag='));
    for(const row of [...document.rows]){ document.deleteRow(row.id); }
    assert.equal(new URL(document.currentUrl).search, '');
});

test('component edits normalize only on commit and rejected setters are atomic', () => {
    const document = new UrlInspectorDocument();
    const original = 'HTTPS://Example.COM/?q=a%20b';
    document.setCurrent(original);
    document.applyComponents(draftsFor(document, { hostname: 'EXAMPLE.ORG', port: '443', pathname: '/new path', hash: 'results', username: 'a@b', password: 'p:q' }));
    const url = new URL(document.currentUrl);
    assert.equal(url.hostname, 'example.org');
    assert.equal(url.port, '');
    assert.equal(url.pathname, '/new%20path');
    assert.equal(url.username, 'a%40b');
    assert.equal(url.password, 'p%3Aq');
    assert.equal(url.hash, '#results');
    assert.equal(url.search, '?q=a%20b');
    assert.equal(document.originalUrl, original);
    for(const changes of [{ port: '123abc' }, { port: '65536' }, { hostname: 'bad/host' }, { hostname: 'bad host' }, { protocol: 'mailto:' }, { protocol: '' }]){
        const before = document.currentUrl;
        assert.throws(() => document.applyComponents(draftsFor(document, { pathname: '/must-not-commit', ...changes })));
        assert.equal(document.currentUrl, before);
    }
    document.setCurrent('mailto:hello@example.com');
    assert.throws(() => document.applyComponents(draftsFor(document, { pathname: 'other@example.com' })));
    document.setCurrent('https://example.com/');
    document.applyComponents(draftsFor(document, { hostname: '[::1]', port: '8080', protocol: 'http' }));
    assert.equal(document.currentUrl, 'http://[::1]:8080/');
});
