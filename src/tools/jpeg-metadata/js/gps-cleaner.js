import { isRelocatableTag, readExif } from './exif-reader.js';

const PRIMARY      = 'IFD0';
const SUB_IFD      = 'Exif SubIFD';
const GPS          = 'GPS IFD';
const EXIF_POINTER = 0x8769;
const GPS_POINTER  = 0x8825;
const GPS_TYPES    = [1, 2, 5, 2, 5, 1, 5, 5, 2, 2, 2, 5, 2, 5, 2, 5, 2, 5, 2, 2, 5, 2, 5, 2, 5, 2, 5, 7, 7, 2, 3, 5];

export function rebuildWithoutGps(exif){
    const { directories, little, issues } = exif;
    const primary = directories.get(PRIMARY);
    const sub     = directories.get(SUB_IFD);

    if(issues.length){
        throw new Error(`Location-only cleanup cannot rewrite Exif with ${issues.join(', ')}.`);
    }

    if(directories.has('IFD1')){
        throw new Error('Location-only cleanup cannot preserve the Exif thumbnail directory.');
    }

    const retained = [
        [PRIMARY, [...primary.values()].filter(({ tag }) => (tag !== GPS_POINTER))],
        ...((sub) ? [[SUB_IFD, [...sub.values()]]] : [])
    ];

    for(const [name, entries] of retained){
        for(const entry of entries){
            if(name === PRIMARY && entry.tag === EXIF_POINTER){
                continue;
            }

            if(!isRelocatableTag(name, entry)){
                const tag = entry.tag.toString(16).padStart(4, '0');

                throw new Error(`Location-only cleanup cannot preserve ${name} tag 0x${tag}${(entry.tag === 0x927c) ? ' (MakerNote)' : ''}.`);
            }
        }
    }

    const gps = directories.get(GPS);

    if(!gps){
        return null;
    }

    if([...gps.values()].some(({ tag, type }) => (GPS_TYPES[tag] !== type))){
        throw new Error('Location-only cleanup cannot verify unfamiliar GPS tags or value types.');
    }

    const offsets = new Map();

    let size = 8;

    for(const [name, entries] of retained){
        offsets.set(name, size);
        size += 6 + 12 * entries.length;
    }

    let dataOffset = size;

    for(const [, entries] of retained){
        for(const { data } of entries){
            if(data.length > 4){
                size += data.length + data.length % 2;
            }
        }
    }

    if(size > 65527){
        throw new Error('Rebuilt Exif exceeds the JPEG APP1 size limit.');
    }

    const tiff = new Uint8Array(size);
    const view = new DataView(tiff.buffer);

    view.setUint16(0, little ? 0x4949 : 0x4d4d);
    view.setUint16(2, 42, little);
    view.setUint32(4, offsets.get(PRIMARY), little);

    for(const [name, entries] of retained){
        let offset = offsets.get(name);

        view.setUint16(offset, entries.length, little);
        offset += 2;

        for(const { tag, type, count, data } of entries.sort((a, b) => a.tag - b.tag)){
            view.setUint16(offset, tag, little);
            view.setUint16(offset + 2, type, little);
            view.setUint32(offset + 4, count, little);

            const field = offset + 8;

            if(name === PRIMARY && tag === EXIF_POINTER){
                view.setUint32(field, offsets.get(SUB_IFD), little);
            } else if(data.length <= 4){
                tiff.set(data, field);
            } else{
                view.setUint32(field, dataOffset, little);
                tiff.set(data, dataOffset);
                dataOffset += data.length + data.length % 2;
            }

            offset += 12;
        }
    }

    const rebuilt = readExif(tiff);

    if(rebuilt.directories.has(GPS) || rebuilt.issues.length) {
        throw new Error('Rebuilt Exif failed GPS removal verification.');
    }

    for(const [name, entries] of retained){
        const after = rebuilt.directories.get(name);

        if(after?.size !== entries.length){
            throw new Error('Rebuilt Exif failed directory verification.');
        }

        for(const entry of entries){
            if(name === PRIMARY && entry.tag === EXIF_POINTER) {
                continue;
            }

            const value = after.get(entry.tag);

            if(
                value?.type !== entry.type
                || value.count !== entry.count
                || value.data.some((byte, index) => (byte !== entry.data[index]))
            ){
                throw new Error('Rebuilt Exif failed non-GPS value verification.');
            }
        }
    }

    const segment = new Uint8Array(tiff.length + 10);

    segment.set([0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0]);

    new DataView(segment.buffer).setUint16(2, segment.length - 2);

    segment.set(tiff, 10);

    return segment;
}
