/**
 * Exifデータを整形表示するためのフォーマッター群。
 */

import {
    IFD, IFD_TYPE,
    EXIF_TAG, GPS_TAG, TIFF_TAG,
    FLASH_BITS, FLASH_MODES, FLASH_RETURN,
    SHORT_VALUES, TYPE_BYTES,
} from "./exif-constants.js";
import { decode as exifDecode } from "./exif-decoder.js";

/**
 * 外側のキーはIFD名、内側の数値キーはそのIFD内の16ビットのタグID。
 *
 * @type {Record<string, Record<number, string>>}
 */
export const DISPLAY_TAGS = {
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
export function formatStandardValue(source, entry, little){
    const { tag, type, count, data } = entry;

    const isExif     = (source === IFD.EXIF);
    const isDateTime = (
        // Exif IFD0 DateTime
        (source === IFD.PRIMARY && tag === TIFF_TAG.DateTime)
        // Exif SubIFD DateTimeOriginal/DateTimeDigitized
        || (isExif && (tag === EXIF_TAG.DateTimeOriginal || tag === EXIF_TAG.DateTimeDigitized))
    );

    if(isDateTime && type === IFD_TYPE.ASCII && count === 20 && data[19] === 0){
        return formatDateTime(exifDecode(entry, little));
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
