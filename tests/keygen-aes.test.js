import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { aesCbcEncryptRawNoPadding, aesCbcDecryptRawNoPadding } from '../src/tools/keygen/js/aes.js';

const hex = (value) => new Uint8Array(Buffer.from(value, 'hex'));

// NIST SP 800-38A, F.2.5/F.2.6 (CBC-AES256).
// https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38a.pdf
test('AES-256-CBC NoPadding matches the NIST encrypt/decrypt known-answer vector', () => {
    const key = hex('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4');
    const iv = hex('000102030405060708090a0b0c0d0e0f');
    const plaintext = hex(
        '6bc1bee22e409f96e93d7e117393172a' +
        'ae2d8a571e03ac9c9eb76fac45af8e51' +
        '30c81c46a35ce411e5fbc1191a0a52ef' +
        'f69f2445df4f9b17ad2b417be66c3710'
    );
    const ciphertext = hex(
        'f58c4c04d6e5f1ba779eabfb5f7bfbd6' +
        '9cfc4e967edb808d679f777bc6702c7d' +
        '39f23369a9d9bacfa530e26304231461' +
        'b2eb05e2c39be9fcda6c19078c6a9d1b'
    );
    assert.deepEqual(aesCbcEncryptRawNoPadding(key, iv, plaintext), ciphertext);
    assert.deepEqual(aesCbcDecryptRawNoPadding(key, iv, ciphertext), plaintext);
});

test('NoPadding interoperates with Node/OpenSSL and preserves PPK random padding and byte views', () => {
    function view(length, offset, seed){
        const bytes = Uint8Array.from({ length: length + offset + 8 }, (_, i) => (i * 37 + seed) & 255);
        return bytes.subarray(offset, offset + length);
    }
    for(const keyLength of [16, 24, 32]){
        for(const blocks of [0, 1, 2, 3, 16, 64]){
            for(const tail of [0, 1, 16, 255]){
                const key = view(keyLength, 1, 7);
                const iv = view(16, 3, 11);
                const plaintext = view(blocks * 16, 5, 13);
                if(plaintext.length) plaintext[plaintext.length - 1] = tail;
                const before = [key.slice(), iv.slice(), plaintext.slice()];
                const cipher = createCipheriv(`aes-${keyLength * 8}-cbc`, key, iv);
                cipher.setAutoPadding(false);
                const expected = Buffer.concat([cipher.update(plaintext), cipher.final()]);
                const ciphertext = aesCbcEncryptRawNoPadding(key, iv, plaintext);
                assert.equal(ciphertext.length, plaintext.length, 'no extra PKCS#7 block');
                assert.deepEqual(Buffer.from(ciphertext), expected);
                const ciphertextView = view(expected.length, 7, 0);
                ciphertextView.set(expected);
                const decipher = createDecipheriv(`aes-${keyLength * 8}-cbc`, key, iv);
                decipher.setAutoPadding(false);
                assert.deepEqual(Buffer.concat([decipher.update(ciphertext), decipher.final()]), Buffer.from(plaintext));
                assert.deepEqual(aesCbcDecryptRawNoPadding(key, iv, ciphertextView), plaintext, 'PPK padding bytes are not stripped');
                assert.deepEqual(Buffer.from(ciphertextView), expected, 'ciphertext input is not mutated');
                assert.deepEqual([key, iv, plaintext], before, 'keys, IV and plaintext are not mutated');
            }
        }
    }
});

test('NoPadding rejects invalid key/IV lengths and incomplete blocks in both directions', () => {
    const key = new Uint8Array(32), iv = new Uint8Array(16), block = new Uint8Array(16);
    for(const operation of [aesCbcEncryptRawNoPadding, aesCbcDecryptRawNoPadding]){
        for(const length of [0, 15, 17, 31, 33]){
            assert.throws(() => operation(new Uint8Array(length), iv, block));
        }
        for(const length of [0, 15, 17]){
            assert.throws(() => operation(key, new Uint8Array(length), block));
        }
        for(const length of [1, 15, 17, 31]){
            assert.throws(() => operation(key, iv, new Uint8Array(length)));
        }
    }
});
