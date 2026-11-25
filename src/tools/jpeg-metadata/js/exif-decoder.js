/**
 * TIFF / IFDのバイトデータをデコードする。
 *
 * CIPA DC-X008-2019 日本語版 §4.6.2〜4.6.6 (IFD構造・タグ・型), §4.7.2 (APP1)
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 * @see https://printtechnologies.org/standards/files/tiff-v6.pdf
 */

import { IFD_TYPE, TYPE_BYTES } from "./exif-constants.js";


/**
 * タグの値を表示用の文字列に変換する。
 *
 * @param {ExifEntry} entry - 解析済みタグ。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @returns {string} ASCIIは先頭512バイト、数値は先頭12要素までの表示文字列。
 */
export function decode(entry, little){
    const { data, type, count } = entry;

    if(type === IFD_TYPE.ASCII){
        return new TextDecoder().decode(data.subarray(0, 512)).replace(/\0+$/, '').replaceAll('\0', ' / ')
            + ((count > 512) ? '…' : '');
    }

    const view   = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const values = [];

    for(let i = 0; i < Math.min(count, 12); i++){
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
                values.push(`${view.getUint32(offset, little)}/${view.getUint32(offset + 4, little)}`);
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
                values.push(`${view.getInt32(offset, little)}/${view.getInt32(offset + 4, little)}`);
                break;
            case IFD_TYPE.FLOAT:
                values.push(view.getFloat32(offset, little));
                break;
            case IFD_TYPE.DOUBLE:
                values.push(view.getFloat64(offset, little));
                break;

            default:
                return `Unsupported value type ${type} (${count} elements)`;
        }
    }

    return values.join(', ') + ((count > 12) ? ', …' : '');
}
