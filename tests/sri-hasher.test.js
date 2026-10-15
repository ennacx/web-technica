import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    ALGORITHMS, getExtension, validateURL, validateFile,
    fetchContent, sriFromArrayBuffer, makeHtmlTag
} from '../src/tools/sri-hasher/js/sri-hasher.js';

test('SRI matches independent hashes for all algorithms, empty files, UTF-8 and binary data', async () => {
    const samples = [new Uint8Array(), new TextEncoder().encode('abc'), new TextEncoder().encode('\u65e5\u672c\u8a9e\r\n'), new Uint8Array([0, 255, 128, 10, 13])];
    for (const algorithm of ALGORITHMS) {
        for (const bytes of samples) {
            const name = algorithm.toLowerCase().replace('-', '');
            const expected = name + '-' + createHash(name).update(bytes).digest('base64');
            assert.equal(await sriFromArrayBuffer(bytes.buffer, algorithm), expected);
        }
    }
    assert.equal(await sriFromArrayBuffer(samples[1].buffer, 'SHA-256'), 'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
});

test('supports script/style filenames and URL query filenames, with pathname priority', () => {
    assert.equal(getExtension('library.MIN.JS'), 'js');
    assert.equal(getExtension(new URL('https://cdn.example/download?filename=theme.css')), 'css');
    assert.equal(getExtension(new URL('https://cdn.example/download?file=library.js')), 'js');
    assert.equal(getExtension(new URL('https://cdn.example/theme.css?file=library.js#x')), 'css');
    for (const url of ['https://cdn.example/lib.js?v=1', 'http://localhost/theme.CSS', 'https://cdn.example/download?file=lib.js']) {
        assert.equal(validateURL(url).isValid, true);
    }
    for (const url of ['', 'lib.js', 'javascript:alert(1)', 'data:text/javascript,1', 'file:///lib.js', 'https://cdn.example/lib.txt?file=lib.js', 'https://user:password@cdn.example/lib.js']) {
        assert.equal(validateURL(url).isValid, false, url);
    }
    assert.equal(validateFile({ name: 'empty.js', size: 0 }).isValid, true);
    for (const file of [null, {}, { name: 'image.png' }]) assert.equal(validateFile(file).isValid, false);
});

test('generated tags escape resource attributes and retain integrity/crossorigin', () => {
    const sri = 'sha256-example=';
    assert.equal(makeHtmlTag('https://cdn.example/lib.js?a=1&b=2', sri, 'js'), '<script src="https://cdn.example/lib.js?a=1&amp;b=2" integrity="sha256-example=" crossorigin="anonymous"></script>');
    assert.equal(makeHtmlTag('./theme.css', sri, 'css'), '<link rel="stylesheet" href="./theme.css" integrity="sha256-example=" crossorigin="anonymous">');
    assert.ok(makeHtmlTag('x" onload="bad<>&\'', sri, 'js').includes('x&quot; onload=&quot;bad&lt;&gt;&amp;&#39;'));
    assert.throws(() => makeHtmlTag('a.png', sri, 'png'), /Unsupported/);
});

test('fetches bytes once, requires CORS and omits credentials and referrer', async () => {
    const bytes = new Uint8Array([0, 255, 10]).buffer;
    const calls = [];
    const result = await fetchContent('https://cdn.example/lib.js', async (...args) => {
        calls.push(args);
        return { ok: true, arrayBuffer: async () => bytes };
    });
    assert.equal(result, bytes);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['https://cdn.example/lib.js', {
        mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    }]);
});

test('reports HTTP and network/CORS failures without hashing error pages', async () => {
    await assert.rejects(fetchContent('https://cdn.example/lib.js', async () => ({
        ok: false, status: 404, arrayBuffer() { throw new Error('must not read'); }
    })), /HTTP 404/);
    await assert.rejects(fetchContent('https://cdn.example/lib.js', async () => { throw new TypeError('Network'); }), /CORS/);
    await assert.rejects(fetchContent('data:text/plain,test', () => { throw new Error('must not fetch'); }), /HTTP or HTTPS/);
});

test('rejects unsupported algorithms, missing Web Crypto and digest errors', async () => {
    const buffer = new ArrayBuffer(0);
    await assert.rejects(sriFromArrayBuffer(buffer, 'SHA-1'), /Choose SHA/);
    await assert.rejects(sriFromArrayBuffer(buffer, 'SHA-256', {}), /Web Crypto/);
    await assert.rejects(sriFromArrayBuffer(buffer, 'SHA-256', {
        subtle: { digest() { throw new Error('Digest failed'); } }
    }), /Digest failed/);
});
