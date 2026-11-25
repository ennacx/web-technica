/**
 * Exif解析データを二次加工する
 */

import { readExif } from './exif-reader.js';

/**
 * Exif APP1ごとの読み取り結果。失敗時は元のセグメントとエラー文を保持する。
 *
 * @typedef {(
 *   {segment: import('./jpeg-parser.js').JpegSegment, exif: ExifData, error?: undefined}
 *   | {segment: import('./jpeg-parser.js').JpegSegment, exif?: undefined, error: string}
 *   )} ExifInspection
 */

/**
 * JPEG内の 'Exif APP1' をファイル順に解析し、個別の失敗を結果に記録する。
 *
 * @param {Uint8Array} bytes - JPEGの元バイト列。
 * @param {import('./jpeg-parser.js').JpegInspection} jpeg - 同じバイト列を解析した結果。
 * @returns {ExifInspection[]} Exif APP1 ごとの結果。Exifセグメントがなければ空配列。
 */
export function inspectJpeg(bytes, jpeg){
    return jpeg.segments.filter(({ kind }) => kind === 'Exif').map((segment) => {
        try{
            return { segment, exif: readExif(bytes.subarray(segment.payload + 6, segment.end)) };
        } catch(error){
            return { segment, error: error.message };
        }
    });
}

/**
 * 解析済みのExif APP1から最初の埋め込みJPEG候補を取得する。
 *
 * @param {ExifInspection[]} inspections - ファイル順のExif解析結果。
 * @returns {Uint8Array | null} サムネイルのビュー。候補がなければ null。
 */
export function getExifThumbnail(inspections){
    return inspections.find(({ exif }) => exif?.thumbnail)?.exif.thumbnail ?? null;
}
