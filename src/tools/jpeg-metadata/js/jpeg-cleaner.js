/**
 * JPEGのメタデータ削除、Exif GPS削除、出力検証を担当するライブラリ。
 */

import { IFD, TIFF_TAG } from './exif-constants.js';
import { parseJpeg } from './jpeg-parser.js';
import { inspectJpeg, readOrientation } from './exif-inspector.js';
import { rebuildWithoutGps } from './gps-cleaner.js';

/**
 * `metadata` モードでセグメントごと削除するペイロードの分類名。
 *
 * @type {Set<string>}
 */
const REMOVE_KINDS = new Set(['Exif', 'XMP', 'Extended XMP', 'Photoshop / IPTC', 'Comment']);

/**
 * `metadata` は対象メタデータのセグメントを削除する。
 * `location` は対応するExifをGPS IFDとその値を除いて再構築する。
 *
 * @typedef {'metadata' | 'location'} JpegCleanupMode
 */

/**
 * @typedef {object} CleanedJpeg
 * @property {Uint8Array} bytes - 検証済みの出力JPEG全体。
 * @property {Map<string, number>} removed - 削除した分類ごとのセグメント数。GPS削除時は `Exif GPS IFD` を1件として記録する。
 * @property {string[]} retained - 出力に残ったメタデータの分類名と、検出したサムネイルの情報。
 * @property {string} warning - `metadata` モードでの表示の向きに関する注意文。注意がなければ空文字列。
 */

/**
 * Exif削除に伴う表示の向きへの影響を案内する。
 *
 * @param {import('./exif-inspector.js').ExifInspection[]} inspections - JPEG内のExif APP1ごとの読み取り結果。
 * @returns {string} Orientationの削除やExifの解析結果に基づく注意文。注意がなければ空文字列。
 */
export function orientationWarning(inspections){
    let ambiguous = false;

    for(const { exif, error } of inspections){
        ambiguous ||= (error !== undefined || Boolean(exif?.issues.length));

        const orientationEntry = exif?.directories.get(IFD.PRIMARY)?.get(TIFF_TAG.Orientation);

        if(!orientationEntry){
            continue;
        }

        const value = readOrientation(exif);

        if(value === undefined){
            ambiguous = true;
        } else if(value !== 1){
            return 'Removing Exif Orientation may rotate or mirror the displayed image.';
        }
    }

    if(ambiguous){
        return 'Some Exif data is malformed or ambiguous. Check the displayed image orientation after removing metadata.';
    }

    return '';
}

/**
 * GPS削除の対象JPEGで扱えるセグメントか判定する。
 * 分類のない構造マーカーと後段で検証するExifを許可し、JFIFはサムネイルなしの固定長、Adobeは固定長に限る。
 *
 * @param {Uint8Array} bytes - セグメントのオフセットに対応する元JPEG全体。
 * @param {import('./jpeg-parser.js').JpegSegment} segment - 判定する解析済みセグメント。
 * @returns {boolean} セグメントの分類とペイロードがGPS削除モードの条件を満たす場合は `true`。
 */
function safeLocationContainer(bytes, segment){
    const { kind, payload, end } = segment;

    if(!kind || kind === 'Exif'){
        return true;
    } else if(kind === 'JFIF'){
        return (
            (end - payload) === 14
            && bytes[payload + 12] === 0
            && bytes[payload + 13] === 0
        );
    } else if(kind === 'Adobe'){
        return ((end - payload) === 12);
    }

    return false;
}

/**
 * 2つのバイト列を長さと各位置のバイト値で比較する。
 *
 * @param {Uint8Array} left - 比較する一方のバイト列。
 * @param {Uint8Array} right - 比較するもう一方のバイト列。
 * @returns {boolean} 長さと全バイトが一致する場合は `true`。
 */
const equalBytes = (left, right) => (left.length === right.length && left.every((byte, index) => (byte === right[index])));

/**
 * 元のバイト列を変更せず、指定モードで対象範囲を削除・置換して新しいJPEGを作る。
 * GPS削除では、位置情報や埋め込み画像を評価できないセグメント、複数のExif、無効なExifがあれば処理を中止する。
 * 出力を再解析し、保持対象のセグメントと圧縮スキャンが元のバイト列と一致することを確認する。
 * `metadata` では削除対象のセグメントの不在、`location` ではExifが1つ残り、GPS IFDがないことも確認する。
 *
 * @param {Uint8Array} bytes - JPEGの元バイト列。
 * @param {JpegCleanupMode} mode - 適用する削除モード。
 * @returns {CleanedJpeg | {bytes: null}} 検証済みの出力と削除結果。変更対象がなければ `{bytes: null}`。
 * @throws {Error} モードや入力が不正、入力構造が処理対象外、または出力の検証に失敗した場合。
 */
export function cleanJpeg(bytes, mode){
    if(mode !== 'metadata' && mode !== 'location'){
        throw new Error('Choose a cleanup mode.');
    }

    const before = parseJpeg(bytes);

    if(before.restrictions.length){
        throw new Error(`Cleanup is unavailable for this JPEG: ${before.restrictions.join(', ')}.`);
    }

    const inspections = inspectJpeg(bytes, before);
    const changes     = [];
    const removed     = new Map();

    let warning = '';

    if(mode === 'metadata'){
        warning = orientationWarning(inspections);

        for(const segment of before.segments){
            if(!REMOVE_KINDS.has(segment.kind)){
                continue;
            }

            changes.push({ segment, replacement: new Uint8Array(0) });
            removed.set(segment.kind, (removed.get(segment.kind) ?? 0) + 1);
        }
    } else{
        const unsupported = before.segments.find((segment) => (!safeLocationContainer(bytes, segment)));

        if(unsupported){
            throw new Error(`Location-only cleanup cannot assess ${unsupported.kind} for location data or embedded images. Try Remove metadata if appropriate.`);
        }
        if(inspections.length > 1){
            throw new Error('Location-only cleanup supports at most one Exif segment.');
        }

        const inspection = inspections[0];

        if(inspection?.error){
            throw new Error(`Location-only cleanup requires valid Exif. ${inspection.error}`);
        }

        if(inspection){
            const replacement = rebuildWithoutGps(inspection.exif);

            if(replacement){
                changes.push({ segment: inspection.segment, replacement });
                removed.set('Exif GPS IFD', 1);
            }
        }
    }

    const size = bytes.length + changes.reduce((delta, { segment, replacement }) =>
        delta + replacement.length - (segment.end - segment.offset), 0
    );

    if(!changes.length){
        return {bytes: null};
    }

    const result = new Uint8Array(size);

    let source = 0;
    let target = 0;

    for(const { segment, replacement } of changes){
        result.set(bytes.subarray(source, segment.offset), target);
        target += segment.offset - source;

        result.set(replacement, target);
        target += replacement.length;

        source = segment.end;
    }

    result.set(bytes.subarray(source), target);

    const after  = parseJpeg(result);
    const edited = new Set(changes.map(({ segment }) => segment));
    const originalSegments = before.segments.filter((segment) => (!edited.has(segment)));
    const outputSegments   = after.segments.filter(({ kind }) => (!REMOVE_KINDS.has(kind)));

    if(
        after.restrictions.length
        || originalSegments.length !== outputSegments.length
        || !originalSegments.every(({ offset, end }, index) => {
            const output = outputSegments[index];
            return equalBytes(bytes.subarray(offset, end), result.subarray(output.offset, output.end));
        })
        || before.scans.length !== after.scans.length
        || !before.scans.every(({ offset, end }, index) => {
            const output = after.scans[index];
            return equalBytes(bytes.subarray(offset, end), result.subarray(output.offset, output.end));
        })
    ){
        throw new Error('Cleaned JPEG failed marker or scan preservation verification.');
    }

    const outputMetadata = after.segments.filter(({ kind }) => REMOVE_KINDS.has(kind));

    if(mode === 'metadata' && outputMetadata.length){
        throw new Error('Cleaned JPEG still contains targeted metadata.');
    }

    if(mode === 'location'){
        const [inspection] = inspectJpeg(result, after);

        if(outputMetadata.length !== 1 || !inspection?.exif || inspection.exif.directories.has(IFD.GPS)){
            throw new Error('Cleaned JPEG failed Exif GPS verification.');
        }
    }

    const retained = [...new Set(after.segments.map(({ kind }) => kind).filter(Boolean))];

    if(
        after.segments.some(({ kind, payload, end }) =>
            (kind === 'JFIF extension')
            || (
                kind === 'JFIF'
                && (
                    (end - payload) !== 14
                    || result[payload + 12]
                    || result[payload + 13]
                )
            )
        )
    ){
        retained.push('Possible JFIF thumbnail');
    }

    return { bytes: result, removed, retained, warning };
}

/**
 * クリーン後のファイル名を生成。
 *
 * @param {string} name - 入力ファイル名。
 * @returns {string} 入力ファイル名から末尾の .jpg／.jpeg を除き、`-cleaned.jpg` を付けたファイル名。名前部分が空なら `image` を使う。
 */
export function cleanedFilename(name){
    return (name.replace(/\.jpe?g$/i, '') || 'image') + '-cleaned.jpg';
}
