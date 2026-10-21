import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto, createPrivateKey, createPublicKey, createHash, createHmac, createDecipheriv } from 'node:crypto';

// Argon2はブラウザー用WASM。Node用分岐を踏まずに実際のブラウザーバンドルを検証する。
const requireKeygen = createRequire(new URL('../src/tools/keygen/package.json', import.meta.url));
const { build } = requireKeygen('esbuild');
const bundle = await build({
    stdin: { contents: "export * from './js/keygen.js'; export {default as argon2} from 'argon2-browser/dist/argon2-bundled.min.js';", resolveDir: fileURLToPath(new URL('../src/tools/keygen/', import.meta.url)) },
    alias: { '#utils': fileURLToPath(new URL('../src/assets/js/utils', import.meta.url)) },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'KeygenTest', write: false, logLevel: 'silent'
});
const context = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, DataView, WebAssembly, atob, btoa, setTimeout, clearTimeout,
    console: { log() { throw new Error('Key material must not be logged'); }, error() { throw new Error('Unexpected crypto error logging'); }, warn() {} }
};
context.self = context.window = context;
vm.createContext(context);
vm.runInContext(bundle.outputFiles[0].text, context);
const { generateKeypair, validateKeyOptions, argon2 } = context.KeygenTest;
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const unpad = (bytes) => bytes[0] === 0 ? bytes.subarray(1) : bytes;
const read = (bytes) => {
    const data = Buffer.from(bytes); let offset = 0;
    return { u32() { const n = data.readUInt32BE(offset); offset += 4; return n; }, string() { const n = this.u32(); const value = data.subarray(offset, offset + n); offset += n; return value; } };
};
const sshString = (data) => { const bytes = Buffer.from(data); const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); return Buffer.concat([length, bytes]); };
const publicDER = (key) => createPublicKey(key).export({ type: 'spki', format: 'der' });

// 出力を独立にパースし、Node/OpenSSLで読み取ったPEMと同じ公開鍵になるか検証する。
function privateFromPPK(publicBlob, privateBlob) {
    const pub = read(publicBlob), priv = read(privateBlob);
    const type = pub.string().toString();
    let jwk;
    if (type === 'ssh-rsa') {
        const e = unpad(pub.string()), n = unpad(pub.string());
        const d = unpad(priv.string()), p = unpad(priv.string()), q = unpad(priv.string()), qi = unpad(priv.string());
        const big = (bytes) => BigInt('0x' + bytes.toString('hex'));
        const encoded = (value) => { const hex = value.toString(16); return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex').toString('base64url'); };
        jwk = { kty: 'RSA', n: b64(n), e: b64(e), d: b64(d), p: b64(p), q: b64(q), qi: b64(qi), dp: encoded(big(d) % (big(p) - 1n)), dq: encoded(big(d) % (big(q) - 1n)) };
    } else if (type.startsWith('ecdsa-')) {
        const curve = pub.string().toString(); const point = pub.string();
        const length = (point.length - 1) / 2; const d = unpad(priv.string());
        jwk = { kty: 'EC', crv: { nistp256: 'P-256', nistp384: 'P-384', nistp521: 'P-521' }[curve], x: b64(point.subarray(1, 1 + length)), y: b64(point.subarray(1 + length)), d: b64(Buffer.concat([Buffer.alloc(length - d.length), d])) };
    } else {
        const publicKey = pub.string(); const seed = priv.string();
        assert.equal(seed.length, type === 'ssh-ed25519' ? 32 : 57);
        jwk = { kty: 'OKP', crv: type === 'ssh-ed25519' ? 'Ed25519' : 'Ed448', x: b64(publicKey), d: b64(seed) };
    }
    return createPrivateKey({ key: jwk, format: 'jwk' });
}

async function verifyPPK(result, passphrase = '') {
    const lines = result.ppk.trim().split(/\r?\n/);
    const value = (name) => lines.find((line) => line.startsWith(name + ': '))?.slice(name.length + 2);
    const block = (name) => { const i = lines.findIndex((line) => line.startsWith(name + ': ')); return Buffer.from(lines.slice(i + 1, i + 1 + Number(value(name))).join(''), 'base64'); };
    const publicBlob = block('Public-Lines'); let privateBlob = block('Private-Lines');
    let macKey = Buffer.alloc(0);
    assert.equal(publicBlob.toString('base64'), result.openssh.split(' ')[1]);
    if (passphrase) {
        const derived = await argon2.hash({ pass: new TextEncoder().encode(passphrase), salt: new Uint8Array(Buffer.from(value('Argon2-Salt'), 'hex')), time: Number(value('Argon2-Passes')), mem: Number(value('Argon2-Memory')), parallelism: Number(value('Argon2-Parallelism')), hashLen: 80, type: argon2.ArgonType.Argon2id });
        const key = Buffer.from(derived.hash);
        const decipher = createDecipheriv('aes-256-cbc', key.subarray(0, 32), key.subarray(32, 48));
        decipher.setAutoPadding(false);
        privateBlob = Buffer.concat([decipher.update(privateBlob), decipher.final()]);
        macKey = key.subarray(48);
    }
    const message = Buffer.concat([value('PuTTY-User-Key-File-3'), value('Encryption'), value('Comment'), publicBlob, privateBlob].map(sshString));
    assert.equal(createHmac('sha256', macKey).update(message).digest('hex'), value('Private-MAC'));
    const recovered = privateFromPPK(publicBlob, privateBlob);
    assert.deepEqual(publicDER(recovered), createPublicKey(result.publicPEM).export({ type: 'spki', format: 'der' }));
}

test('all key algorithms and sizes export matching PEM, SSH fingerprints and readable PPK v3', async (t) => {
    const cases = [2048, 3072, 4096].map(length => ({ algorithm: 'RSA', length }));
    cases.push(...['P-256', 'P-384', 'P-521'].map(curve => ({ algorithm: 'ECDSA', curve })), ...['Ed25519', 'Ed448'].map(curve => ({ algorithm: 'EdDSA', curve })));
    for (const settings of cases) await t.test(settings.algorithm + ' ' + (settings.length || settings.curve), async () => {
        const result = await generateKeypair({ ...settings, comment: ' test key\n' });
        assert.deepEqual(publicDER(createPrivateKey(result.privatePEM)), createPublicKey(result.publicPEM).export({ type: 'spki', format: 'der' }));
        const hash = createHash('sha256').update(Buffer.from(result.openssh.split(' ')[1], 'base64')).digest('base64').replace(/=+$/, '');
        assert.ok(result.fingerprint.endsWith('SHA256:' + hash));
        assert.ok(result.openssh.endsWith(' test-key'));
        await verifyPPK(result);
    });
});

test('encrypted PKCS#8 and PPK decrypt to the advertised public key', async () => {
    const passphrase = 'test-only-\u65e5\u672c\u8a9e-passphrase';
    const result = await generateKeypair({ algorithm: 'EdDSA', curve: 'Ed25519', encryption: 'pkcs8', passphrase });
    const privateKey = createPrivateKey({ key: result.privatePEM, passphrase });
    assert.deepEqual(publicDER(privateKey), createPublicKey(result.publicPEM).export({ type: 'spki', format: 'der' }));
    assert.throws(() => createPrivateKey({ key: result.privatePEM, passphrase: 'wrong' }));
    await verifyPPK(result, passphrase);
    await assert.rejects(() => verifyPPK(result, 'wrong-passphrase'), 'PPK MAC rejects a wrong passphrase');
    const tampered = { ...result, ppk: result.ppk.replace(/(Private-Lines: \d+\r?\n)([A-Za-z0-9+/])/, (_, prefix, first) => prefix + (first === 'A' ? 'B' : 'A')) };
    assert.notEqual(tampered.ppk, result.ppk);
    await assert.rejects(() => verifyPPK(tampered, passphrase), 'PPK MAC rejects modified ciphertext');
});

test('OpenSSH AES-CTR and custom IETF ChaCha output decrypt and contain the expected key', async () => {
    const bcrypt = requireKeygen('bcrypt-pbkdf');
    for (const encryption of ['aes256ctr', 'cc20p1305']) {
        const passphrase = 'test-only-passphrase';
        const result = await generateKeypair({ algorithm: 'ECDSA', curve: 'P-256', encryption, passphrase });
        const data = Buffer.from(result.privatePEM.split('\n').filter(line => line && !line.startsWith('-----')).join(''), 'base64');
        assert.equal(data.subarray(0, 15).toString(), 'openssh-key-v1\0');
        const outer = read(data.subarray(15)); const cipher = outer.string().toString();
        assert.equal(outer.string().toString(), 'bcrypt');
        const kdf = read(outer.string()); const salt = kdf.string(), rounds = kdf.u32();
        assert.equal(outer.u32(), 1);
        assert.equal(outer.string().toString('base64'), result.openssh.split(' ')[1]);
        const encrypted = outer.string();
        const key = new Uint8Array(encryption === 'aes256ctr' ? 48 : 32);
        bcrypt.pbkdf(Buffer.from(passphrase), Buffer.byteLength(passphrase), salt, salt.length, key, key.length, rounds);
        let decipher, body;
        if (encryption === 'aes256ctr') {
            assert.equal(cipher, 'aes256-ctr');
            decipher = createDecipheriv('aes-256-ctr', key.subarray(0, 32), key.subarray(32)); body = encrypted;
        } else {
            assert.equal(cipher, 'chacha20-poly1305@ietf.rfc8439');
            decipher = createDecipheriv('chacha20-poly1305', key, encrypted.subarray(0, 12), { authTagLength: 16 });
            decipher.setAuthTag(encrypted.subarray(-16)); body = encrypted.subarray(12, -16);
        }
        const inner = read(Buffer.concat([decipher.update(body), decipher.final()]));
        assert.equal(inner.u32(), inner.u32());
        assert.equal(inner.string().toString(), 'ecdsa-sha2-nistp256');
        assert.equal(inner.string().toString(), 'nistp256');
        const point = inner.string(); const privatePart = inner.string();
        const publicBlob = Buffer.from(result.openssh.split(' ')[1], 'base64');
        assert.deepEqual(publicDER(privateFromPPK(publicBlob, sshString(privatePart))), createPublicKey(result.publicPEM).export({ type: 'spki', format: 'der' }));
        assert.equal(point.length, 65);
        await verifyPPK(result, passphrase);
    }
});

test('rejects invalid selections before key generation and supports seven-key selection progress', async () => {
    for (const options of [{ algorithm: 'unknown' }, { algorithm: 'RSA', length: 1024 }, { algorithm: 'ECDSA', curve: 'P-192' }, { algorithm: 'EdDSA', curve: 'bad' }, { encryption: 'pkcs8' }, { encryption: 'bad' }, { selectionIndex: -2 }]) assert.throws(() => validateKeyOptions(options));
    const updates = [];
    const result = await generateKeypair({ algorithm: 'EdDSA', curve: 'Ed25519', selectionIndex: 255 }, (done, total) => updates.push([done, total]));
    assert.equal(updates.length, 9);
    assert.deepEqual(updates.at(-1), [9, 9]);
    await verifyPPK(result);
});
