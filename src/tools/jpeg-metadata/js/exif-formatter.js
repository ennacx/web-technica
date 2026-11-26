/** デコード済みのExif値をタグ定義または汎用形式で表示する。 */

import { TYPE_NAMES } from './exif-constants.js';
import { decode as exifDecode } from './exif-decoder.js';
import { EXIF_DEFINITIONS } from './exif-definitions.js';

const BINARY_PREVIEW_BYTES = 32;
const DISPLAY_LIMITS = { maxTextBytes: 512, maxElements: 12 };

/**
 * タグの型と要素数が定義に合う場合は専用のコールバックを使う。
 *
 * @param {string | undefined} source - エントリを取得したIFD名。
 * @param {import('./exif-reader.js').ExifEntry} entry - 解析済みタグ。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @returns {string} 項目固有の表示値。変換できない値は型に応じて汎用表示する。
 */
export function formatExifEntry(source, entry, little){
    const decoded    = exifDecode(entry, little, DISPLAY_LIMITS);
    const definition = EXIF_DEFINITIONS[source]?.[entry.tag];

    if(
        definition?.format
        && (definition.type === undefined || definition.type === entry.type)
        && (definition.count === undefined || definition.count === entry.count)
    ){
        const formatted = definition.format(decoded);

        if(formatted !== undefined){
            return formatted;
        }
    }

    if(decoded.kind === 'text'){
        return decoded.text.replace(/\0+$/, '').replaceAll('\0', ' / ') + (decoded.truncated ? '…' : '');
    }
    if(decoded.kind === 'numeric'){
        const values = decoded.values.map((value) => (typeof value === 'number') ?
            value :
            `${value.numerator}/${value.denominator}`
        );

        return values.join(', ') + (decoded.truncated ? ', …' : '');
    }

    const prefix = decoded.bytes.subarray(0, BINARY_PREVIEW_BYTES);
    const suffix = (decoded.bytes.length > prefix.length) ? ' …' : '';

    // "00" ~ "FF" のHEX値
    const hex = Array.from(prefix, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    // ASCIIの非制御文字 (可読可能文字)
    const ascii = Array.from(prefix, (byte) => (byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(byte) : '.').join('');

    return `${hex} │ ${ascii}${suffix}`;
}

/**
 * 詳細一覧に表示するTIFF型名と、値のプレビューを生成する。
 *
 * @param {import('./exif-reader.js').ExifEntry} entry - 解析済みタグ。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @param {string} [source] - タグ定義の検索に使うIFD名。
 * @returns {{typeName: string, value: string}} TIFF型名と表示用の値。
 */
export function previewExifEntry(entry, little, source){
    return {
        typeName: TYPE_NAMES.get(entry.type) ?? `Type ${entry.type}`,
        value: formatExifEntry(source, entry, little)
    };
}
