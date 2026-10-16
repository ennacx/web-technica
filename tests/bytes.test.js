import test from 'node:test';
import assert from 'node:assert/strict';
import { Bytes } from '../src/assets/js/utils/bytes.js';
import { digestBytes, randomBytes, randomUint8, randomUint32 } from '../src/assets/js/utils/crypto.js';
import { createHash } from 'node:crypto';

test('byte encoders preserve view boundaries and support large binary inputs', () => {
    const storage = Uint8Array.from({ length: 300000 }, (_, i) => i % 256);
    for (const view of [storage, storage.subarray(1, 101), new DataView(storage.buffer, 5, 19), new Uint16Array(storage.buffer, 8, 15)]) {
        const expected = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
        assert.equal(Bytes.toBase64(view), expected.toString('base64'));
        assert.equal(Bytes.toBase64Url(view), expected.toString('base64url'));
        assert.equal(Bytes.toHex(view), expected.toString('hex'));
        assert.deepEqual(Bytes.fromBase64(Bytes.toBase64(view)), new Uint8Array(expected));
        assert.deepEqual(Bytes.fromBase64(Bytes.toBase64Url(view)), new Uint8Array(expected));
    }
    assert.equal(Bytes.toBase64(storage.buffer), Buffer.from(storage).toString('base64'));
    assert.equal(Bytes.toBase64(new Uint8Array()), '');
    assert.equal(Bytes.fromBase64(null), null);
    assert.throws(() => Bytes.fromBase64('!invalid!'));
    assert.deepEqual(Bytes.toUtf8('\u65e5\u672c\u8a9e\ud83d\udd11'), new Uint8Array(Buffer.from('\u65e5\u672c\u8a9e\ud83d\udd11')));
});

test('concatenation accepts variadic or array inputs without changing source data', () => {
    const a = new Uint8Array([1, 2]), b = new Uint8Array([3, 4]);
    for (const result of [Bytes.concat(a, b), Bytes.concat([a, null, b])]) {
        assert.deepEqual(result, new Uint8Array([1, 2, 3, 4]));
        result[0] = 255;
        assert.equal(a[0], 1);
    }
    assert.equal(Bytes.concat().length, 0);
});

test('shared random helpers use the supplied Web Crypto without insecure fallbacks', () => {
    const types = [];
    const crypto = { getRandomValues(view) { types.push(view.constructor); view.fill(0xffffffff); return view; } };
    assert.deepEqual(randomBytes(3, crypto), new Uint8Array([255, 255, 255]));
    assert.equal(randomUint8(crypto), 255);
    assert.equal(randomUint32(crypto), 0xffffffff);
    assert.deepEqual(types, [Uint8Array, Uint8Array, Uint32Array]);
    const denied = { getRandomValues() { throw new Error('denied'); } };
    assert.throws(() => randomBytes(4, denied), /denied/);
    for (const unavailable of [null, {}, { getRandomValues: true }, { subtle: { digest() {} } }]) {
        assert.throws(() => randomBytes(4, unavailable), /WebCrypto is not available/);
        assert.throws(() => randomUint8(unavailable), /WebCrypto is not available/);
        assert.throws(() => randomUint32(unavailable), /WebCrypto is not available/);
    }
});

test('shared digest returns bytes, preserves input slices and propagates failures', async () => {
    const data = Bytes.toUtf8('abc');
    for (const algorithm of ['SHA-256', 'SHA-384', 'SHA-512']) {
        const view = data.subarray(1);
        const result = await digestBytes(view, algorithm);
        assert.ok(result instanceof Uint8Array);
        assert.equal(Bytes.toHex(result), createHash(algorithm.toLowerCase().replace('-', '')).update(view).digest('hex'));
    }
    assert.equal(Bytes.toHex(await digestBytes(data)), createHash('sha256').update(data).digest('hex'));
    await assert.rejects(digestBytes(data, 'SHA-256', { subtle: { digest() { throw new Error('digest failed'); } } }), /digest failed/);
    for (const unavailable of [null, {}, { subtle: { digest: true } }, { getRandomValues() {} }]) {
        await assert.rejects(digestBytes(data, 'SHA-256', unavailable), /WebCrypto is not available/);
    }
});
