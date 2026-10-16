import CryptoJS from 'crypto-js';

/**
 * パディングなしのCBCモードで、AES暗号化を用いて平文を暗号化する。
 *
 * @param {Uint8Array} keyBytes - バイト配列形式の暗号化キー
 * @param {Uint8Array} ivBytes - バイト配列形式の初期化ベクトル (IV)
 * @param {Uint8Array} plaintext - 暗号化対象となるバイト配列形式の平文データ
 * @return {Uint8Array} バイト配列形式の暗号文
 */
export function aesCbcEncryptRawNoPadding(keyBytes, ivBytes, plaintext){
    // PPKは独自のパディング済みデータを暗号化するため、PKCS#7を追加しない。
    const encrypted = CryptoJS.AES.encrypt(
        CryptoJS.lib.WordArray.create(plaintext),
        CryptoJS.lib.WordArray.create(keyBytes),
        {
            iv: CryptoJS.lib.WordArray.create(ivBytes),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.NoPadding
        }
    ).ciphertext;

    return Uint8Array.from(
        { length: encrypted.sigBytes },
        (_, i) => (encrypted.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255
    );
}
