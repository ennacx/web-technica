/**
 * TIFF / IFDを読み取るためのライブラリ
 *
 * CIPA DC-X008-2019 日本語版 §4.6.2〜4.6.6 (IFD構造・タグ・型), §4.7.2 (APP1)
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 * @see https://printtechnologies.org/standards/files/tiff-v6.pdf
 */

import {
    IFD, IFD_TYPE, TIFF_TAG, TYPE_BYTES, TYPE_NAMES, TIFF_MAGIC,
    TIFF_HEADER_BYTES, IFD_ENTRY_BYTES, IFD_DIRECTORY_OVERHEAD, IFD_INLINE_VALUE_BYTES,
    LITTLE_ENDIAN_BYTE_ORDER, BIG_ENDIAN_BYTE_ORDER
} from './exif-constants.js';
import { DISPLAY_TAGS, formatStandardValue } from './exif-formatter.js'
import { decode as exifDecode } from './exif-decoder.js';

const BINARY_PREVIEW_BYTES = 32;

/**
 * @typedef {object} ExifEntry
 * @property {number} tag - IFD内のタグID。
 * @property {number} type - TIFFの型番号。
 * @property {number} count - 値の要素数。ASCIIでは終端NULを含む。
 * @property {number} dataOffset - TIFFヘッダ先頭から値の先頭までの位置（バイト）。
 * @property {Uint8Array} data - パディングを除いた値のバイト列。入力TIFFとメモリを共有するビュー。
 */

/**
 * @typedef {object} ExifField
 * @property {string} source - 値を読み取ったIFD名。
 * @property {string} label - 項目の表示名。
 * @property {string} value - 表示用に変換した値。
 */

/**
 * @typedef {object} ExifData
 * @property {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @property {Map<string, Map<number, ExifEntry>>} directories - IFD名ごとのエントリ。内側のキーはタグID。
 * @property {ExifField[]} fields - 表示名が定義されている項目。
 * @property {{source: string, tag: number}[]} otherTags - 詳細一覧に表示するタグのIFD名とID。
 * @property {string[]} issues - 範囲の重複など、読み取れたがGPS削除時の再構築を妨げる問題。
 * @property {Uint8Array | null} thumbnail - IFD1が参照する埋め込みJPEGのビュー。候補がなければ null。
 */

/**
 * 詳細一覧向けに型名と値のプレビューを生成する。
 *
 * @param {ExifEntry} entry - 解析済みタグ。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @param {string} [source] - エントリを取得したIFD名。
 * @returns {{typeName: string, value: string}} 数値や文字列の表示、または先頭32バイトの16進数とASCII。
 */
export function previewExifEntry(entry, little, source){
    const { type, data } = entry;
    const typeName  = TYPE_NAMES.get(type) ?? `Type ${type}`;
    const formatted = formatStandardValue(source, entry, little);

    if(formatted !== undefined){
        return { typeName, value: formatted };
    }

    if(TYPE_NAMES.has(type) && type !== IFD_TYPE.UNDEFINED){
        return { typeName, value: exifDecode(entry, little) };
    }

    const prefix = data.subarray(0, BINARY_PREVIEW_BYTES);
    const suffix = (data.length > prefix.length) ? ' …' : '';
    const hex    = Array.from(prefix, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const ascii  = Array.from(prefix, (byte) => (byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(byte) : '.').join('');

    return { typeName, value: `${hex} │ ${ascii}${suffix}` };
}

/**
 * TIFFヘッダと、参照されているIFD0・Exif IFD・GPS IFD・IFD1を解析する。
 * 領域の重複、値のパディングや未参照領域にある非ゼロバイトは `issues` に記録する。
 *
 * @param {Uint8Array} tiff - Exif識別子の直後から始まるTIFFデータ。オフセットの基準はこのビューの先頭。
 * @returns {ExifData} エントリ、表示用の値、再構築時に問題となる箇所。
 * @throws {Error} ヘッダや参照範囲が不正、IFD参照が重複・循環、制限超過、または未対応の型や構造がある場合。
 */
export function readExif(tiff){
    const view        = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const order       = tiff[0] << 8 | tiff[1];
    // TIFFの先頭2バイトで "II" (リトルエンディアン) "MM" (ビッグエンディアン) を判定
    const little      = (order === LITTLE_ENDIAN_BYTE_ORDER);
    const ranges      = [{ start: 0, end: TIFF_HEADER_BYTES }];
    const directories = new Map();
    const offsets     = new Set();
    const issues      = new Set();

    let tagCount = 0;

    /**
     * 指定範囲が8バイトのTIFFヘッダより後ろにあり、ペイロード内に収まることを確認する。
     *
     * @param {number} start - TIFF先頭からの開始位置（バイト）。
     * @param {number} size - 範囲の長さ（バイト）。
     * @throws {Error} 範囲がTIFFヘッダにかかるか、ペイロードの終端を超える場合。
     */
    function check(start, size){
        if(start < TIFF_HEADER_BYTES || (start + size) > tiff.length){
            throw new Error('Exif offset or value is outside the TIFF payload.');
        }
    }

    /**
     * IFD、外部値、サムネイルの参照範囲を登録する。既存の範囲と重なれば `issues` に記録する。
     *
     * @param {number} start - TIFF先頭からの開始位置（バイト）。
     * @param {number} size - 範囲の長さ（バイト）。
     * @throws {Error} 範囲がTIFFヘッダにかかるか、ペイロードの終端を超える場合。
     */
    function claim(start, size){
        // ペイロード範囲内か確認
        check(start, size);

        const end = start + size;

        if(ranges.some((range) => range.start < end && start < range.end)){
            issues.add('overlapping TIFF ranges');
        }

        ranges.push({ start, end });
    }

    /**
     * 1つのIFDを読み取り、タグごとの値のビューを `directories` に登録する。
     * 4バイト以下の値はエントリ内、それより長い値は記録されたオフセットから読む。
     *
     * @param {string} name - 登録先のIFD名。
     * @param {number} offset - TIFF先頭からIFDのエントリ数フィールドまでの位置（バイト）。
     * @returns {number} 次のIFDへのTIFF基準のオフセット。次のIFDがなければ `0`。
     * @throws {Error} IFD参照が重複・循環している場合、解析全体で512タグを超える場合、または範囲やエントリが不正な場合。
     */
    function readDirectory(name, offset){
        if(offsets.has(offset)){
            throw new Error('Repeated or circular Exif directory offset.');
        }

        offsets.add(offset);
        check(offset, 2);

        const count = view.getUint16(offset, little);

        tagCount += count;

        if(tagCount > 512){
            throw new Error('Too many Exif tags.');
        }

        claim(offset, IFD_ENTRY_BYTES * count + IFD_DIRECTORY_OVERHEAD);

        const entries = new Map();

        for(let i = 0; i < count; i++){
            const start    = i * IFD_ENTRY_BYTES + offset + 2;
            const tag      = view.getUint16(start, little);
            const type     = view.getUint16(start + 2, little);
            const elements = view.getUint32(start + 4, little);

            if(entries.has(tag)){
                throw new Error('Duplicate Exif tag.');
            }
            if(!TYPE_BYTES[type] || !elements){
                throw new Error('Invalid or unsupported Exif value type or count.');
            }

            const size       = TYPE_BYTES[type] * elements;
            const valueField = start + 8;
            const dataStart  = (size <= IFD_INLINE_VALUE_BYTES) ? valueField : view.getUint32(valueField, little);

            if(size > IFD_INLINE_VALUE_BYTES){
                claim(dataStart, size);
            } else if(tiff.subarray(valueField + size, valueField + IFD_INLINE_VALUE_BYTES).some(Boolean)){
                issues.add('nonzero TIFF value padding');
            }

            entries.set(tag, {
                tag,
                type,
                count: elements,
                dataOffset: dataStart,
                data: tiff.subarray(dataStart, dataStart + size)
            });
        }

        const next = view.getUint32(IFD_ENTRY_BYTES * count + offset + 2, little);

        if(next && offsets.has(next)){
            throw new Error('Repeated or circular Exif directory offset.');
        }

        directories.set(name, entries);

        return next;
    }

    /**
     * 参照先の位置やサムネイルの長さに使う単一の符号なしLONG値を読み取る。
     *
     * @param {Map<number, ExifEntry>} entries - タグIDをキーとする解析済みIFDエントリ。
     * @param {number} tag - 読み取るタグID。
     * @returns {number | null} タグに格納された値。タグがなければ `null`。
     * @throws {Error} タグが存在し、型がLONG以外または要素数が1以外の場合。
     */
    function pointer(entries, tag){
        const entry = entries.get(tag);

        if(!entry){
            return null;
        }

        if(entry.type !== IFD_TYPE.LONG || entry.count !== 1){
            throw new Error('Invalid Exif directory pointer.');
        }

        return new DataView(entry.data.buffer, entry.data.byteOffset, 4).getUint32(0, little);
    }

    // 8バイトのTIFFヘッダ。位置2に固定値42(0x002a)、位置4に最初のIFDへのオフセット。
    // IFDや外部値へのオフセットはTIFFヘッダ先頭からの相対バイト位置。
    if(tiff.length < TIFF_HEADER_BYTES || (!little && order !== BIG_ENDIAN_BYTE_ORDER) || view.getUint16(2, little) !== TIFF_MAGIC){
        throw new Error('Invalid Exif TIFF header.');
    }

    const ifd1    = readDirectory(IFD.PRIMARY, view.getUint32(4, little));
    const primary = directories.get(IFD.PRIMARY);

    for(const [name, offset] of [
        [IFD.EXIF, pointer(primary, TIFF_TAG.ExifIFDPointer)],   // ExifIFDPointer
        [IFD.GPS, pointer(primary, TIFF_TAG.GPSInfoIFDPointer)], // GPSInfoIFDPointer
        [IFD.THUMBNAIL, ifd1 || null]
    ]){
        if(offset !== null && readDirectory(name, offset)){
            throw new Error('Additional Exif directory chains are unsupported.');
        }
    }

    const thumbnail = directories.get(IFD.THUMBNAIL);

    let thumbnailJpeg = null;

    if(thumbnail){
        const start = pointer(thumbnail, TIFF_TAG.JPEGInterchangeFormat);       // JPEGInterchangeFormat (TIFF先頭からの位置)
        const size  = pointer(thumbnail, TIFF_TAG.JPEGInterchangeFormatLength); // JPEGInterchangeFormatLength (バイト数)

        if(start !== null || size !== null){
            if(!size || start === null){
                throw new Error('Invalid Exif thumbnail reference.');
            }

            claim(start, size);

            const end = start + size;
            if(
                !issues.has('overlapping TIFF ranges') && size >= 4
                && tiff[start] === 0xff && tiff[start + 1] === 0xd8
                && tiff[end - 2] === 0xff && tiff[end - 1] === 0xd9
            ){
                thumbnailJpeg = tiff.subarray(start, end);
            }
        }
    }

    let end = 0;

    for(const range of ranges.sort((a, b) => a.start - b.start)){
        if(tiff.subarray(end, range.start).some(Boolean)){
            issues.add('unreferenced TIFF data');
        }

        end = Math.max(end, range.end);
    }

    if(tiff.subarray(end).some(Boolean)){
        issues.add('unreferenced TIFF data');
    }

    const fields    = [];
    const otherTags = [];

    for(const [source, entries] of directories){
        for(const entry of entries.values()){
            const label = DISPLAY_TAGS[source]?.[entry.tag];

            if(label){
                fields.push({
                    source,
                    label,
                    value: formatStandardValue(source, entry, little) ?? exifDecode(entry, little)
                });
            } else{
                otherTags.push({source, tag: entry.tag});
            }
        }
    }

    return {
        little, directories, fields, otherTags,
        issues: [...issues],
        thumbnail: thumbnailJpeg
    };
}
