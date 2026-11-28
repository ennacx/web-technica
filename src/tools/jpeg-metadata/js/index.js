import { getById, createElem } from '#utils/dom.js';
import { downloadBlob } from '#utils/download.js';
import { IFD, TIFF_TAG, EXIF_TAG, TAG_NAMES } from './exif-constants.js';
import { MAX_FILE_BYTES, MAX_FILE_MEGABYTE, parseJpeg } from './jpeg-parser.js';
import { previewExifEntry } from './exif-formatter.js';
import { createExifDisplayModel, inspectJpeg, getExifThumbnail } from './exif-inspector.js';
import { cleanedFilename, cleanJpeg, orientationWarning } from './jpeg-cleaner.js';

// 表示上限数
const LIST_VIEW_LIMIT = 100;

const get = (id) => getById(`jpeg-${id}`, document);
const node = (tag, value) => createElem(tag, value, document);

const fileInput = get('file');
const fileStatus = get('file-status');
const fileInfo = get('file-info');
const fileDetails = get('file-details');
const preview = get('preview');
const structure = get('structure');
const issues = get('issues');
const inspect = get('inspect');
const gps = get('gps');
const otherTags = get('other-tags');
const segments = get('segments');
const options = get('options');
const cleanButton = get('clean');
const download = get('download');
const result = get('result');
const cleanStatus = get('clean-status');
const orientation = get('orientation');

const formatBytes = (size) => `${size.toLocaleString('en')} bytes`;

let revision = 0;
let input;
let output;
let previewUrl;

/**
 * サムネイル表示をクリアする。
 */
function clearPreview(){
    preview.hidden = true;
    preview.removeAttribute('src');

    if(previewUrl){
        document.defaultView.URL.revokeObjectURL(previewUrl);
        previewUrl = undefined;
    }
}

/**
 * Exifサムネイルを優先し、復号できなければ元JPEGを表示する。
 *
 * @param {File} file - 選択したJPEG。
 * @param {import('./exif-inspector.js').ExifInspection[]} inspections - Exif APP1ごとの解析結果。
 * @param {number} current - 選択時のリビジョン。
 * @returns {Promise<void>}
 */
async function showPreview(file, inspections, current){
    const thumbnail = getExifThumbnail(inspections);

    for(const embedded of ((thumbnail) ? [true, false] : [false])){
        try{
            const jpeg = (embedded) ?
                new Blob([thumbnail], { type: 'image/jpeg' }) :
                file.slice(0, file.size, 'image/jpeg');

            previewUrl = document.defaultView.URL.createObjectURL(jpeg);
            preview.src = previewUrl;

            await preview.decode();

            if(revision === current){
                preview.alt    = (embedded) ? 'Embedded Exif thumbnail' : 'Preview of the selected JPEG';
                preview.hidden = false;
            }

            return;
        } catch(e){
            if(revision !== current){
                return;
            }

            clearPreview();
        }
    }
}

function facts(container, entries){
    container.replaceChildren(...entries.flatMap(([label, value]) => [node('dt', label), node('dd', value)]));
}

function mode(){
    return options.querySelector('input:checked').value;
}

function clearOutput(){
    output = undefined;

    download.hidden = true;
    result.hidden = true;
    result.replaceChildren();

    cleanStatus.textContent = '';
}

function updateOrientation(){
    orientation.textContent = (mode() === 'metadata') ? input?.orientation ?? '' : '';
    orientation.hidden = (!orientation.textContent);
}

function renderInspection(jpeg, inspections){
    const fields      = [];
    const coordinates = [];
    const notes       = [];
    const rawTags     = [];
    const opaque      = new Set();

    let gpsCount   = 0;
    let incomplete = false;

    for(const { exif, segment, error } of inspections){
        if(error){
            incomplete = true;

            if(notes.length < 8){
                notes.push(`Exif at byte ${segment.offset}: ${error}`);
            }

            continue;
        }

        if(exif.directories.has(IFD.GPS)){
            gpsCount++;
        }
        if(exif.directories.has(IFD.THUMBNAIL)){
            opaque.add('IFD1 / possible thumbnail');
        }
        if(exif.directories.get(IFD.EXIF)?.has(EXIF_TAG.MakerNote)){
            opaque.add('MakerNote');
        }
        if(exif.directories.get(IFD.PRIMARY)?.has(TIFF_TAG.SubIFDs)){
            opaque.add('additional SubIFDs');
        }
        if(exif.issues.length && notes.length < 8){
            const locations = exif.issueRanges.slice(0, 4).map(
                ({ issue, start, end }) => `${issue} at TIFF offset ${start} (${end - start} B)`
            );

            if(exif.issueRanges.length > locations.length){
                locations.push(`${exif.issueRanges.length - locations.length} more affected range(s)`);
            }

            const makerNote = exif.directories.get(IFD.EXIF)?.get(EXIF_TAG.MakerNote);

            if(makerNote){
                locations.push(`MakerNote value at TIFF offset ${makerNote.dataOffset} (${makerNote.data.length} B)`);
            }

            notes.push(`Exif at JPEG byte ${segment.offset}: ${locations.join('; ')}.`);
        }

        const display = createExifDisplayModel(exif);

        // 定義済みタグ
        for(const { source, label, value } of display.fields){
            const target = (source === IFD.GPS) ? coordinates : fields;

            if(target.length < LIST_VIEW_LIMIT){
                target.push([`${label} · ${source} @ ${segment.offset}`, value]);
            }
        }

        // 未定義タグ
        for(const { source, tag } of display.otherTags){
            if(rawTags.length >= LIST_VIEW_LIMIT){
                break;
            }

            const entry = exif.directories.get(source).get(tag);
            const { typeName, value } = previewExifEntry(entry, exif.little, source);

            const id      = `0x${tag.toString(16).padStart(4, '0')}`;
            const item    = node('li');
            const details = node('dl');
            const content = node('div');
            const valueDetails = node('dl');
            const heading      = node('div');
            const tagId = node('code', id);
            const badge = node('span', source);

            details.className      = 'jpeg-facts';
            content.className      = 'ifd-tag-content';
            valueDetails.className = 'jpeg-facts ifd-tag-value';
            heading.className      = 'ifd-tag-heading';
            badge.className        = 'ifd-tag-source';

            facts(details, [
                ['Type and size', `${typeName} × ${entry.count} · ${entry.data.length} B`],
                ['JPEG APP1 offset', String(segment.offset)],
                ['TIFF value offset', String(entry.dataOffset)]
            ]);
            facts(valueDetails, [['Value', value || '(empty)']]);

            const name = TAG_NAMES[source]?.get(tag);

            heading.append(tagId);
            if(name){
                heading.append(node('strong', name));
            }
            heading.append(badge);

            content.append(details, valueDetails);

            item.append(heading, content);

            rawTags.push(item);
        }
    }

    // サマリー
    const summary = [
        (inspections.length) ? `${inspections.length} Exif segment(s).` : 'No Exif segments.',
        (gpsCount) ? `GPS directory found in ${gpsCount} segment(s).` : ((incomplete) ? 'GPS presence could not be determined.' : 'No Exif GPS directory detected.'),
        ([fields, coordinates, rawTags].some((list) => (list.length >= LIST_VIEW_LIMIT))) ? `Tag display is limited to ${LIST_VIEW_LIMIT} entries per list.` : '',
        (opaque.size) ? `Detected without decoding: ${[...opaque].join(', ')}.` : ''
    ];

    get('exif-summary').textContent = summary.filter(Boolean).join(' ');

    facts(get('exif-fields'), fields);
    facts(get('gps-fields'), coordinates);

    gps.hidden = (!coordinates.length);

    get('tag-list').replaceChildren(...rawTags);

    otherTags.hidden = (!rawTags.length);

    const rows = document.createDocumentFragment();

    // セグメント
    for(const { name, offset, end, kind } of jpeg.segments){
        const row = node('tr');

        for(const value of [name, String(offset), String(end - offset), kind || "—"]){
            row.append(node('td', value));
        }

        rows.append(row);
    }

    get('segment-rows').replaceChildren(rows);

    if(jpeg.restrictions.length){
        notes.unshift(`Cleanup unavailable: ${jpeg.restrictions.join(', ')}.`);
    }
    get('issue-list').replaceChildren(...notes.map((note) => node('li', note)));

    issues.hidden    = (!notes.length);
    structure.hidden = false;
    inspect.hidden   = false;
}

fileInput.addEventListener('change', async () => {
    const current = ++revision;
    const file    = fileInput.files[0];

    input = undefined;

    clearOutput();
    clearPreview();

    structure.hidden = true;
    issues.hidden    = true;
    inspect.hidden   = true;

    gps.open       = false;
    otherTags.open = false;
    segments.open  = true;

    for(const id of ['file-info', 'issue-list', 'exif-summary', 'exif-fields', 'gps-fields', 'tag-list', 'segment-rows']){
        get(id).replaceChildren();
    }

    options.disabled     = true;
    cleanButton.disabled = true;

    updateOrientation();

    fileDetails.hidden = !file;

    if(!file){
        fileStatus.textContent = 'Choose a JPEG to inspect.';

        return;
    }

    const details = [
        ['Name', file.name],
        ['File size', formatBytes(file.size)]
    ];

    facts(fileInfo, details);

    if(file.size > MAX_FILE_BYTES){
        fileStatus.textContent = `File too large. Choose a JPEG of ${MAX_FILE_MEGABYTE} MiB or less.`;

        return;
    }

    fileStatus.textContent = 'Reading JPEG…';

    let bytes;

    try{
        bytes = new Uint8Array(await file.arrayBuffer());
    } catch(e){
        if(revision === current){
            fileStatus.textContent = 'The selected file could not be read.';
        }

        return;
    }

    if(revision !== current){
        return;
    }

    try{
        const jpeg        = parseJpeg(bytes);
        const inspections = inspectJpeg(bytes, jpeg);

        facts(fileInfo, [...details, ['Format', 'JPEG'], ['Dimensions', `${jpeg.width} × ${jpeg.height} px`]]);
        renderInspection(jpeg, inspections);

        input = {
            bytes,
            name: file.name,
            orientation: orientationWarning(inspections),
        };

        updateOrientation();

        fileStatus.textContent = (jpeg.restrictions.length) ?
            'JPEG markers inspected. See Issues for cleanup restrictions.' :
            'JPEG marker structure inspected.';

        options.disabled = cleanButton.disabled = Boolean(jpeg.restrictions.length);

        void showPreview(file, inspections, current);
    } catch(e){
        fileStatus.textContent = `JPEG inspection failed. ${e.message}`;
    }
});

options.addEventListener('change', () => {
    clearOutput();
    updateOrientation();
});

cleanButton.addEventListener('click', async () => {
    if(!input || cleanButton.disabled){
        return;
    }

    const current      = revision;
    const selectedMode = mode();

    clearOutput();

    options.disabled = cleanButton.disabled = true;
    cleanStatus.textContent = 'Preparing and verifying JPEG…';

    // 同期的なバイナリ処理の前に処理状態の描画を許可
    await new Promise((resolve) => setTimeout(resolve, 0));

    if(revision !== current){
        return;
    }

    try{
        const cleaned = cleanJpeg(input.bytes, selectedMode);

        if(!cleaned.bytes){
            cleanStatus.textContent = 'No matching metadata found. No new file was created.';

            return;
        }

        output = {
            blob: new Blob([cleaned.bytes], { type: 'image/jpeg' }),
            name: cleanedFilename(input.name)
        };

        const entries = [
            ['Download name', output.name],
            ['Original size', formatBytes(input.bytes.length)],
            ['Cleaned size', formatBytes(cleaned.bytes.length)],
            ['Removed', [...cleaned.removed].map(([kind, count]) => `${kind} × ${count}`).join(', ')],
            ['Retained metadata', cleaned.retained.join(', ') || 'None identified']
        ];

        if(cleaned.warning){
            entries.push(['Warning', cleaned.warning]);
        }

        facts(result, entries);

        result.hidden   = false;
        download.hidden = false;

        cleanStatus.textContent = 'Cleaned JPEG verified. Compressed scans are unchanged.';
    } catch(e){
        cleanStatus.textContent = `Cleanup stopped. ${e.message}`;
    } finally{
        options.disabled = cleanButton.disabled = false;
    }
});

download.addEventListener('click', () => {
    if(!output){
        return;
    }

    try{
        downloadBlob(output.blob, output.name);
    } catch(e){
        cleanStatus.textContent = 'The browser could not start the download.';
    }
});

fileInput.disabled = false;
