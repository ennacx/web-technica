/**
 * 解析済みのTIFFタグ値を型に応じてデコードする。
 *
 * CIPA DC-X008-2019 日本語版 §4.6.2〜4.6.6 (IFD構造・タグ・型), §4.7.2 (APP1)
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 * @see https://printtechnologies.org/standards/files/tiff-v6.pdf
 */

import { IFD_TYPE, TYPE_BYTES } from './exif-constants.js';

/**
 * @typedef {{numerator: number, denominator: number}} ExifRational
 */

/**
 * @typedef {(
 *   {kind: 'text', text: string, truncated: boolean}
 *   | {kind: 'numeric', values: (number | ExifRational)[], truncated: boolean}
 *   | {kind: 'binary', bytes: Uint8Array}
 * )} DecodedExifValue
 */

/**
 * TIFF値を文字列・数値・分数・バイト列として読み出す。
 *
 * ASCII型はUTF-8で読み、NULを保持する。分数は分母が0でも分子と分母をそのまま保持する。
 *
 * @param {import('./exif-reader.js').ExifEntry} entry - 解析済みタグ。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @param {{maxTextBytes?: number, maxElements?: number}} [limits] - 文字列の最大バイト数と数値・分数の最大要素数。省略すると全体を読む。
 * @returns {DecodedExifValue} 型に応じてデコードした値。バイナリ型は元のビューを返す。
 */
export function decode(entry, little, { maxTextBytes = Infinity, maxElements = Infinity } = {}){
    const { data, type, count } = entry;

    if(type === IFD_TYPE.ASCII){
        const bytes = data.subarray(0, Math.min(data.length, maxTextBytes));

        return {
            kind: 'text',
            text: new TextDecoder().decode(bytes),
            truncated: (bytes.length < data.length)
        };
    }

    const view   = new DataView(data.buffer, data.byteOffset, data.byteLength);
    /** @type {(number | ExifRational)[]} */
    const values = [];

    for(let i = 0; i < Math.min(count, maxElements); i++){
        const offset = i * TYPE_BYTES[type];

        switch(type){
            case IFD_TYPE.BYTE:
                values.push(view.getUint8(offset));
                break;
            case IFD_TYPE.SHORT:
                values.push(view.getUint16(offset, little));
                break;
            case IFD_TYPE.LONG:
                values.push(view.getUint32(offset, little));
                break;
            case IFD_TYPE.RATIONAL:
                values.push({ numerator: view.getUint32(offset, little), denominator: view.getUint32(offset + 4, little) });
                break;
            case IFD_TYPE.SBYTE:
                values.push(view.getInt8(offset));
                break;
            case IFD_TYPE.SSHORT:
                values.push(view.getInt16(offset, little));
                break;
            case IFD_TYPE.SLONG:
                values.push(view.getInt32(offset, little));
                break;
            case IFD_TYPE.SRATIONAL:
                values.push({ numerator: view.getInt32(offset, little), denominator: view.getInt32(offset + 4, little) });
                break;
            case IFD_TYPE.FLOAT:
                values.push(view.getFloat32(offset, little));
                break;
            case IFD_TYPE.DOUBLE:
                values.push(view.getFloat64(offset, little));
                break;

            default:
                return {
                    kind: 'binary',
                    bytes: data
                };
        }
    }

    return {
        kind: 'numeric',
        values,
        truncated: (values.length < count)
    };
}
