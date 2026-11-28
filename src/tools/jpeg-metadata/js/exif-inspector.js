/**
 * JPEGのExif APP1を読み取り、Inspectの表示モデルを組み立てる。
 */

import { IFD, IFD_TYPE, TIFF_TAG } from './exif-constants.js';
import { EXIF_DEFINITIONS } from './exif-definitions.js';
import { readExif } from './exif-reader.js';
import { decode as exifDecode } from './exif-decoder.js';
import { formatExifEntry } from './exif-formatter.js';

/**
 * @typedef {object} ExifDisplayModel
 * @property {{source: string, label: string, value: string}[]} fields - 主要項目とGPS欄に表示する値。
 * @property {{source: string, tag: number}[]} otherTags - 詳細一覧に表示するタグのIFD名とID。
 */

/**
 * 指定IFDの有効なOrientation（SHORT型・1要素・1〜8）を取得する。
 *
 * @param {import('./exif-reader.js').ExifData} exif - 解析済みExif。
 * @param {string} [directory=IFD.PRIMARY] - 対象のIFD名。
 * @returns {number|undefined} 有効値。欠落・不正ならundefined。
 */
export function readOrientation(exif, directory = IFD.PRIMARY){
    const entry = exif.directories.get(directory)?.get(TIFF_TAG.Orientation);

    if(!entry || entry.type !== IFD_TYPE.SHORT || entry.count !== 1){
        return undefined;
    }

    const decoded = exifDecode(entry, exif.little);
    const value = (decoded.kind === 'numeric') ? decoded.values[0] : undefined;

    return (Number.isInteger(value) && value >= 1 && value <= 8)
        ? value
        : undefined;
}

/**
 * ファイル順で最初の有効な主画像Orientationを取得する。
 *
 * @param {ExifInspection[]} inspections - Exif APP1ごとの解析結果。
 * @returns {number|undefined} 有効値。取得できなければundefined。
 */
export function getOrientation(inspections){
    for(const { exif } of inspections){
        const value = exif && readOrientation(exif);

        if(value !== undefined){
            return value;
        }
    }

    return undefined;
}

/**
 * 読み取り済みのIFDを、表示名のある項目と詳細一覧に振り分ける。
 *
 * @param {import('./exif-reader.js').ExifData} exif - Exif APP1の解析結果。
 * @returns {ExifDisplayModel} 書き換えや削除とは独立した表示用データ。
 */
export function createExifDisplayModel(exif){
    const fields    = [];
    const otherTags = [];

    for(const [source, entries] of exif.directories){
        for(const entry of entries.values()){
            const label = EXIF_DEFINITIONS[source]?.[entry.tag]?.label;

            if(label){
                fields.push({
                    source,
                    label,
                    value: formatExifEntry(source, entry, exif.little),
                });
            } else{
                otherTags.push({
                    source,
                    tag: entry.tag,
                });
            }
        }
    }

    return { fields, otherTags };
}

/**
 * Exif APP1ごとの読み取り結果。失敗時は元のセグメントとエラー文を保持する。
 *
 * @typedef {(
 *   {segment: import('./jpeg-parser.js').JpegSegment, exif: import('./exif-reader.js').ExifData, error?: undefined}
 *   | {segment: import('./jpeg-parser.js').JpegSegment, exif?: undefined, error: string}
 *   )} ExifInspection
 */

/**
 * JPEG内のExif APP1をファイル順に同期解析し、個別の失敗を結果に記録する。
 *
 * @param {Uint8Array} bytes - JPEGの元バイト列。
 * @param {import('./jpeg-parser.js').JpegInspection} jpeg - 同じバイト列を解析した結果。
 * @returns {ExifInspection[]} Exif APP1 ごとの結果。Exifセグメントがなければ空配列。
 */
export function inspectJpeg(bytes, jpeg){
    return jpeg.segments.filter(({ kind }) => kind === 'Exif').map((segment) => {
        try{
            return {
                segment,
                exif: readExif(bytes.subarray(segment.payload + 6, segment.end)),
            };
        } catch(error){
            return {
                segment,
                error: error.message,
            };
        }
    });
}

/**
 * 解析済みのExif APP1から最初の埋め込みJPEG候補を取得する。
 *
 * @param {ExifInspection[]} inspections - ファイル順のExif解析結果。
 * @returns {Uint8Array | null} 最初の候補のバイト列。元のJPEGとメモリを共有するビューで、復号可否は呼び出し側で確認する。候補がなければ `null`。
 */
export function getExifThumbnail(inspections){
    return inspections.find(({ exif }) => exif?.thumbnail)?.exif.thumbnail ?? null;
}
