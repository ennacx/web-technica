import { cbc } from '@noble/ciphers/aes.js';

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
    return cbc(keyBytes, ivBytes, { disablePadding: true }).encrypt(plaintext);
}

/**
 * PPK用のCBC復号。ランダムパディングを含む平文をそのまま返す。
 * この処理だけではパスフレーズの正否や改ざんを判定できない。
 * インポート時には、復号後の平文を含むPPKのMACを検証してから利用すること。
 *
 * @param {Uint8Array} keyBytes
 * @param {Uint8Array} ivBytes
 * @param {Uint8Array} ciphertext
 * @returns {Uint8Array}
 */
export function aesCbcDecryptRawNoPadding(keyBytes, ivBytes, ciphertext){
    return cbc(keyBytes, ivBytes, { disablePadding: true }).decrypt(ciphertext);
}
