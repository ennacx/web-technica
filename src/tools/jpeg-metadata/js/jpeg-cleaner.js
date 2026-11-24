import { parseJpeg } from './jpeg-parser.js';
import { inspectJpeg } from './exif-reader.js';
import { rebuildWithoutGps } from './gps-cleaner.js';

const REMOVE_KINDS = new Set(['Exif', 'XMP', 'Extended XMP', 'Photoshop / IPTC', 'Comment']);

export function orientationWarning(inspections){
    if(inspections.some(({ exif }) => exif?.fields.some(({ label, value }) => (label === 'Orientation' && value !== '1')))){
        return 'Removing Exif Orientation may rotate or mirror the displayed image.';
    }
    if(inspections.some(({ error, exif }) => (error || exif.issues.length))){
        return 'Some Exif data is malformed or ambiguous. Check the displayed image orientation after removing metadata.';
    }

    return '';
}

function safeLocationContainer(bytes, segment){
    const { kind, payload, end } = segment;

    if(!kind || kind === 'Exif'){
        return true;
    } else if(kind === 'JFIF'){
        return (
            end - payload === 14
            && bytes[payload + 12] === 0
            && bytes[payload + 13] === 0
        );
    } else if(kind === 'Adobe'){
        return (end - payload === 12);
    }

    return false;
}

const equalBytes = (left, right) => (left.length === right.length && left.every((byte, index) => (byte === right[index])));

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
        delta + replacement.length - (segment.end - segment.offset), 0);

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
    const originalSegments = before.segments.filter((segment) => !edited.has(segment));
    const outputSegments   = after.segments.filter(({ kind }) => !REMOVE_KINDS.has(kind));

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

        if(outputMetadata.length !== 1 || !inspection?.exif || inspection.exif.directories.has('GPS IFD')){
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
                    end - payload !== 14
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

export function cleanedFilename(name){
    return (name.replace(/\.jpe?g$/i, '') || 'image') + '-cleaned.jpg';
}
