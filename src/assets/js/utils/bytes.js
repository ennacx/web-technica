/**
 * 鍵・ハッシュ等の形式に依存しないバイト列の操作。
 */
export class Bytes {
    /**
     * 複数のUint8Array、またはその配列を連結する。
     *
     * @param {...(Uint8Array|Uint8Array[])} arrays - 連結する Uint8Array の配列、またはその配列。
     * @return {Uint8Array} 連結された Uint8Array
     */
    static concat(...arrays){
        const parts = (arrays.length === 1 && Array.isArray(arrays[0]) ? arrays[0] : arrays)
            .filter((part) => (part instanceof Uint8Array));
        const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));

        let offset = 0;

        for(const part of parts){
            result.set(part, offset);
            offset += part.length;
        }

        return result;
    }

    /** Base64へ変換する。
     * 大きな入力でも関数の引数上限を超えないよう、分割して変換。
     *
     * @param {Uint8Array} value - 変換する Uint8Array。
     * @return {string} Base64 形式の文字列。
     */
    static toBase64(value){
        const bytes = Bytes.#asBytes(value);

        let binary = '';

        for(let i = 0; i < bytes.length; i += 0x8000){
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }

        return btoa(binary);
    }

    /**
     * 指定された入力値をBase64URLエンコードされた文字列に変換する。
     * 「+」を「-」に、「/」を「_」に置換、パディングの「=」を除去する。
     *
     * @param {string} value - Base64-URL 形式に変換する入力文字列
     * @return {string} 入力文字列を Base64-URL エンコードした表現
     */
    static toBase64Url(value) {
        return this.toBase64(value)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Base64とBase64URLをデコードする。非文字列にはnullを返す。
     *
     * @param {string} value - Base64 形式に変換する入力文字列
     * @return {Uint8Array} 入力文字列を Base64 デコードした表現
     */
    static fromBase64(value){
        if(typeof value !== 'string'){
            return null;
        }

        let encoded = value.replace(/-/g, '+').replace(/_/g, '/');
        while(encoded.length % 4){
            encoded += '=';
        }

        return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    }

    /**
     * 指定された値を16進数表現に変換する。
     *
     * @param {number | string | ArrayBuffer | Uint8Array} value - 変換対象の入力値。数値、文字列、ArrayBuffer、またはUint8Arrayを指定可能。
     * @return {string} 入力値を16進数で表現した文字列。
     */
    static toHex(value){
        return Array.from(Bytes.#asBytes(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 指定された文字列を、UTF-8エンコードされたバイト表現に変換する。
     *
     * @param {string} value - UTF-8 形式にエンコードする文字列
     * @return {Uint8Array} 入力文字列を UTF-8 エンコードしたバイトデータを含む Uint8Array
     */
    static toUtf8(value){
        return new TextEncoder().encode(value);
    }

    /**
     * 指定された値をUint8Array形式に変換する。
     *
     * @param {ArrayBuffer|ArrayBufferView} value - 変換対象の入力値。 ArrayBufferView が指定された場合、その参照先部分のみが未加工のバイトデータとして扱われる。
     * @return {Uint8Array} 入力値を表すUint8Array
     */
    static #asBytes(value){
        // ArrayBufferViewは参照範囲だけを生のバイト列として扱う
        return (ArrayBuffer.isView(value)) ?
            new Uint8Array(value.buffer, value.byteOffset, value.byteLength) :
            new Uint8Array(value);
    }
}
