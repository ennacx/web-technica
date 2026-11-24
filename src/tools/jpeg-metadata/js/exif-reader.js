/**
 * TIFF / IFDを読み取るためのライブラリ
 *
 * CIPA DC-X008-2019 日本語版 §4.6.2〜4.6.6 (IFD構造・タグ・型), §4.7.2 (APP1)
 * @see https://www.cipa.jp/std/documents/j/DC-X008-2019-J.pdf
 * @see https://printtechnologies.org/standards/files/tiff-v6.pdf
 */

// TIFF型番号一覧
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

export const LITTLE_ENDIAN_BYTE_ORDER = 0x4949;
export const BIG_ENDIAN_BYTE_ORDER    = 0x4d4d;

/**
 * TYPE_BYTES のインデックスはTIFF型番号、値はその型に当てはまるバイト数
 * インデックス0の値は、不正な型番号を弾くための番兵値。
 *
 * ex. Idx.2 = ASCII(1 byte)、Idx.3 = SHORT(2 bytes)、Idx.4 = LONG(4 bytes)、Idx.5 = RATIONAL(8 bytes)
 *
 * @type {number[]}
 */
const TYPE_BYTES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];

/**
 * 外側のキーはIFD名、内側の数値キーはそのIFD内の16ビットのタグID。
 *
 * @type {{IFD0: Record<number, string>, "Exif SubIFD": Record<number, string>, "GPS IFD": Record<number, string>}}
 */
const DISPLAY_TAGS = {
    IFD0: {
        0x010f: 'Camera make',
        0x0110: 'Camera model',
        0x0112: 'Orientation',
        0x0131: 'Software',
        0x0132: 'DateTime',
        0x013b: 'Artist',
        0x8298: 'Copyright',
    },
    'Exif SubIFD': {
        0x829a: 'Exposure time',
        0x829d: 'F-number',
        0x8827: 'ISO',
        0x8833: 'ISO speed',
        0x9003: 'DateTimeOriginal',
        0x9004: 'DateTimeDigitized',
        0x920a: 'Focal length',
        0xa434: 'Lens model',
    },
    'GPS IFD': {
        1: 'Latitude reference',
        2: 'Latitude',
        3: 'Longitude reference',
        4: 'Longitude',
        5: 'Altitude reference',
        6: 'Altitude',
    }
};

// ASCII_TAGS と SCALAR_TYPES は、GPS削除の再構築で移設を許すタグと型の一覧
const ASCII_TAGS = {
    IFD0: new Set([0x010e, 0x010f, 0x0110, 0x0131, 0x0132, 0x013b, 0x8298]),
    'Exif SubIFD': new Set([0x9003, 0x9004, 0x9010, 0x9011, 0x9012, 0x9290, 0x9291, 0x9292, 0xa433, 0xa434])
};
const SCALAR_TYPES = {
    IFD0: {
        0x0112: [IFD_TYPE.SHORT],
        0x011a: [IFD_TYPE.RATIONAL],
        0x011b: [IFD_TYPE.RATIONAL],
        0x0128: [IFD_TYPE.SHORT]
    },
    'Exif SubIFD': {
        0x829a: [IFD_TYPE.RATIONAL],
        0x829d: [IFD_TYPE.RATIONAL],
        0x8822: [IFD_TYPE.SHORT],
        0x8827: [IFD_TYPE.SHORT], // PhotographicSensitivity。規格では複数値も許容するが、移設は単一値に限定する。
        0x8833: [IFD_TYPE.LONG],
        0x9201: [IFD_TYPE.SRATIONAL],
        0x9202: [IFD_TYPE.RATIONAL],
        0x9204: [IFD_TYPE.SRATIONAL],
        0x9207: [IFD_TYPE.SHORT],
        0x9209: [IFD_TYPE.SHORT],
        0x920a: [IFD_TYPE.RATIONAL],
        0xa001: [IFD_TYPE.SHORT],
        0xa002: [IFD_TYPE.SHORT, IFD_TYPE.LONG],
        0xa003: [IFD_TYPE.SHORT, IFD_TYPE.LONG]
    }
};

export function isRelocatableTag(directory, { tag, type, count }){
    if(ASCII_TAGS[directory]?.has(tag)){
        return (type === IFD_TYPE.ASCII);
    }

    if(directory === 'Exif SubIFD' && (tag === 0x9000 || tag === 0xa000)){
        return (type === IFD_TYPE.UNDEFINED && count === 4);
    }

    return (count === 1 && Boolean(SCALAR_TYPES[directory]?.[tag]?.includes(type)));
}

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

export function readExif(tiff){
    const view        = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const order       = tiff[0] * 256 + tiff[1];
    // TIFFの先頭2バイトで "II" (リトルエンディアン) "MM" (ビッグエンディアン) を判定
    const little      = (order === LITTLE_ENDIAN_BYTE_ORDER);
    const ranges      = [{ start: 0, end: 8 }];
    const directories = new Map();
    const offsets     = new Set();
    const issues      = new Set();

    let tagCount = 0;

    function check(start, size){
        if(start < 8 || start + size > tiff.length){
            throw new Error('Exif offset or value is outside the TIFF payload.');
        }
    }

    function claim(start, size){
        check(start, size);

        const end = start + size;

        if(ranges.some((range) => range.start < end && start < range.end)){
            issues.add('overlapping TIFF ranges');
        }

        ranges.push({ start, end });
    }

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

        claim(offset, 6 + count * 12);

        const entries = new Map();

        for(let i = 0; i < count; i++){
            const start    = offset + 2 + i * 12;
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
            const dataStart  = (size <= 4) ? valueField : view.getUint32(valueField, little);

            if(size > 4){
                claim(dataStart, size);
            } else if(tiff.subarray(valueField + size, valueField + 4).some(Boolean)){
                issues.add('nonzero TIFF value padding');
            }

            entries.set(tag, { tag, type, count: elements, data: tiff.subarray(dataStart, dataStart + size) });
        }

        const next = view.getUint32(offset + 2 + count * 12, little);

        if(next && offsets.has(next)){
            throw new Error('Repeated or circular Exif directory offset.');
        }

        directories.set(name, entries);

        return next;
    }

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

    // 8バイトのTIFFヘッダ。位置2に固定値42（0x002a）、位置4に最初のIFDへのオフセット。
    // IFDや外部値へのオフセットはTIFFヘッダ先頭からの相対バイト位置。
    if(tiff.length < 8 || (!little && order !== 0x4d4d) || view.getUint16(2, little) !== 42){
        throw new Error('Invalid Exif TIFF header.');
    }

    const ifd1    = readDirectory('IFD0', view.getUint32(4, little));
    const primary = directories.get('IFD0');

    for(const [name, offset] of [
        ['Exif SubIFD', pointer(primary, 0x8769)], // ExifIFDPointer
        ['GPS IFD', pointer(primary, 0x8825)],     // GPSInfoIFDPointer
        ['IFD1', ifd1 || null]
    ]){
        if(offset !== null && readDirectory(name, offset)){
            throw new Error('Additional Exif directory chains are unsupported.');
        }
    }

    const thumbnail = directories.get('IFD1');
    if(thumbnail){
        const start = pointer(thumbnail, 0x0201); // JPEGInterchangeFormat (TIFF先頭からの位置)
        const size  = pointer(thumbnail, 0x0202); // JPEGInterchangeFormatLength (バイト数)

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
                fields.push({source, label, value: decode(entry, little)});
            } else{
                otherTags.push({source, tag: entry.tag});
            }
        }
    }

    return { little, directories, fields, otherTags, issues: [...issues] };
}

export function inspectJpeg(bytes, jpeg){
    return jpeg.segments.filter(({ kind }) => kind === 'Exif').map((segment) => {
        try{
            return { segment, exif: readExif(bytes.subarray(segment.payload + 6, segment.end)) };
        } catch(error){
            return { segment, error: error.message };
        }
    });
}
