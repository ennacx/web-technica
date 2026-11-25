/**
 * GPSを除いたEXIF再構築を担当するライブラリ
 */

import {
    IFD, IFD_TYPE, TIFF_TAG, EXIF_TAG, TIFF_MAGIC, LITTLE_ENDIAN_BYTE_ORDER, BIG_ENDIAN_BYTE_ORDER,
    TIFF_HEADER_BYTES, IFD_ENTRY_BYTES, IFD_DIRECTORY_OVERHEAD, IFD_INLINE_VALUE_BYTES
} from './exif-constants.js';
import { isRelocatableTag, readExif } from './exif-reader.js';

/**
 * CIPA DC-X008-2019 日本語版 §4.6.3 (Exif固有のIFD)、§4.6.6 表15 (GPSタグ)、§4.7.2 (APP1)
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 */

// インデックスはGPS IFDのタグID (0x0000〜0x001F)、配列の値は許容するTIFF型番号。
const GPS_TYPES = [
    // 0x0000〜0x000F
    IFD_TYPE.BYTE,     IFD_TYPE.ASCII,    IFD_TYPE.RATIONAL, IFD_TYPE.ASCII,
    IFD_TYPE.RATIONAL, IFD_TYPE.BYTE,     IFD_TYPE.RATIONAL, IFD_TYPE.RATIONAL,
    IFD_TYPE.ASCII,    IFD_TYPE.ASCII,    IFD_TYPE.ASCII,    IFD_TYPE.RATIONAL,
    IFD_TYPE.ASCII,    IFD_TYPE.RATIONAL, IFD_TYPE.ASCII,    IFD_TYPE.RATIONAL,
    // 0x0010〜0x001F
    IFD_TYPE.ASCII,     IFD_TYPE.RATIONAL, IFD_TYPE.ASCII,    IFD_TYPE.ASCII,
    IFD_TYPE.RATIONAL,  IFD_TYPE.ASCII,    IFD_TYPE.RATIONAL, IFD_TYPE.ASCII,
    IFD_TYPE.RATIONAL,  IFD_TYPE.ASCII,    IFD_TYPE.RATIONAL, IFD_TYPE.UNDEFINED,
    IFD_TYPE.UNDEFINED, IFD_TYPE.ASCII,    IFD_TYPE.SHORT,    IFD_TYPE.RATIONAL
];

/**
 * GPSポインタとGPS IFDの値を除き、保持するIFDと値を新しいAPP1に書き出す。
 * 出力TIFFを再解析し、GPSがなく、保持したタグの型・要素数・値が一致することを確認する。
 * @param {import('./exif-reader.js').ExifData} exif - 元のExif APP1を解析した結果。
 * @returns {Uint8Array | null} マーカーと長さ欄を含むExif APP1全体。保持対象の検査を通り、GPS IFDがなければ `null`。
 * @throws {Error} 未対応のタグや構造、APP1のサイズ超過、または再構築結果の検証失敗。
 */
export function rebuildWithoutGps(exif){
    const { directories, little, issues } = exif;
    const primary = directories.get(IFD.PRIMARY);
    const sub     = directories.get(IFD.EXIF);

    if(issues.length){
        throw new Error(`Location-only cleanup cannot rewrite Exif with ${issues.join(', ')}.`);
    }
    if(directories.has(IFD.THUMBNAIL)){
        throw new Error('Location-only cleanup cannot preserve the Exif thumbnail directory.');
    }

    const retained = [
        [IFD.PRIMARY, [...primary.values()].filter(({ tag }) => (tag !== TIFF_TAG.GPSInfoIFDPointer))],
        ...((sub) ? [[IFD.EXIF, [...sub.values()]]] : [])
    ];

    for(const [name, entries] of retained){
        for(const entry of entries){
            if(name === IFD.PRIMARY && entry.tag === TIFF_TAG.ExifIFDPointer){
                continue;
            }

            if(!isRelocatableTag(name, entry)){
                const tag = entry.tag.toString(16).padStart(4, '0');

                throw new Error(`Location-only cleanup cannot preserve ${name} tag 0x${tag}${(name === IFD.EXIF && entry.tag === EXIF_TAG.MakerNote) ? ' (MakerNote)' : ''}.`);
            }
        }
    }

    const gps = directories.get(IFD.GPS);

    if(!gps){
        return null;
    }

    if([...gps.values()].some(({ tag, type }) => (GPS_TYPES[tag] !== type))){
        throw new Error('Location-only cleanup cannot verify unfamiliar GPS tags or value types.');
    }

    const offsets = new Map();

    let size = TIFF_HEADER_BYTES;

    for(const [name, entries] of retained){
        offsets.set(name, size);
        size += entries.length * IFD_ENTRY_BYTES + IFD_DIRECTORY_OVERHEAD;
    }

    let dataOffset = size;

    for(const [, entries] of retained){
        for(const { data } of entries){
            if(data.length > IFD_INLINE_VALUE_BYTES){
                size += data.length + data.length % 2;
            }
        }
    }

    // 16ビットのJPEG長さ欄の上限から、"長さ"の2バイトと、"Exif識別子"の6バイトを引いた値
    if(size > 65527){
        throw new Error('Rebuilt Exif exceeds the JPEG APP1 size limit.');
    }

    const tiff = new Uint8Array(size);
    const view = new DataView(tiff.buffer);

    view.setUint16(0, (little) ? LITTLE_ENDIAN_BYTE_ORDER : BIG_ENDIAN_BYTE_ORDER);
    view.setUint16(2, TIFF_MAGIC, little);
    view.setUint32(4, offsets.get(IFD.PRIMARY), little);

    for(const [name, entries] of retained){
        let offset = offsets.get(name);

        view.setUint16(offset, entries.length, little);
        offset += 2;

        for(const { tag, type, count, data } of entries.sort((a, b) => a.tag - b.tag)){
            view.setUint16(offset, tag, little);
            view.setUint16(offset + 2, type, little);
            view.setUint32(offset + 4, count, little);

            const field = offset + 8;

            if(name === IFD.PRIMARY && tag === TIFF_TAG.ExifIFDPointer){
                view.setUint32(field, offsets.get(IFD.EXIF), little);
            } else if(data.length <= IFD_INLINE_VALUE_BYTES){
                tiff.set(data, field);
            } else{
                view.setUint32(field, dataOffset, little);
                tiff.set(data, dataOffset);
                dataOffset += data.length + data.length % 2;
            }

            offset += IFD_ENTRY_BYTES;
        }
    }

    const rebuilt = readExif(tiff);

    if(rebuilt.directories.has(IFD.GPS) || rebuilt.issues.length) {
        throw new Error('Rebuilt Exif failed GPS removal verification.');
    }

    for(const [name, entries] of retained){
        const after = rebuilt.directories.get(name);

        if(after?.size !== entries.length){
            throw new Error('Rebuilt Exif failed directory verification.');
        }

        for(const entry of entries){
            if(name === IFD.PRIMARY && entry.tag === TIFF_TAG.ExifIFDPointer) {
                continue;
            }

            const value = after.get(entry.tag);

            if(
                value?.type !== entry.type
                || value.count !== entry.count
                || value.data.some((byte, index) => (byte !== entry.data[index]))
            ){
                throw new Error('Rebuilt Exif failed non-GPS value verification.');
            }
        }
    }

    const segment = new Uint8Array(tiff.length + 10);

    // FF E1 (APP1)、長さ2バイト、"Exif\0\0"の6バイト
    segment.set([0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0]);

    new DataView(segment.buffer).setUint16(2, segment.length - 2);

    // 続いてTIFF本体
    segment.set(tiff, 10);

    return segment;
}
