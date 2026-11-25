/**
 * TIFF / IFDを読み取るためのライブラリ
 *
 * CIPA DC-X008-2019 日本語版 §4.6.2〜4.6.6 (IFD構造・タグ・型), §4.7.2 (APP1)
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 * @see https://printtechnologies.org/standards/files/tiff-v6.pdf
 */

import {
    IFD, IFD_TYPE, TIFF_TAG, EXIF_TAG, GPS_TAG, TYPE_BYTES, TYPE_NAMES, TIFF_MAGIC,
    TIFF_HEADER_BYTES, IFD_ENTRY_BYTES, IFD_DIRECTORY_OVERHEAD, IFD_INLINE_VALUE_BYTES,
    LITTLE_ENDIAN_BYTE_ORDER, BIG_ENDIAN_BYTE_ORDER, SHORT_VALUES, FLASH_BITS, FLASH_MODES, FLASH_RETURN
} from './exif-constants.js';

const BINARY_PREVIEW_BYTES = 32;

/**
 * 外側のキーはIFD名、内側の数値キーはそのIFD内の16ビットのタグID。
 *
 * @type {Record<string, Record<number, string>>}
 */
const DISPLAY_TAGS = {
    [IFD.PRIMARY]: {
        [TIFF_TAG.Make]: 'Camera make',
        [TIFF_TAG.Model]: 'Camera model',
        [TIFF_TAG.Orientation]: 'Orientation',
        [TIFF_TAG.Software]: 'Software',
        [TIFF_TAG.DateTime]: 'DateTime',
        [TIFF_TAG.Artist]: 'Artist',
        [TIFF_TAG.Copyright]: 'Copyright',
    },
    [IFD.EXIF]: {
        [EXIF_TAG.ExposureTime]: 'Exposure time',
        [EXIF_TAG.FNumber]: 'F-number',
        [EXIF_TAG.ExposureProgram]: 'Exposure program',
        [EXIF_TAG.PhotographicSensitivity]: 'ISO',
        [EXIF_TAG.ISOSpeed]: 'ISO speed',
        [EXIF_TAG.DateTimeOriginal]: 'DateTimeOriginal',
        [EXIF_TAG.DateTimeDigitized]: 'DateTimeDigitized',
        [EXIF_TAG.ExposureBiasValue]: 'Exposure compensation',
        [EXIF_TAG.MeteringMode]: 'Metering mode',
        [EXIF_TAG.Flash]: 'Flash',
        [EXIF_TAG.FocalLength]: 'Focal length',
        [EXIF_TAG.ExposureMode]: 'Exposure mode',
        [EXIF_TAG.WhiteBalance]: 'White balance',
        [EXIF_TAG.FocalLengthIn35mmFilm]: '35 mm equivalent focal length',
        [EXIF_TAG.LensSpecification]: 'Lens specification',
        [EXIF_TAG.LensModel]: 'Lens model',
    },
    [IFD.GPS]: {
        [GPS_TAG.LatitudeRef]: 'Latitude reference',
        [GPS_TAG.Latitude]: 'Latitude',
        [GPS_TAG.LongitudeRef]: 'Longitude reference',
        [GPS_TAG.Longitude]: 'Longitude',
        [GPS_TAG.AltitudeRef]: 'Altitude reference',
        [GPS_TAG.Altitude]: 'Altitude',
    }
};

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
 */

/**
 * Exif APP1ごとの読み取り結果。失敗時は元のセグメントとエラー文を保持する。
 *
 * @typedef {(
 *   {segment: import('./jpeg-parser.js').JpegSegment, exif: ExifData, error?: undefined}
 *   | {segment: import('./jpeg-parser.js').JpegSegment, exif?: undefined, error: string}
 *   )} ExifInspection
 */

/**
 * GPS削除時に、このタグの値を再構築先へ移せるか判定する。
 * ASCIIタグと4バイトのバージョンタグのほか、許可リストにある単一値を対象とする。
 *
 * @param {string} directory - IFD名。
 * @param {Pick<ExifEntry, 'tag' | 'type' | 'count'>} entry - タグID、型、要素数。
 * @returns {boolean} タグID・型・要素数が移設条件を満たす場合は `true`。実際の値の検証は再構築側で行う。
 */
export function isRelocatableTag(directory, { tag, type, count }){
    if(ASCII_TAGS[directory]?.has(tag)){
        return (type === IFD_TYPE.ASCII);
    }

    if(directory === IFD.EXIF && (tag === EXIF_TAG.ExifVersion || tag === EXIF_TAG.FlashpixVersion)){
        return (type === IFD_TYPE.UNDEFINED && count === 4);
    }

    return (count === 1 && Boolean(SCALAR_TYPES[directory]?.[tag]?.includes(type)));
}

/**
 * タグの値を表示用の文字列に変換する。
 *
 * @param {ExifEntry} entry - 解析済みタグ。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @returns {string} ASCIIは先頭512バイト、数値は先頭12要素までの表示文字列。
 */
function decode(entry, little){
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
        return { typeName, value: decode(entry, little) };
    }

    const prefix = data.subarray(0, BINARY_PREVIEW_BYTES);
    const suffix = (data.length > prefix.length) ? ' …' : '';
    const hex    = Array.from(prefix, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const ascii  = Array.from(prefix, (byte) => (byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(byte) : '.').join('');

    return { typeName, value: `${hex} │ ${ascii}${suffix}` };
}

/**
 * 日時まわりのフォーマット (UTC)
 *
 * @type {Intl.DateTimeFormat}
 */
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC'
});

/**
 * 焦点距離まわりのフォーマット
 *
 * @type {Intl.NumberFormat}
 */
const focalLengthFormat = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3
});

/**
 * 露出補正のフォーマット
 *
 * @type {Intl.NumberFormat}
 */
const exposureCompensationFormat = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero'
});

/**
 * Exifの記録時刻を維持し、ブラウザーのロケールで表示する。
 *
 * @param {string} value - 終端NULを除いたExif日時。
 * @returns {string} 表示用の日時。空欄や不正な日時は元の値を返す。
 */
function formatDateTime(value){
    const parts = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if(!parts){
        return value;
    }

    const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
    const date = new Date(0);
    // Exifの時刻を維持し、端末のタイムゾーンや夏時間の影響を避ける。
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second);

    if(
        !year || date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
        || hour > 23 || minute > 59 || second > 59
    ){
        return value;
    }

    return dateTimeFormat.format(date);
}

/**
 * Flashのビットフィールドを撮影時の状態に展開する。
 *
 * @param {number} value - FlashタグのSHORT値。
 * @returns {string | undefined} 予約ビットを含む場合は undefined。
 */
function formatFlash(value){
    const returned = (value >> FLASH_BITS.RETURN_SHIFT) & FLASH_BITS.FIELD_MASK;

    if((value & FLASH_BITS.RESERVED_MASK) || returned === FLASH_BITS.RESERVED_RETURN){
        return undefined;
    }

    const mode  = (value >> FLASH_BITS.MODE_SHIFT) & FLASH_BITS.FIELD_MASK;
    const fired = (value & FLASH_BITS.FIRED) ? 'Fired' : 'Did not fire';

    return [
        (value & FLASH_BITS.NO_FUNCTION) ? 'No flash function' : fired,
        FLASH_MODES[mode],
        FLASH_RETURN[returned],
        (value & FLASH_BITS.RED_EYE) && 'Red-eye reduction'
    ].filter(Boolean).join(' · ');
}

/**
 * 焦点距離と、その両端での開放F値を表示する。
 *
 * @param {Uint8Array} data - 4要素のRATIONAL値。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @returns {string | undefined} 未知の開放F値（0/0）は省略し、不正な値は undefined を返す。
 */
function formatLensSpecification(data, little){
    const view   = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const values = [];

    for(let index = 0; index < 4; index++){
        const offset      = index * TYPE_BYTES[IFD_TYPE.RATIONAL];
        const numerator   = view.getUint32(offset, little);
        const denominator = view.getUint32(offset + 4, little);

        if(numerator && denominator){
            values.push(numerator / denominator);
        } else if(index >= 2 && numerator === 0 && denominator === 0){
            values.push(null);
        } else{
            return undefined;
        }
    }

    const [min, max, wide, tele] = values;

    if(min > max){
        return undefined;
    }

    const focalLength = (min === max) ?
        focalLengthFormat.format(min) :
        `${focalLengthFormat.format(min)}–${focalLengthFormat.format(max)}`;

    if(wide === null && tele === null){
        return `${focalLength} mm`;
    }

    const aperture = ((wide === tele) ? [wide] : [wide, tele])
        .map((value) => (value === null) ? '?' : `f/${focalLengthFormat.format(value)}`)
        .join('–');

    return `${focalLength} mm, ${aperture}`;
}

/**
 * Exifフィールドの出力フォーマット。
 *
 * @param {string | undefined} source - エントリを取得したIFD名。
 * @param {ExifEntry} entry - 解析済みタグ。
 * @param {boolean} little - TIFFがリトルエンディアンなら `true`。
 * @returns {string | undefined} 規格に沿った表示値。変換できない場合は undefined。
 */
function formatStandardValue(source, entry, little){
    const { tag, type, count, data } = entry;

    const isExif     = (source === IFD.EXIF);
    const isDateTime = (
        // Exif IFD0 DateTime
        (source === IFD.PRIMARY && tag === TIFF_TAG.DateTime)
        // Exif SubIFD DateTimeOriginal/DateTimeDigitized
        || (isExif && (tag === EXIF_TAG.DateTimeOriginal || tag === EXIF_TAG.DateTimeDigitized))
    );

    if(isDateTime && type === IFD_TYPE.ASCII && count === 20 && data[19] === 0){
        return formatDateTime(decode(entry, little));
    }

    if(type === IFD_TYPE.SHORT && count === 1){
        const values = SHORT_VALUES[source]?.[tag];

        if(values || (isExif && tag === EXIF_TAG.Flash)){
            const value = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(0, little);

            return (values) ? values[value] : formatFlash(value);
        }
    }

    if(isExif && tag === EXIF_TAG.LensSpecification && type === IFD_TYPE.RATIONAL && count === 4){
        return formatLensSpecification(data, little);
    }

    if(isExif && count === 1){
        if(tag === EXIF_TAG.ExposureBiasValue && type === IFD_TYPE.SRATIONAL){
            const view        = new DataView(data.buffer, data.byteOffset, data.byteLength);
            const denominator = view.getInt32(4, little);

            if(denominator){
                return `${exposureCompensationFormat.format(view.getInt32(0, little) / denominator)} EV`;
            }
        }

        // Focal length
        if(tag === EXIF_TAG.FocalLength && type === IFD_TYPE.RATIONAL){
            const view        = new DataView(data.buffer, data.byteOffset, data.byteLength);
            const denominator = view.getUint32(4, little);

            if(denominator){
                return `${focalLengthFormat.format(view.getUint32(0, little) / denominator)} mm`;
            }
        }
        // 35 mm equivalent focal length
        if(tag === EXIF_TAG.FocalLengthIn35mmFilm && type === IFD_TYPE.SHORT){
            const view        = new DataView(data.buffer, data.byteOffset, data.byteLength);
            const focalLength = view.getUint16(0, little);

            return (focalLength) ? `${focalLengthFormat.format(focalLength)} mm` : 'Unknown';
        }
    }

    return undefined;
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

    if(thumbnail){
        const start = pointer(thumbnail, TIFF_TAG.JPEGInterchangeFormat);       // JPEGInterchangeFormat (TIFF先頭からの位置)
        const size  = pointer(thumbnail, TIFF_TAG.JPEGInterchangeFormatLength); // JPEGInterchangeFormatLength (バイト数)

        if(start !== null || size !== null){
            if(!size || start === null){
                throw new Error('Invalid Exif thumbnail reference.');
            }

            claim(start, size);
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
                    value: formatStandardValue(source, entry, little) ?? decode(entry, little)
                });
            } else{
                otherTags.push({source, tag: entry.tag});
            }
        }
    }

    return { little, directories, fields, otherTags, issues: [...issues] };
}

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
