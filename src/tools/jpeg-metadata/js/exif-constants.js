/**
 * TIFFとExifのディレクトリ名、型、タグID、列挙値。
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 */
export const IFD = {
    PRIMARY: 'IFD0',
    EXIF: 'Exif SubIFD',
    GPS: 'GPS IFD',
    THUMBNAIL: 'IFD1'
};

/** TIFFのIFDエントリで使う型名と型番号の対応。 */
export const IFD_TYPE = {
    BYTE:       1,
    ASCII:      2,
    SHORT:      3,
    LONG:       4,
    RATIONAL:   5, // 最初のlongが分子、次のlongが分母。
    SBYTE:      6, // Signed byte
    UNDEFINED:  7, // 8bit byte
    SSHORT:     8, // Signed short
    SLONG:      9, // Signed long
    SRATIONAL: 10, // Signed rational
    FLOAT:     11,
    DOUBLE:    12,
};

/** リトルエンディアンのバイトオーダー */
export const LITTLE_ENDIAN_BYTE_ORDER = 0x4949;
/** ビッグエンディアンのバイトオーダー */
export const BIG_ENDIAN_BYTE_ORDER    = 0x4d4d;

/**
 * TYPE_BYTES のインデックスはTIFF型番号、値はその型に当てはまるバイト数
 * インデックス0の値は、不正な型番号を弾くための番兵値。
 *
 * ex. Idx.2 = ASCII(1 byte)、Idx.3 = SHORT(2 bytes)、Idx.4 = LONG(4 bytes)、Idx.5 = RATIONAL(8 bytes)
 *
 * @type {number[]}
 */
export const TYPE_BYTES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
export const TYPE_NAMES = new Map(Object.entries(IFD_TYPE).map(([name, type]) => [type, name]));
export const TIFF_MAGIC = 42;
export const TIFF_HEADER_BYTES = 8;
export const IFD_ENTRY_BYTES = 12;
/** IFDのタグ件数（2バイト）と次のIFDへのポインター（4バイト）。 */
export const IFD_DIRECTORY_OVERHEAD = 6;
export const IFD_INLINE_VALUE_BYTES = 4;

export const TIFF_TAG = {
    Compression: 0x0103,
    ImageDescription: 0x010e,
    Make: 0x010f,
    Model: 0x0110,
    Orientation: 0x0112,
    XResolution: 0x011a,
    YResolution: 0x011b,
    ResolutionUnit: 0x0128,
    Software: 0x0131,
    DateTime: 0x0132,
    Artist: 0x013b,
    SubIFDs: 0x014a,
    JPEGInterchangeFormat: 0x0201,
    JPEGInterchangeFormatLength: 0x0202,
    Copyright: 0x8298,
    ExifIFDPointer: 0x8769,
    GPSInfoIFDPointer: 0x8825
};

export const EXIF_TAG = {
    ExposureTime: 0x829a,
    FNumber: 0x829d,
    ExposureProgram: 0x8822,
    PhotographicSensitivity: 0x8827,
    SensitivityType: 0x8830,
    RecommendedExposureIndex: 0x8832,
    ISOSpeed: 0x8833,
    ExifVersion: 0x9000,
    DateTimeOriginal: 0x9003,
    DateTimeDigitized: 0x9004,
    OffsetTime: 0x9010,
    OffsetTimeOriginal: 0x9011,
    OffsetTimeDigitized: 0x9012,
    ShutterSpeedValue: 0x9201,
    ApertureValue: 0x9202,
    BrightnessValue: 0x9203,
    ExposureBiasValue: 0x9204,
    MaxApertureValue: 0x9205,
    MeteringMode: 0x9207,
    LightSource: 0x9208,
    Flash: 0x9209,
    FocalLength: 0x920a,
    MakerNote: 0x927c,
    SubSecTime: 0x9290,
    SubSecTimeOriginal: 0x9291,
    SubSecTimeDigitized: 0x9292,
    FlashpixVersion: 0xa000,
    ColorSpace: 0xa001,
    PixelXDimension: 0xa002,
    PixelYDimension: 0xa003,
    InteroperabilityIFDPointer: 0xa005,
    FocalPlaneXResolution: 0xa20e,
    FocalPlaneYResolution: 0xa20f,
    FocalPlaneResolutionUnit: 0xa210,
    FileSource: 0xa300,
    SceneType: 0xa301,
    CustomRendered: 0xa401,
    ExposureMode: 0xa402,
    WhiteBalance: 0xa403,
    DigitalZoomRatio: 0xa404,
    FocalLengthIn35mmFilm: 0xa405,
    SceneCaptureType: 0xa406,
    Contrast: 0xa408,
    Saturation: 0xa409,
    Sharpness: 0xa40a,
    LensSpecification: 0xa432,
    LensMake: 0xa433,
    LensModel: 0xa434
};

export const GPS_TAG = {
    LatitudeRef: 1,
    Latitude: 2,
    LongitudeRef: 3,
    Longitude: 4,
    AltitudeRef: 5,
    Altitude: 6
};

const tiffTagNames = new Map(Object.entries(TIFF_TAG).map(([name, tag]) => [tag, name]));
export const TAG_NAMES = {
    [IFD.PRIMARY]: tiffTagNames,
    [IFD.THUMBNAIL]: tiffTagNames,
    [IFD.EXIF]: new Map(Object.entries(EXIF_TAG).map(([name, tag]) => [tag, name]))
};

const resolutionUnits = { 2: 'Inches', 3: 'Centimeters' };

/** SHORT型を1要素持つタグの列挙値。 */
export const SHORT_VALUES = {
    [IFD.PRIMARY]: {
        [TIFF_TAG.ResolutionUnit]: resolutionUnits
    },
    [IFD.THUMBNAIL]: {
        [TIFF_TAG.Compression]: { 1: 'Uncompressed', 6: 'JPEG' },
        [TIFF_TAG.ResolutionUnit]: resolutionUnits
    },
    [IFD.EXIF]: {
        [EXIF_TAG.ExposureProgram]: [
            'Undefined', 'Manual', 'Normal program', 'Aperture priority', 'Shutter priority',
            'Creative program', 'Action program', 'Portrait', 'Landscape'
        ],
        [EXIF_TAG.SensitivityType]: [
            'Unknown', 'SOS', 'REI', 'ISO speed', 'SOS + REI', 'SOS + ISO speed',
            'REI + ISO speed', 'SOS + REI + ISO speed'
        ],
        [EXIF_TAG.MeteringMode]: {
            0: 'Unknown', 1: 'Average', 2: 'Center-weighted average', 3: 'Spot',
            4: 'Multi-spot', 5: 'Pattern', 6: 'Partial', 255: 'Other'
        },
        [EXIF_TAG.LightSource]: {
            0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten', 4: 'Flash',
            9: 'Fine weather', 10: 'Cloudy', 11: 'Shade', 12: 'Daylight fluorescent',
            13: 'Day white fluorescent', 14: 'Cool white fluorescent', 15: 'White fluorescent',
            16: 'Warm white fluorescent', 17: 'Standard light A', 18: 'Standard light B',
            19: 'Standard light C', 20: 'D55', 21: 'D65', 22: 'D75', 23: 'D50',
            24: 'ISO studio tungsten', 255: 'Other'
        },
        [EXIF_TAG.ColorSpace]: { 1: 'sRGB', 65535: 'Uncalibrated' },
        [EXIF_TAG.FocalPlaneResolutionUnit]: resolutionUnits,
        [EXIF_TAG.CustomRendered]: ['Normal', 'Custom'],
        [EXIF_TAG.ExposureMode]: ['Auto exposure', 'Manual exposure', 'Auto bracket'],
        [EXIF_TAG.WhiteBalance]: ['Auto', 'Manual'],
        [EXIF_TAG.SceneCaptureType]: ['Standard', 'Landscape', 'Portrait', 'Night scene'],
        [EXIF_TAG.Contrast]: ['Normal', 'Soft', 'Hard'],
        [EXIF_TAG.Saturation]: ['Normal', 'Low', 'High'],
        [EXIF_TAG.Sharpness]: ['Normal', 'Soft', 'Hard']
    }
};

export const FLASH_BITS = {
    FIRED: 0x01,
    RETURN_SHIFT: 1,
    RESERVED_RETURN: 1,
    MODE_SHIFT: 3,
    FIELD_MASK: 0x03,
    NO_FUNCTION: 0x20,
    RED_EYE: 0x40,
    RESERVED_MASK: 0xff80
};
export const FLASH_MODES = [null, 'Forced on', 'Forced off', 'Auto'];
export const FLASH_RETURN = [null, null, 'Return light not detected', 'Return light detected'];
