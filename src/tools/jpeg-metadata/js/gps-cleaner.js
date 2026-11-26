/**
 * GPSを除いたEXIF再構築を担当するライブラリ
 */

import {
    IFD, IFD_TYPE, TIFF_TAG, EXIF_TAG, TIFF_MAGIC, LITTLE_ENDIAN_BYTE_ORDER, BIG_ENDIAN_BYTE_ORDER,
    TIFF_HEADER_BYTES, IFD_ENTRY_BYTES, IFD_DIRECTORY_OVERHEAD, IFD_INLINE_VALUE_BYTES, TYPE_NAMES
} from './exif-constants.js';
import { readExif } from './exif-reader.js';

/**
 * CIPA DC-X008-2019 日本語版 §4.6.3 (Exif固有のIFD)、§4.6.6 表15 (GPSタグ)、§4.7.2 (APP1)
 *
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 */

/**
 * GPS削除時にASCII型のまま移設できるタグID。外側のキーはIFD名。
 *
 * @type {Record<string, Set<number>>}
 */
const ASCII_TAGS = {
    [IFD.PRIMARY]: new Set([
        TIFF_TAG.ImageDescription, TIFF_TAG.Make, TIFF_TAG.Model, TIFF_TAG.Software,
        TIFF_TAG.DateTime, TIFF_TAG.Artist, TIFF_TAG.Copyright
    ]),
    [IFD.EXIF]: new Set([
        EXIF_TAG.DateTimeOriginal, EXIF_TAG.DateTimeDigitized, EXIF_TAG.OffsetTime,
        EXIF_TAG.OffsetTimeOriginal, EXIF_TAG.OffsetTimeDigitized, EXIF_TAG.SubSecTime,
        EXIF_TAG.SubSecTimeOriginal, EXIF_TAG.SubSecTimeDigitized, EXIF_TAG.LensMake, EXIF_TAG.LensModel
    ])
};

/**
 * GPS削除時に単一値として移設できる型番号。外側のキーはIFD名、内側のキーはタグID。
 *
 * @type {Record<string, Record<number, number[]>>}
 */
const SCALAR_TYPES = {
    [IFD.PRIMARY]: {
        [TIFF_TAG.Orientation]: [IFD_TYPE.SHORT],
        [TIFF_TAG.XResolution]: [IFD_TYPE.RATIONAL],
        [TIFF_TAG.YResolution]: [IFD_TYPE.RATIONAL],
        [TIFF_TAG.ResolutionUnit]: [IFD_TYPE.SHORT]
    },
    [IFD.EXIF]: {
        [EXIF_TAG.ExposureTime]: [IFD_TYPE.RATIONAL],
        [EXIF_TAG.FNumber]: [IFD_TYPE.RATIONAL],
        [EXIF_TAG.ExposureProgram]: [IFD_TYPE.SHORT],
        [EXIF_TAG.PhotographicSensitivity]: [IFD_TYPE.SHORT], // PhotographicSensitivity。規格では複数値も許容するが、移設は単一値に限定する。
        [EXIF_TAG.ISOSpeed]: [IFD_TYPE.LONG],
        [EXIF_TAG.ShutterSpeedValue]: [IFD_TYPE.SRATIONAL],
        [EXIF_TAG.ApertureValue]: [IFD_TYPE.RATIONAL],
        [EXIF_TAG.ExposureBiasValue]: [IFD_TYPE.SRATIONAL],
        [EXIF_TAG.MeteringMode]: [IFD_TYPE.SHORT],
        [EXIF_TAG.Flash]: [IFD_TYPE.SHORT],
        [EXIF_TAG.FocalLength]: [IFD_TYPE.RATIONAL],
        [EXIF_TAG.ColorSpace]: [IFD_TYPE.SHORT],
        [EXIF_TAG.PixelXDimension]: [IFD_TYPE.SHORT, IFD_TYPE.LONG],
        [EXIF_TAG.PixelYDimension]: [IFD_TYPE.SHORT, IFD_TYPE.LONG],
        [EXIF_TAG.FocalLengthIn35mmFilm]: [IFD_TYPE.SHORT],
    }
};

/**
 * インデックスはGPS IFDのタグID (0x0000〜0x001F)、配列の値は許容するTIFF型番号。
 *
 * @type {(number)[]}
 */
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
 * GPS削除時に、このタグの値を再構築先へ移せるか判定する。
 * ASCIIタグと4バイトのバージョンタグのほか、許可リストにある単一値を対象とする。
 *
 * @param {string} directory - IFD名。
 * @param {Pick<import('./exif-reader.js').ExifEntry, 'tag' | 'type' | 'count'>} entry - タグID、型、要素数。
 * @returns {boolean} タグID・型・要素数が移設条件を満たす場合は `true`。実際の値の検証は再構築側で行う。
 */
function isRelocatableTag(directory, { tag, type, count }){
    if(ASCII_TAGS[directory]?.has(tag)){
        return (type === IFD_TYPE.ASCII);
    }

    if(directory === IFD.EXIF && (tag === EXIF_TAG.ExifVersion || tag === EXIF_TAG.FlashpixVersion)){
        return (type === IFD_TYPE.UNDEFINED && count === 4);
    }

    return (count === 1 && Boolean(SCALAR_TYPES[directory]?.[tag]?.includes(type)));
}

/**
 * GPSポインタとGPS IFDの値を除き、保持するIFDと値を新しいAPP1に書き出す。
 * 出力TIFFを再解析し、GPSがなく、保持したタグの型・要素数・値が一致することを確認する。
 *
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

    // GPSInfoIFDPointerの削除だけでは参照先のGPSデータが物理的に残存する。
    // そのため保持対象のみを新しいTIFF領域に再構築する。

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
