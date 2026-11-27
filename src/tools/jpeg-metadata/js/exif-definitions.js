/** Exif表示用のタグ定義と項目固有のフォーマット。 */
import {
    IFD, IFD_TYPE,
    EXIF_TAG, GPS_TAG, TIFF_TAG,
    FLASH_BITS
} from './exif-constants.js';

/** 解像度の範囲 */
const resolutionUnits = Object.freeze({
    2: 'Inches',
    3: 'Centimeters',
});

/** SHORT型を1要素持つタグの列挙値。 */
const SHORT_VALUES = Object.freeze({
    [IFD.PRIMARY]: {
        [TIFF_TAG.ResolutionUnit]: resolutionUnits,
        [TIFF_TAG.Orientation]: {
            1: 'Normal',
            2: 'Mirror horizontal',
            3: 'Rotate 180°',
            4: 'Mirror vertical',
            5: 'Transpose', // Mirror horizontal + Rotate 270° CW
            6: 'Rotate 90° CW',
            7: 'Transverse', // Mirror horizontal + Rotate 90° CW
            8: 'Rotate 270° CW',
        },
    },
    [IFD.THUMBNAIL]: {
        [TIFF_TAG.Compression]: {
            1: 'Uncompressed',
            6: 'JPEG',
        },
        [TIFF_TAG.ResolutionUnit]: resolutionUnits
    },
    [IFD.EXIF]: {
        [EXIF_TAG.ExposureProgram]: [
            'Undefined',
            'Manual',
            'Normal program',
            'Aperture priority',
            'Shutter priority',
            'Creative program',
            'Action program',
            'Portrait',
            'Landscape'
        ],
        [EXIF_TAG.SensitivityType]: [
            'Unknown', 'SOS', 'REI', 'ISO speed',
            'SOS + REI', 'SOS + ISO speed', 'REI + ISO speed', 'SOS + REI + ISO speed'
        ],
        [EXIF_TAG.MeteringMode]: {
              0: 'Unknown',
              1: 'Average',
              2: 'Center-weighted average',
              3: 'Spot',
              4: 'Multi-spot',
              5: 'Pattern',
              6: 'Partial',
            255: 'Other',
        },
        [EXIF_TAG.LightSource]: {
              0: 'Unknown',
              1: 'Daylight',
              2: 'Fluorescent',
              3: 'Tungsten',
              4: 'Flash',
              9: 'Fine weather',
             10: 'Cloudy',
             11: 'Shade',
             12: 'Daylight fluorescent',
             13: 'Day white fluorescent',
             14: 'Cool white fluorescent',
             15: 'White fluorescent',
             16: 'Warm white fluorescent',
             17: 'Standard light A',
             18: 'Standard light B',
             19: 'Standard light C',
             20: 'D55',
             21: 'D65',
             22: 'D75',
             23: 'D50',
             24: 'ISO studio tungsten',
            255: 'Other',
        },
        [EXIF_TAG.ColorSpace]: {
                1: 'sRGB',
            65535: 'Uncalibrated',
        },
        [EXIF_TAG.FocalPlaneResolutionUnit]: resolutionUnits,
        [EXIF_TAG.CustomRendered]: ['Normal', 'Custom'],
        [EXIF_TAG.ExposureMode]: ['Auto exposure', 'Manual exposure', 'Auto bracket'],
        [EXIF_TAG.WhiteBalance]: ['Auto', 'Manual'],
        [EXIF_TAG.SceneCaptureType]: ['Standard', 'Landscape', 'Portrait', 'Night scene'],
        [EXIF_TAG.Contrast]: ['Normal', 'Soft', 'Hard'],
        [EXIF_TAG.Saturation]: ['Normal', 'Low', 'High'],
        [EXIF_TAG.Sharpness]: ['Normal', 'Soft', 'Hard']
    }
});

const FLASH_MODES = [
    null,
    'Forced on',
    'Forced off',
    'Auto'
];
const FLASH_RETURN = [
    null,
    null,
    'Return light not detected',
    'Return light detected'
];

/**
 * Exifに記録された日付と時刻を維持し、ブラウザーのロケールで整形する。
 * UTC指定は端末のタイムゾーンによる時刻のずれを避けるために使う。
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
 * @returns {string | undefined} 表示用の日時。空欄や不正な日時は `undefined`。
 */
function formatDateTime(value){
    const parts = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if(!parts){
        return undefined;
    }

    const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
    const date = new Date(0);
    // Exifの時刻を維持し、端末のタイムゾーンや夏時間の影響を避ける。
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second);

    if(
        !year
        || date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
        || hour > 23 || minute > 59 || second > 59
    ){
        return undefined;
    }

    return dateTimeFormat.format(date);
}

/**
 * Flashのビットフィールドを撮影時の状態に展開する。
 *
 * @param {number} value - FlashタグのSHORT値。
 * @returns {string | undefined} フラッシュの状態。予約ビットまたは予約済みの反射光コードを含む場合は `undefined`。
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
 * @param {DecodedExifValue} decoded - 4要素のRATIONAL値をデコードした結果。
 * @returns {string | undefined} 焦点距離と開放F値。両端の開放F値が未知（0/0）なら焦点距離のみ、片端だけ未知ならその値を `?` と表示する。不正な値は `undefined`。
 */
function formatLensSpecification(decoded){
    if(decoded.kind !== 'numeric' || decoded.values.length !== 4){
        return undefined;
    }

    const values = [];

    for(const [index, fraction] of decoded.values.entries()){
        if(typeof fraction === 'number'){
            return undefined;
        }
        const { numerator, denominator } = fraction;

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

/** @typedef {import('./exif-decoder.js').DecodedExifValue} DecodedExifValue */

/**
 * @typedef {object} ExifDefinition
 * @property {string} [label] - 主要項目やGPS欄に表示する名前。省略時は詳細一覧に表示する。
 * @property {number} [type] - formatを適用するTIFF型。
 * @property {number} [count] - formatを適用する要素数。省略時は要素数で制限しない。
 * @property {(value: DecodedExifValue) => string | undefined} [format] - undefinedを返すと汎用表示に切り替える。
 */

/** @type {ExifDefinition['format']} */
const date = (value) => value.kind === 'text' && value.text.endsWith('\0')
    ? formatDateTime(value.text.slice(0, -1))
    : undefined;

/**
 * @param {string} source - 列挙値を定義したIFD名。
 * @param {number} tag - SHORT型のタグID。
 * @param {string} [label] - 主要項目の表示名。
 * @returns {ExifDefinition}
 */
function shortChoice(source, tag, label){
    const choices = SHORT_VALUES[source][tag];
    return {
        label,
        type: IFD_TYPE.SHORT,
        count: 1,
        format: (value) => (value.kind === 'numeric' && typeof value.values[0] === 'number') ?
            choices[value.values[0]] :
            undefined,
    };
}

/**
 * Short型の汎用
 *
 * @param {string} source - 列挙値を定義したIFD名。
 * @returns {Record<number, ExifDefinition>}
 */
function shortDefinitions(source){
    return Object.fromEntries(Object.keys(SHORT_VALUES[source]).map((tag) => [tag, shortChoice(source, Number(tag))]));
}

/**
 * 除算の汎用
 *
 * @param {(value: number) => string} format - 分数の商を整形する関数。
 * @returns {ExifDefinition['format']}
 */
function formatQuotient(format){
    return (value) => {
        const fraction = (value.kind === 'numeric') ? value.values[0] : undefined;

        return (fraction && typeof fraction === 'object' && fraction.denominator) ?
            format(fraction.numerator / fraction.denominator) :
            undefined;
    };
}

/**
 * IFD名とタグIDごとの表示定義。
 *
 * @type {Record<string, Record<number, ExifDefinition>>}
 */
export const EXIF_DEFINITIONS = Object.freeze({
    [IFD.PRIMARY]: {
        ...shortDefinitions(IFD.PRIMARY),

        [TIFF_TAG.Make]: {
            label: 'Camera make',
        },
        [TIFF_TAG.Model]: {
            label: 'Camera model',
        },
        [TIFF_TAG.Orientation]: shortChoice(IFD.PRIMARY, TIFF_TAG.Orientation, 'Orientation'),
        [TIFF_TAG.Software]: {
            label: 'Software',
        },
        [TIFF_TAG.DateTime]: {
            label: 'DateTime',
            type: IFD_TYPE.ASCII,
            count: 20,
            format: date,
        },
        [TIFF_TAG.Artist]: {
            label: 'Artist',
        },
        [TIFF_TAG.Copyright]: {
            label: 'Copyright'
        }
    },
    [IFD.EXIF]: {
        ...shortDefinitions(IFD.EXIF),

        [EXIF_TAG.ExposureTime]: {
            label: 'Exposure time',
        },
        [EXIF_TAG.FNumber]: {
            label: 'F-number',
            type: IFD_TYPE.RATIONAL,
            count: 1,
            format: formatQuotient((value) => `f/${focalLengthFormat.format(value)}`),
        },
        [EXIF_TAG.ExposureProgram]: shortChoice(IFD.EXIF, EXIF_TAG.ExposureProgram, 'Exposure program'),
        [EXIF_TAG.PhotographicSensitivity]: {
            label: 'ISO',
        },
        [EXIF_TAG.ISOSpeed]: {
            label: 'ISO speed',
        },
        [EXIF_TAG.DateTimeOriginal]: {
            label: 'DateTimeOriginal',
            type: IFD_TYPE.ASCII,
            count: 20,
            format: date,
        },
        [EXIF_TAG.DateTimeDigitized]: {
            label: 'DateTimeDigitized',
            type: IFD_TYPE.ASCII,
            count: 20,
            format: date,
        },
        [EXIF_TAG.ExposureBiasValue]: {
            label: 'Exposure compensation',
            type: IFD_TYPE.SRATIONAL,
            count: 1,
            format: formatQuotient((value) => `${exposureCompensationFormat.format(value)} EV`),
        },
        [EXIF_TAG.MeteringMode]: shortChoice(IFD.EXIF, EXIF_TAG.MeteringMode, 'Metering mode'),
        [EXIF_TAG.Flash]: {
            label: 'Flash',
            type: IFD_TYPE.SHORT,
            count: 1,
            format: (value) => (value.kind === 'numeric' && typeof value.values[0] === 'number')
                ? formatFlash(value.values[0])
                : undefined,
        },
        [EXIF_TAG.FocalLength]: {
            label: 'Focal length',
            type: IFD_TYPE.RATIONAL,
            count: 1,
            format: formatQuotient((value) => `${focalLengthFormat.format(value)} mm`),
        },
        [EXIF_TAG.ExposureMode]: shortChoice(IFD.EXIF, EXIF_TAG.ExposureMode, 'Exposure mode'),
        [EXIF_TAG.WhiteBalance]: shortChoice(IFD.EXIF, EXIF_TAG.WhiteBalance, 'White balance'),
        [EXIF_TAG.FocalLengthIn35mmFilm]: {
            label: '35 mm equivalent focal length',
            type: IFD_TYPE.SHORT,
            count: 1,
            format: (value) => {
                const length = (value.kind === 'numeric') ? value.values[0] : undefined;

                return (typeof length === 'number') ?
                    (length ? `${focalLengthFormat.format(length)} mm` : 'Unknown') :
                    undefined;
            },
        },
        [EXIF_TAG.LensSpecification]: {
            label: 'Lens specification',
            type: IFD_TYPE.RATIONAL,
            count: 4,
            format: formatLensSpecification,
        },
        [EXIF_TAG.LensModel]: {
            label: 'Lens model'
        }
    },
    [IFD.GPS]: {
        [GPS_TAG.LatitudeRef]: {
            label: 'Latitude reference',
        },
        [GPS_TAG.Latitude]: {
            label: 'Latitude',
        },
        [GPS_TAG.LongitudeRef]: {
            label: 'Longitude reference',
        },
        [GPS_TAG.Longitude]: {
            label: 'Longitude',
        },
        [GPS_TAG.AltitudeRef]: {
            label: 'Altitude reference',
        },
        [GPS_TAG.Altitude]: {
            label: 'Altitude',
        }
    },
    [IFD.THUMBNAIL]: shortDefinitions(IFD.THUMBNAIL)
});
