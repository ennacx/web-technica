/**
 * GPSを除いたEXIF再構築を担当するライブラリ
 */

import {
    IFD_TYPE, LITTLE_ENDIAN_BYTE_ORDER, BIG_ENDIAN_BYTE_ORDER, EXIF_POINTER, GPS_POINTER,
    isRelocatableTag, readExif
} from './exif-reader.js';

const PRIMARY = 'IFD0';
const SUB_IFD = 'Exif SubIFD';
const GPS     = 'GPS IFD';


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
    const primary = directories.get(PRIMARY);
    const sub     = directories.get(SUB_IFD);

    if(issues.length){
        throw new Error(`Location-only cleanup cannot rewrite Exif with ${issues.join(', ')}.`);
    }

    if(directories.has('IFD1')){
        throw new Error('Location-only cleanup cannot preserve the Exif thumbnail directory.');
    }

    const retained = [
        [PRIMARY, [...primary.values()].filter(({ tag }) => (tag !== GPS_POINTER))],
        ...((sub) ? [[SUB_IFD, [...sub.values()]]] : [])
    ];

    for(const [name, entries] of retained){
        for(const entry of entries){
            if(name === PRIMARY && entry.tag === EXIF_POINTER){
                continue;
            }

            if(!isRelocatableTag(name, entry)){
                const tag = entry.tag.toString(16).padStart(4, '0');

                throw new Error(`Location-only cleanup cannot preserve ${name} tag 0x${tag}${(entry.tag === 0x927c) ? ' (MakerNote)' : ''}.`);
            }
        }
    }

    const gps = directories.get(GPS);

    if(!gps){
        return null;
    }

    if([...gps.values()].some(({ tag, type }) => (GPS_TYPES[tag] !== type))){
        throw new Error('Location-only cleanup cannot verify unfamiliar GPS tags or value types.');
    }

    const offsets = new Map();

    let size = 8; // TIFFヘッダの直後にIFD0を置く

    for(const [name, entries] of retained){
        offsets.set(name, size);
        size += entries.length * 12 + 6; // タグ数2バイト、各エントリ12バイト、次のIFD位置4バイト。
    }

    let dataOffset = size;

    for(const [, entries] of retained){
        for(const { data } of entries){
            if(data.length > 4){
                size += data.length + data.length % 2;
            }
        }
    }

    // 16ビットのJPEG長さ欄の上限から長さ欄の2バイトとExif識別子の6バイトを引く
    if(size > 65527){
        throw new Error('Rebuilt Exif exceeds the JPEG APP1 size limit.');
    }

    const tiff = new Uint8Array(size);
    const view = new DataView(tiff.buffer);

    view.setUint16(0, (little) ? LITTLE_ENDIAN_BYTE_ORDER : BIG_ENDIAN_BYTE_ORDER);
    view.setUint16(2, 42, little);
    view.setUint32(4, offsets.get(PRIMARY), little);

    for(const [name, entries] of retained){
        let offset = offsets.get(name);

        view.setUint16(offset, entries.length, little);
        offset += 2;

        for(const { tag, type, count, data } of entries.sort((a, b) => a.tag - b.tag)){
            view.setUint16(offset, tag, little);
            view.setUint16(offset + 2, type, little);
            view.setUint32(offset + 4, count, little);

            const field = offset + 8;

            if(name === PRIMARY && tag === EXIF_POINTER){
                view.setUint32(field, offsets.get(SUB_IFD), little);
            } else if(data.length <= 4){
                tiff.set(data, field);
            } else{
                view.setUint32(field, dataOffset, little);
                tiff.set(data, dataOffset);
                dataOffset += data.length + data.length % 2;
            }

            offset += 12;
        }
    }

    const rebuilt = readExif(tiff);

    if(rebuilt.directories.has(GPS) || rebuilt.issues.length) {
        throw new Error('Rebuilt Exif failed GPS removal verification.');
    }

    for(const [name, entries] of retained){
        const after = rebuilt.directories.get(name);

        if(after?.size !== entries.length){
            throw new Error('Rebuilt Exif failed directory verification.');
        }

        for(const entry of entries){
            if(name === PRIMARY && entry.tag === EXIF_POINTER) {
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

    // FF E1（APP1）、長さ欄2バイト、"Exif\0\0" の6バイト、続いてTIFF本体。
    segment.set([0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0]);

    new DataView(segment.buffer).setUint16(2, segment.length - 2);

    segment.set(tiff, 10);

    return segment;
}
