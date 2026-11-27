import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILE_BYTES, parseJpeg } from '../src/tools/jpeg-metadata/js/jpeg-parser.js';
import { EXIF_TAG, IFD, IFD_TYPE, TAG_NAMES } from '../src/tools/jpeg-metadata/js/exif-constants.js';
import { createExifDisplayModel, getExifThumbnail, inspectJpeg } from '../src/tools/jpeg-metadata/js/exif-inspector.js';
import { decode } from '../src/tools/jpeg-metadata/js/exif-decoder.js';
import { previewExifEntry } from '../src/tools/jpeg-metadata/js/exif-formatter.js';
import { readExif } from '../src/tools/jpeg-metadata/js/exif-reader.js';
import { cleanedFilename, cleanJpeg } from '../src/tools/jpeg-metadata/js/jpeg-cleaner.js';

const ascii = (value) => Buffer.from(value, 'ascii');
const marker = (id, data) => {
    const length = data.length + 2;
    return Buffer.concat([Buffer.from([255, id, length >> 8, length & 255]), Buffer.from(data)]);
};
const jfif = marker(0xe0, Buffer.concat([ascii('JFIF\0'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
const scan = Buffer.concat([marker(0xda, [1, 1, 0, 0, 63, 0]), Buffer.from([7, 255, 0, 42, 255, 208, 8])]);
const xmp = marker(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:City>Fixture City</x:City>'));
const iptc = marker(0xed, ascii('Photoshop 3.0\0Fixture City'));
const icc = marker(0xe2, ascii('ICC_PROFILE\0\x01\x01fixture'));
const adobe = marker(0xee, ascii('Adobe\0\x64\0\0\0\0\0'));
const comment = marker(0xfe, ascii('Fixture comment'));

function jpeg(segments = [], progressive = false){
    const frame = marker(progressive ? 0xc2 : 0xc0, [8, 0, 12, 0, 20, 1, 1, 0x11, 0]);
    return Buffer.concat([Buffer.from([255, 216]), jfif, ...segments, frame, scan,
        ...(progressive ? [scan] : []), Buffer.from([255, 217])]);
}

function exifFixture(little, { gps = true, extraTag = 0, orientation = 6, displayValues } = {}){
    const tiff = Buffer.alloc(displayValues ? 280 : 200);
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.length);
    const u16 = (i, n) => view.setUint16(i, n, little);
    const u32 = (i, n) => view.setUint32(i, n, little);
    const entry = (offset, tag, type, count, value) => {
        u16(offset, tag);
        u16(offset + 2, type);
        u32(offset + 4, count);
        if(type === 3) u16(offset + 8, value);
        else u32(offset + 8, value);
    };
    tiff.write(little ? 'II' : 'MM');
    u16(2, 42);
    u32(4, 8);
    u16(8, gps ? 4 : 3);
    entry(10, 0x010f, 2, 15, 140);
    entry(22, 0x0112, 3, 1, orientation);
    entry(34, 0x8769, 4, 1, 64);
    if(gps) entry(46, 0x8825, 4, 1, 96);
    u16(64, extraTag ? 2 : 1);
    entry(66, 0x829a, 5, 1, 156);
    if(extraTag) entry(78, extraTag, 4, 1, 2);
    tiff.write('<img src=x>Cam\0', 140);
    u32(156, 1);
    u32(160, 125);
    if(gps){
        u16(96, 2);
        entry(98, 1, 2, 2, 0);
        tiff[106] = 78;
        entry(110, 2, 5, 3, 168);
        [37, 1, 14, 1, 72345, 1000].forEach((value, i) => u32(168 + i * 4, value));
    }
    if(displayValues){
        const { date, denominator = 10, equivalent = 50 } = displayValues;
        entry(34, 0x8769, 4, 1, 200);
        tiff.fill(0, 64, 96);
        u16(200, 4);
        entry(202, 0x829a, 5, 1, 156);
        entry(214, 0x9003, 2, 20, 254);
        entry(226, 0x920a, 5, 1, 192);
        entry(238, 0xa405, 3, 1, equivalent);
        tiff.write(date, 254);
        u32(192, 350);
        u32(196, denominator);
    }
    return tiff;
}

const app1 = (tiff) => marker(0xe1, Buffer.concat([ascii('Exif\0\0'), tiff]));
const inspect = (bytes) => inspectJpeg(bytes, parseJpeg(bytes));
const scanBytes = (bytes) => parseJpeg(bytes).scans.map(({ offset, end }) => Buffer.from(bytes.subarray(offset, end)));

function exifWithInteroperability(little){
    const tiff = Buffer.concat([exifFixture(little, { extraTag: 0xa005, orientation: 1 }), Buffer.alloc(30)]);
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    view.setUint32(86, 200, little);
    view.setUint16(200, 2, little);
    view.setUint16(202, 1, little);
    view.setUint16(204, 2, little);
    view.setUint32(206, 4, little);
    tiff.write('R98\0', 210);
    view.setUint16(214, 2, little);
    view.setUint16(216, 7, little);
    view.setUint32(218, 4, little);
    tiff.write('0100', 222);
    return tiff;
}

test('follows the Interoperability IFD pointer and accounts for its 30-byte range', () => {
    for(const little of [true, false]){
        const tiff = exifWithInteroperability(little);
        const exif = readExif(tiff);
        assert.deepEqual(exif.issues, []);
        const entries = exif.directories.get(IFD.INTEROPERABILITY);
        const names = TAG_NAMES[IFD.INTEROPERABILITY];
        assert.equal(names.get(1), 'InteroperabilityIndex');
        assert.equal(names.get(2), 'InteroperabilityVersion');
        assert.equal(previewExifEntry(entries.get(1), little, IFD.INTEROPERABILITY).value, 'R98');
        assert.deepEqual(previewExifEntry(entries.get(2), little, IFD.INTEROPERABILITY), {
            typeName: 'UNDEFINED', value: '30 31 30 30 │ 0100'
        });
        const input = jpeg([app1(tiff)]);
        assert.equal(cleanJpeg(input, 'metadata').warning, '');
        assert.throws(() => cleanJpeg(input, 'location'), /0xa005/);

        const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
        view.setUint32(86, tiff.length, little);
        assert.throws(() => readExif(tiff), /outside/);
        view.setUint32(86, 64, little);
        assert.throws(() => readExif(tiff), /circular/);
        view.setUint32(86, 200, little);
        view.setUint16(80, 3, little);
        assert.throws(() => readExif(tiff), /directory pointer/);
    }
});

test('distinguishes rotation and reflection from invalid Exif Orientation', () => {
    const warning = (tiff) => cleanJpeg(jpeg([app1(tiff)]), 'metadata').warning;
    const cases = [
        [1, 'Normal'], [2, 'Mirror horizontal'], [3, 'Rotate 180°'], [4, 'Mirror vertical'],
        [5, 'Transpose'], [6, 'Rotate 90° CW'], [7, 'Transverse'], [8, 'Rotate 270° CW'],
        [0, '0'], [9, '9']
    ];
    for(const [orientation, expected] of cases){
        const exif = readExif(exifFixture(true, { orientation }));
        const { fields } = createExifDisplayModel(exif);
        assert.equal(fields.find(({ label }) => label === 'Orientation').value, expected);
        const message = warning(exifFixture(false, { orientation }));
        if(orientation === 1) assert.equal(message, '');
        else if(orientation >= 2 && orientation <= 8) assert.match(message, /rotate or mirror/);
        else assert.match(message, /malformed or ambiguous/);
    }
    const wrongType = exifFixture(true, { orientation: 1 });
    wrongType.writeUInt16LE(4, 24);
    assert.match(warning(wrongType), /malformed or ambiguous/);
});

function exifWithThumbnail(thumbnail){
    const tiff = Buffer.concat([exifFixture(true), Buffer.alloc(30), thumbnail]);
    tiff.writeUInt32LE(200, 58);
    tiff.writeUInt16LE(2, 200);
    tiff.writeUInt16LE(0x0201, 202);
    tiff.writeUInt16LE(4, 204);
    tiff.writeUInt32LE(1, 206);
    tiff.writeUInt32LE(230, 210);
    tiff.writeUInt16LE(0x0202, 214);
    tiff.writeUInt16LE(4, 216);
    tiff.writeUInt32LE(1, 218);
    tiff.writeUInt32LE(thumbnail.length, 222);
    return tiff;
}

test('selects a bounded Exif JPEG thumbnail and ignores invalid or missing candidates', () => {
    const thumbnail = jpeg();
    const malformed = exifWithThumbnail(Buffer.alloc(thumbnail.length));
    const outside = exifWithThumbnail(thumbnail);
    outside.writeUInt32LE(9999, 210);
    const invalidOnly = jpeg([app1(malformed), app1(outside)]);
    assert.equal(getExifThumbnail(inspect(invalidOnly)), null);

    const input = jpeg([app1(malformed), app1(exifWithThumbnail(thumbnail))]);
    const candidate = getExifThumbnail(inspect(input));
    assert.deepEqual(candidate, thumbnail);
    assert.equal(candidate.buffer, input.buffer);
});

test('maps standard shooting tags by directory and type and preserves unknown numeric values', () => {
    const tiff = Buffer.concat([exifFixture(false), Buffer.alloc(160)]);
    tiff.fill(0, 64, 96);
    tiff.writeUInt32BE(200, 42);
    const shorts = [
        [0x8822, 3], [0x9207, 255], [0x9209, 0x5f], [0xa402, 2], [0xa403, 99], [0xa001, 1]
    ];
    tiff.writeUInt16BE(shorts.length + 1, 200);
    shorts.forEach(([tag, value], index) => {
        const offset = 202 + 12 * index;
        tiff.writeUInt16BE(tag, offset);
        tiff.writeUInt16BE(3, offset + 2);
        tiff.writeUInt32BE(1, offset + 4);
        tiff.writeUInt16BE(value, offset + 8);
    });
    tiff.writeUInt16BE(0xa432, 274);
    tiff.writeUInt16BE(5, 276);
    tiff.writeUInt32BE(4, 278);
    tiff.writeUInt32BE(302, 282);
    [16, 1, 55, 1, 28, 10, 28, 10].forEach((value, i) => tiff.writeUInt32BE(value, 302 + 4 * i));

    const exif = readExif(tiff);
    assert.equal(Object.hasOwn(exif, 'fields'), false);
    assert.equal(Object.hasOwn(exif, 'otherTags'), false);
    const number = new Intl.NumberFormat();
    assert.deepEqual(createExifDisplayModel(exif).fields.filter(({ source }) => source === IFD.EXIF).map(({ value }) => value), [
        'Aperture priority', 'Other', 'Fired · Auto · Return light detected · Red-eye reduction',
        'Auto bracket', '99', `${number.format(16)}–${number.format(55)} mm, f/${number.format(2.8)}`
    ]);
    const colorSpace = exif.directories.get(IFD.EXIF).get(EXIF_TAG.ColorSpace);
    assert.equal(previewExifEntry(colorSpace, false, IFD.EXIF).value, 'sRGB');
    assert.equal(previewExifEntry(colorSpace, false, IFD.PRIMARY).value, '1');
    assert.equal(previewExifEntry({ ...colorSpace, type: IFD_TYPE.BYTE, data: Uint8Array.of(1) }, false, IFD.EXIF).value, '1');

    tiff.writeUInt16BE(0x80, 234);
    assert.equal(createExifDisplayModel(readExif(tiff)).fields.find(({ label }) => label === 'Flash').value, '128');
});

test('displays standard Exif exposure compensation as signed EV', () => {
    const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, signDisplay: 'exceptZero' });

    for(const little of [true, false]){
        const tiff = exifFixture(little);
        const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
        view.setUint16(66, 0x9204, little);
        view.setUint16(68, 10, little);

        for(const [numerator, denominator] of [[-2, 3], [1, 1], [0, 1], [1, 0]]){
            view.setInt32(156, numerator, little);
            view.setInt32(160, denominator, little);
            const exif = readExif(tiff);
            const { fields, otherTags } = createExifDisplayModel(exif);
            const entry = exif.directories.get(IFD.EXIF).get(EXIF_TAG.ExposureBiasValue);
            assert.deepEqual(decode(entry, little), {
                kind: 'numeric', values: [{ numerator, denominator }], truncated: false
            });
            assert.equal(fields.find(({ label }) => label === 'Exposure compensation').value,
                denominator ? `${formatter.format(numerator / denominator)} EV` : '1/0');
            assert.equal(otherTags.some(({ tag }) => tag === 0x9204), false);
        }

        view.setUint16(66, 0x829d, little);
        view.setUint16(68, 5, little);
        view.setUint32(156, 28, little);
        view.setUint32(160, 10, little);
        const aperture = new Intl.NumberFormat().format(2.8);
        assert.equal(createExifDisplayModel(readExif(tiff)).fields.find(({ label }) => label === 'F-number').value, `f/${aperture}`);
    }
});

test('previews unlabelled Exif values with TIFF-relative offsets and bounded binary output', () => {
    const tiff = Buffer.concat([exifFixture(false, { extraTag: 0x927c }), Buffer.alloc(33)]);
    tiff.writeUInt16BE(7, 80);
    tiff.writeUInt32BE(33, 82);
    tiff.writeUInt32BE(200, 86);
    tiff.set([0x41, 0x42, 0x00, 0xff], 200);
    tiff[232] = 0x5a;

    const { directories, little } = readExif(tiff);
    const makerNote = directories.get('Exif SubIFD').get(0x927c);
    assert.equal(makerNote.dataOffset, 200);
    assert.equal(makerNote.data.length, 33);
    assert.deepEqual(previewExifEntry(makerNote, little), {
        typeName: 'UNDEFINED',
        value: `41 42 00 FF${' 00'.repeat(28)} │ AB${'.'.repeat(30)} …`
    });
    const inline = directories.get('IFD0').get(0x0112);
    assert.equal(inline.dataOffset, 30);
    assert.deepEqual(previewExifEntry(inline, little), { typeName: 'SHORT', value: '6' });
});

test('reads unsigned TIFF IFD values in both byte orders and bounds their numeric preview', () => {
    const offsets = [0x80000000, 0xffffffff, ...Array.from({ length: 11 }, (_, i) => 200 + i * 4)];
    for(const little of [true, false]){
        const tiff = Buffer.concat([exifFixture(little, { extraTag: 0xcafe }), Buffer.alloc(offsets.length * 4)]);
        const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
        view.setUint16(80, 13, little);
        view.setUint32(82, offsets.length, little);
        view.setUint32(86, 200, little);
        offsets.forEach((offset, i) => view.setUint32(200 + i * 4, offset, little));

        const exif = readExif(tiff);
        const entry = exif.directories.get(IFD.EXIF).get(0xcafe);
        assert.deepEqual(exif.issues, []);
        assert.equal(entry.dataOffset, 200);
        assert.deepEqual(decode(entry, little), { kind: 'numeric', values: offsets, truncated: false });
        assert.deepEqual(previewExifEntry(entry, little, IFD.EXIF), {
            typeName: 'IFD', value: `${offsets.slice(0, 12).join(', ')}, …`
        });
        assert.throws(() => cleanJpeg(jpeg([app1(tiff)]), 'location'), /0xcafe/i);
    }
});

test('bounds long Exif text previews and marks omitted bytes', () => {
    const prefix = 'A'.repeat(512);
    const tiff = Buffer.concat([exifFixture(true), ascii(`${prefix}omitted\0`)]);
    tiff.fill(0, 140, 155);
    tiff.writeUInt32LE(tiff.length - 200, 14);
    tiff.writeUInt32LE(200, 18);

    const { fields } = createExifDisplayModel(readExif(tiff));
    assert.equal(fields.find(({ label }) => label === 'Camera make').value, `${prefix}…`);
});

test('formats Exif date and focal lengths and preserves the equivalent focal length during GPS cleanup', () => {
    const date = '2025:03:09 02:30:06';
    const expectedDate = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC'
    }).format(new Date('2025-03-09T02:30:06Z'));
    const fields = (exif) => Object.fromEntries(createExifDisplayModel(exif).fields.map(({ label, value }) => [label, value]));
    for(const little of [true, false]){
        const tiff = exifFixture(little, { displayValues: { date } });
        const values = fields(readExif(tiff));
        assert.equal(values.DateTimeOriginal, expectedDate);
        assert.equal(values['Focal length'], `${new Intl.NumberFormat().format(35)} mm`);
        assert.equal(values['35 mm equivalent focal length'], `${new Intl.NumberFormat().format(50)} mm`);

        const { bytes } = cleanJpeg(jpeg([app1(tiff)]), 'location');
        assert.equal(fields(inspect(bytes)[0].exif)['35 mm equivalent focal length'], values['35 mm equivalent focal length']);
    }

    const invalid = '2025:02:30 14:05:06';
    const values = fields(readExif(exifFixture(true, { displayValues: { date: invalid, denominator: 0, equivalent: 0 } })));
    assert.equal(values.DateTimeOriginal, invalid);
    assert.equal(values['Focal length'], '350/0');
    assert.equal(values['35 mm equivalent focal length'], 'Unknown');
});

for(const little of [true, false]){
    test(`reads and physically removes GPS bytes in ${little ? 'II' : 'MM'} Exif`, () => {
        const tiff = exifFixture(little);
        const input = jpeg([app1(tiff), adobe], true);
        const source = Buffer.from(input);
        const [{ exif }] = inspect(input);
        const { fields } = createExifDisplayModel(exif);
        assert.deepEqual(fields.map(({ value }) => value), ['<img src=x>Cam', 'Rotate 90° CW', '1/125', 'N', '37/1, 14/1, 72345/1000']);
        const { bytes, removed, retained, warning } = cleanJpeg(input, 'location');
        const [after] = inspect(bytes);
        assert.equal(after.exif.little, little);
        assert.equal(after.exif.directories.has('GPS IFD'), false);
        assert.deepEqual(createExifDisplayModel(after.exif).fields, fields.filter(({ source }) => source !== IFD.GPS));
        assert.equal(Buffer.from(bytes).includes(tiff.subarray(168, 192)), false);
        assert.deepEqual(scanBytes(bytes), scanBytes(input));
        assert.deepEqual(input, source);
        assert.deepEqual([...removed], [['Exif GPS IFD', 1]]);
        assert.deepEqual(retained, ['JFIF', 'Exif', 'Adobe']);
        assert.equal(warning, '');
    });
}

test('normal cleanup removes all targeted segments and retains exact ICC, JFIF and Adobe bytes', () => {
    const extended = marker(0xe1, ascii('http://ns.adobe.com/xmp/extension/\0fixture'));
    const secondIcc = marker(0xe2, ascii('ICC_PROFILE\0\x02\x02more'));
    const input = jpeg([app1(exifFixture(true)), xmp, iptc, extended, icc, secondIcc, adobe, comment,
        app1(exifFixture(false, { gps: false }))], true);
    const cleaned = cleanJpeg(input, 'metadata');
    assert.deepEqual(Buffer.from(cleaned.bytes), jpeg([icc, secondIcc, adobe], true));
    assert.match(cleaned.warning, /rotate or mirror/);
    assert.deepEqual([...cleaned.removed], [['Exif', 2], ['XMP', 1], ['Photoshop / IPTC', 1], ['Extended XMP', 1], ['Comment', 1]]);
    assert.deepEqual(cleaned.retained, ['JFIF', 'ICC profile', 'Adobe']);
    assert.equal(parseJpeg(cleaned.bytes).width, 20);
    assert.equal(parseJpeg(cleaned.bytes).height, 12);
});

test('no matching metadata yields no new file and filenames preserve the base name', () => {
    assert.equal(cleanJpeg(jpeg(), 'metadata').bytes, null);
    assert.equal(cleanJpeg(jpeg(), 'location').bytes, null);
    assert.equal(cleanJpeg(jpeg([app1(exifFixture(true, { gps: false }))]), 'location').bytes, null);
    assert.equal(cleanedFilename('photo.JPEG'), 'photo-cleaned.jpg');
    assert.equal(cleanedFilename('.jpg'), 'image-cleaned.jpg');
});

test('location cleanup refuses opaque metadata without falling back to general removal', () => {
    const gps = app1(exifFixture(true));
    for(const [segment, reason] of [[xmp, /XMP/], [iptc, /IPTC/], [icc, /ICC/], [comment, /Comment/], [gps, /one Exif/],
        [marker(0xe0, ascii('JFXX\0')), /JFIF extension/]]){
        assert.throws(() => cleanJpeg(jpeg([gps, segment]), 'location'), reason);
    }
    const makerNote = jpeg([app1(exifFixture(true, { extraTag: 0x927c }))]);
    assert.throws(() => cleanJpeg(makerNote, 'location'), /MakerNote/);
    assert.ok(cleanJpeg(makerNote, 'metadata').bytes);
});

test('unsupported JPEG containers are inspectable and refuse both cleanup modes', () => {
    const inputs = [jpeg([marker(0xe2, ascii('MPF\0'))]), jpeg([marker(0xeb, ascii('JP'))]),
        jpeg([marker(0xe3, ascii('unknown'))]), Buffer.concat([jpeg(), ascii('trailer')])];
    for(const input of inputs){
        assert.ok(parseJpeg(input).restrictions.length);
        for(const mode of ['metadata', 'location']) assert.throws(() => cleanJpeg(input, mode), /unavailable/);
    }
});

test('rejects malformed JPEG marker structure and oversized data', () => {
    const inputs = [Buffer.alloc(0), ascii('not a JPEG'), jpeg().subarray(0, -2),
        Buffer.from([255, 216, 255, 225, 0, 1]), Buffer.from([255, 216, 255, 217]),
        Buffer.from([255, 216, 255, 225, 255, 255])];
    for(const input of inputs) assert.throws(() => parseJpeg(input));
    assert.throws(() => parseJpeg(new Uint8Array(MAX_FILE_BYTES + 1)), /32 MiB/);
});

test('Exif offset, cycle, duplicate, count and alias checks protect location-only output', () => {
    const corruptions = [
        [(tiff) => tiff.writeUInt32LE(9999, 4), /outside/],
        [(tiff) => tiff.writeUInt32LE(8, 58), /circular/],
        [(tiff) => tiff.writeUInt32LE(64, 54), /circular/],
        [(tiff) => tiff.writeUInt16LE(513, 8), /Too many/],
        [(tiff) => tiff.writeUInt16LE(0x010f, 22), /Duplicate/],
        [(tiff) => tiff.writeUInt32LE(0xffffffff, 14), /outside/],
        [(tiff) => tiff.write('ZZ'), /header/]
    ];
    for(const [corrupt, reason] of corruptions){
        const tiff = exifFixture(true);
        corrupt(tiff);
        assert.throws(() => readExif(tiff), reason);
        const input = jpeg([app1(tiff)]);
        assert.match(inspect(input)[0].error, reason);
        assert.throws(() => cleanJpeg(input, 'location'), /valid Exif/);
        assert.match(cleanJpeg(input, 'metadata').warning, /orientation/i);
    }
    const alias = exifFixture(true);
    alias.writeUInt32LE(168, 18);
    assert.throws(() => cleanJpeg(jpeg([app1(alias)]), 'location'), /overlapping TIFF ranges/);
    const orphan = exifFixture(true);
    orphan[62] = 1;
    orphan[199] = 42;
    assert.deepEqual(readExif(orphan).issueRanges, [
        { issue: 'unreferenced TIFF data', start: 62, end: 64 },
        { issue: 'unreferenced TIFF data', start: 192, end: 200 }
    ]);
    assert.throws(() => cleanJpeg(jpeg([app1(orphan)]), 'location'), /unreferenced TIFF data/);
});

test('reports every TIFF range overlapped by one value and refuses location-only cleanup', () => {
    const issue = 'overlapping TIFF ranges';
    for(const little of [true, false]){
        const tiff = exifFixture(little);
        const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
        // Point the GPS latitude across the camera make and exposure time ranges.
        view.setUint32(118, 148, little);
        tiff.fill(0, 168, 192);

        const exif = readExif(tiff);
        assert.deepEqual(exif.issues, [issue]);
        assert.deepEqual(exif.issueRanges, [
            { issue, start: 148, end: 155 },
            { issue, start: 156, end: 164 }
        ]);
        assert.throws(() => cleanJpeg(jpeg([app1(tiff)]), 'location'), /overlapping TIFF ranges/);
    }
});

test('UI keeps hostile text literal, downloads a verified Blob, and ignores stale file reads', async () => {
    await import('./helpers/register-utils.js');
    const { readFileSync } = await import('node:fs');
    const template = readFileSync('src/tools/jpeg-metadata/index.njk', 'utf8');
    class Element {
        children = [];
        listeners = {};
        textContent = '';
        append(...nodes){ this.children.push(...nodes); }
        replaceChildren(...nodes){ this.children = nodes; }
        addEventListener(name, callback){ this.listeners[name] = callback; }
        fire(name){ return this.listeners[name](); }
        remove(){}
        removeAttribute(name){ delete this[name]; }
    }
    const nodes = new Map([...template.matchAll(/id="jpeg-([^"]+)"/g)].map(([, id]) => [id, new Element()]));
    const get = (id) => nodes.get(id);
    const selected = { value: 'metadata' };
    const preview = get('preview');
    preview.decode = async () => {};
    get('options').querySelector = () => selected;
    let downloaded;
    let blob;
    let urlCount = 0;
    const revoked = [];
    const document = {
        getElementById: (id) => get(id.slice(5)),
        createDocumentFragment: () => new Element(),
        createElement(tag){
            const element = new Element();
            if(tag === 'a') element.click = () => { downloaded = element.download; };
            return element;
        },
        body: new Element(),
        defaultView: { HTMLElement: Element,
            URL: { createObjectURL(value){ blob = value; return `blob:fixture-${++urlCount}`; },
                revokeObjectURL(url){ revoked.push(url); } },
            setTimeout(callback){ callback(); } }
    };
    globalThis.document = document;
    try{
        await import('../src/tools/jpeg-metadata/js/index.js');
        const file = get('file');
        const input = jpeg([app1(exifFixture(true)), xmp]);
        file.files = [new File([input], 'fixture.JPEG')];
        await file.fire('change');
        assert.equal(preview.hidden, false);
        assert.equal(blob.type, 'image/jpeg');
        assert.deepEqual(Buffer.from(await blob.arrayBuffer()), input);
        const originalPreview = preview.src;
        assert.equal(get('file-details').hidden, false);
        assert.equal(get('structure').hidden, false);
        assert.equal(get('segments').open, true);
        assert.equal(get('issues').hidden, true);
        assert.equal(get('segment-rows').children[0].children[0].children[0].textContent, 'SOI');
        assert.equal(get('inspect').hidden, false);
        assert.ok(get('exif-fields').children.some((entry) => entry.textContent === '<img src=x>Cam'));
        const pointer = get('tag-list').children.find((entry) => entry.children[0].textContent === '0x8769 · IFD0 · ExifIFDPointer');
        assert.deepEqual(pointer.children[1].children.map((entry) => entry.textContent), [
            'Type and size', 'LONG × 1 · 4 B',
            'JPEG APP1 offset', String(parseJpeg(input).segments.find(({ kind }) => kind === 'Exif').offset),
            'TIFF value offset', '42',
            'Value', '64'
        ]);
        assert.match(get('orientation').textContent, /rotate or mirror/);
        await get('clean').fire('click');
        assert.equal(get('download').hidden, false);
        get('download').fire('click');
        assert.equal(downloaded, 'fixture-cleaned.jpg');
        assert.equal(blob.type, 'image/jpeg');
        assert.deepEqual(Buffer.from(await blob.arrayBuffer()), jpeg());

        selected.value = 'location';
        get('options').fire('change');
        assert.equal(get('download').hidden, true);
        await get('clean').fire('click');
        assert.match(get('clean-status').textContent, /Cleanup stopped.*XMP/);
        assert.equal(get('download').hidden, true);

        const orphan = exifFixture(true);
        orphan[199] = 42;
        const restricted = jpeg([app1(orphan), marker(0xe2, ascii('MPF\0'))]);
        file.files = [new File([restricted], 'restricted.jpg')];
        await file.fire('change');
        assert.equal(get('issues').hidden, false);
        assert.match(get('issue-list').children[0].textContent, /Cleanup unavailable.*MPF/);
        assert.match(get('issue-list').children[1].textContent, /unreferenced TIFF data at TIFF offset 192 \(8 B\)/);
        assert.equal(get('clean').disabled, true);

        const delayed = Promise.withResolvers();
        file.files = [{ name: 'old.jpg', size: input.length, arrayBuffer: () => delayed.promise }];
        const old = file.fire('change');
        assert.equal(preview.hidden, true);
        assert.equal(get('structure').hidden, true);
        assert.ok(revoked.includes(originalPreview));
        file.files = [new File([jpeg()], 'new.jpg')];
        await file.fire('change');
        delayed.resolve(Uint8Array.from(input).buffer);
        await old;
        assert.equal(get('file-info').children[1].textContent, 'new.jpg');
        assert.equal(get('issues').hidden, true);
        assert.deepEqual(get('issue-list').children, []);
        assert.match(get('exif-summary').textContent, /No Exif segments/);
        await get('clean').fire('click');
        assert.match(get('clean-status').textContent, /No matching metadata/);

        const embedded = jpeg();
        const withThumbnail = jpeg([app1(exifWithThumbnail(embedded))]);
        file.files = [new File([withThumbnail], 'embedded.jpg')];
        await file.fire('change');
        assert.equal(preview.hidden, false);
        assert.equal(preview.alt, 'Embedded Exif thumbnail');
        assert.deepEqual(Buffer.from(await blob.arrayBuffer()), embedded);

        const attempts = [];
        preview.decode = async () => {
            attempts.push(preview.src);
            if(attempts.length === 1){
                throw new Error('invalid embedded JPEG');
            }
        };
        await file.fire('change');
        await Promise.resolve();
        assert.equal(attempts.length, 2);
        assert.ok(revoked.includes(attempts[0]));
        assert.equal(preview.alt, 'Preview of the selected JPEG');
        assert.deepEqual(Buffer.from(await blob.arrayBuffer()), withThumbnail);

        const staleThumbnail = Promise.withResolvers();
        preview.decode = () => staleThumbnail.promise;
        await file.fire('change');
        const staleUrl = preview.src;
        preview.decode = async () => {};
        file.files = [new File([jpeg()], 'current.jpg')];
        await file.fire('change');
        const currentUrl = preview.src;
        const currentCount = urlCount;
        staleThumbnail.reject(new Error('stale thumbnail failed'));
        await staleThumbnail.promise.catch(() => {});
        assert.ok(revoked.includes(staleUrl));
        assert.equal(urlCount, currentCount);
        assert.equal(preview.src, currentUrl);
        assert.equal(preview.hidden, false);

        const slowDecode = Promise.withResolvers();
        preview.decode = () => slowDecode.promise;
        file.files = [new File([jpeg()], 'slow.jpg')];
        await file.fire('change');
        const slowPreview = preview.src;
        assert.equal(preview.hidden, true);
        preview.decode = async () => { throw new Error('decode failed'); };
        file.files = [new File([jpeg()], 'unrenderable.jpg')];
        await file.fire('change');
        slowDecode.resolve();
        await slowDecode.promise;
        assert.ok(revoked.includes(slowPreview));
        assert.equal(preview.src, undefined);
        assert.equal(preview.hidden, true);
        assert.equal(get('inspect').hidden, false);

        file.files = [{ name: 'failed.jpg', size: 20, async arrayBuffer(){ throw new Error('read failed'); } }];
        await file.fire('change');
        assert.match(get('file-status').textContent, /could not be read/);
        assert.equal(get('inspect').hidden, true);
        assert.equal(get('download').hidden, true);

        file.files = [{ name: 'oversized.jpg', size: MAX_FILE_BYTES + 1 }];
        await file.fire('change');
        assert.match(get('file-status').textContent, /too large/i);

        file.files = [];
        await file.fire('change');
        assert.equal(get('file-details').hidden, true);
        assert.equal(get('structure').hidden, true);
        assert.deepEqual(get('file-info').children, []);
    } finally{
        delete globalThis.document;
    }
});
