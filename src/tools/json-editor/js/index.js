import { getById } from '#utils/dom.js';
import { bindCopyButton } from '#components/copy-button.js';
import { createNotice } from '#components/notice.js';
import { lineCount } from '#utils/text.js';
import { downloadText } from '#utils/download.js';
import { prettyPrintJson, minifyJson, changeJsonIndent } from './formatter.js';
import { JsonEditorDocument } from './document.js';
import { planJsonInput } from './input-assist.js';
import { createTreeRenderer } from './tree-renderer.js';

const get = (id) => getById(id, document);

// The source remains text. Validation never replaces it with parsed values.
const input = get('json-input');
const display = get('json-display');
const code = get('json-code');
const lines = get('json-lines');
const editButton = get('json-edit');
const viewButton = get('json-view');
const treeButton = get('json-tree');
const treePanel = get('json-tree-panel');
const treeRenderer = createTreeRenderer(treePanel, document);
const copyButton = get('json-copy');
const downloadButton = get('json-download');
const sampleButton = get('json-sample');
const status = get('json-action-status');
const actionNotice = get('json-action-notice');
const validateButton = get('json-validate');
const syntax = get('json-syntax');
const syntaxText = get('json-syntax-text');
const errorMessage = get('json-error');
const formatHelp = get('json-format-help');
const prettyButton = get('json-pretty');
const minifyButton = get('json-minify');
const sortButton = get('json-sort');
const indentSelect = get('json-indent');
const filenameDisplay = get('json-filename-display');
const filenameLabel = get('json-filename');
const filenameForm = get('json-filename-form');
const filenameInput = get('json-filename-input');
const filenameError = get('json-filename-error');
const renameButton = get('json-rename');

const editorDocument = new JsonEditorDocument();

let viewing = false;
let mode = 'edit';
let validationTimer;
let renderedViewText = null;
let composing = false;
let applyingAssistance = false;

const notice = createNotice(status, {
    container: actionNotice,
    dismiss: get('json-action-dismiss'),
    focusTarget: () => mode === 'tree' ? treePanel : viewing ? code : input
});

function setAction(message){
    if(message){
        notice.show(message);
    } else{
        notice.clear();
    }
}

function showValidation(result){
    syntax.dataset.state = result.state;

    syntaxText.textContent = {
        empty: 'No JSON yet',
        pending: 'Checking syntax…',
        valid: 'Valid JSON',
        invalid: 'Invalid JSON',
    }[result.state];

    errorMessage.textContent = (result.message) ? `Source JSON: ${result.message}` : '';
    errorMessage.hidden = !result.message;

    input.setAttribute('aria-invalid', String(result.state === 'invalid'));

    prettyButton.disabled = (mode === 'tree' || result.state !== 'valid');
    minifyButton.disabled = (mode === 'tree' || result.state !== 'valid');
    sortButton.disabled = (mode === 'tree' || result.state !== 'valid');
    indentSelect.disabled = (mode === 'tree' || (viewing && result.state !== 'valid'));

    formatHelp.hidden = (result.state !== 'invalid');
    formatHelp.textContent = (result.state === 'invalid') ?
        (mode === 'tree' ?
            'Tree requires valid JSON. Fix the syntax errors in Edit. Your display settings are kept.' : (viewing) ?
            'Showing the original text. Fix the syntax errors in Edit to use formatting, sorting, and Indent. Your display settings are kept.' :
            'Formatting and sorting are unavailable until the syntax errors are fixed. You can still edit the JSON and adjust Indent.'
        ) :
        '';
}

function validate(){
    clearTimeout(validationTimer);

    const result = editorDocument.validateSource();

    showValidation(result);
    if(mode === 'tree') treeRenderer.render(editorDocument);

    return result;
}

// Cosmetic token colors are not a syntax check. Never insert source as HTML.
function renderSource(){
    const source = editorDocument.text;

    if(source === renderedViewText){
        return;
    }

    code.replaceChildren();

    const fragment = document.createDocumentFragment();
    const tokens = /"(?:[^"\\\u0000-\u001f]|\\[^\r\n])*"\s*(?=:)|"(?:[^"\\\u0000-\u001f]|\\[^\r\n])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;

    let position = 0;

    for(const match of source.matchAll(tokens)){
        fragment.append(document.createTextNode(source.slice(position, match.index)));

        const token = document.createElement('span');
        const text = match[0];
        const kind = (text.startsWith('"')) ?
            ((source[match.index + text.length] === ':') ? 'key' : 'string') :
            ((/^-?\d/.test(text)) ? 'number' : 'literal');

        token.className = `json-token-${kind}`;
        token.textContent = text;
        fragment.append(token);

        position = match.index + text.length;
    }

    fragment.append(document.createTextNode(source.slice(position) || (source ? '' : 'Your JSON will appear here.')));
    code.append(fragment);

    const count = lineCount(source);

    lines.textContent = Array.from({ length: count }, (_, index) => index + 1).join('\n');
    renderedViewText = source;
}

function update(immediate = false){
    const nextDirection = (editorDocument.sort === 'asc') ? 'desc' : 'asc';
    get('json-sort-label').textContent = (nextDirection === 'asc') ? 'Sort Ascending' : 'Sort Descending';
    get('json-sort-asc-icon').hidden = (nextDirection !== 'asc');
    get('json-sort-desc-icon').hidden = (nextDirection !== 'desc');

    const length = editorDocument.text.length;
    const count = lineCount(editorDocument.text);

    get('json-stats').textContent = `${length.toLocaleString('en-US')} characters · ${count.toLocaleString('en')} line${(count === 1) ? '' : 's'}`;

    clearTimeout(validationTimer);

    validateButton.disabled = !length;

    if(immediate || !length){
        validate();
    } else{
        showValidation({ state: 'pending', message: '' });

        validationTimer = setTimeout(validate, 300);
    }

    copyButton.disabled = downloadButton.disabled = !length;

    // 入力開始後はドキュメントをサンプルに置き換えさせない
    sampleButton.disabled = Boolean(editorDocument.source.length);

    if(viewing){
        renderSource();
    }
}

function setMode(nextMode){
    mode = nextMode;
    viewing = mode === 'view';
    const view = viewing;
    editorDocument.mode = mode;

    indentSelect.value = String(editorDocument.indent);
    input.style.tabSize = String(editorDocument.editIndent);
    code.style.tabSize = String(editorDocument.view.indent);

    update(true);

    setAction('');

    get('json-mode-help').textContent = mode === 'tree' ?
        'Tree: read-only source structure. Expand nodes with Enter or Space. Copy, Save, and statistics use the source; display settings are kept.' : (view) ?
        'View: saved display settings apply to valid JSON. Validation uses the source. Copy and Save use the displayed text.' :
        'Edit: operations, validation, Copy, and Save use the source.';

    for(const [button, action] of [[copyButton, 'Copy'], [downloadButton, 'Save']]){
        const label = `${action} ${view ? 'displayed JSON' : 'source'}`;

        button.setAttribute('aria-label', label);
        button.title = label;
    }

    input.hidden = mode !== 'edit';
    display.hidden = !view;
    treePanel.hidden = mode !== 'tree';

    editButton.setAttribute('aria-pressed', String(mode === 'edit'));
    viewButton.setAttribute('aria-pressed', String(view));
    treeButton.setAttribute('aria-pressed', String(mode === 'tree'));

    if(mode === 'edit'){
        input.focus({ preventScroll: true });
    }
}

input.addEventListener('input', () => {
    editorDocument.setSource(input.value);

    setAction('');

    update();
});

input.addEventListener('compositionstart', () => { composing = true; });
input.addEventListener('compositionend', () => { composing = false; });

input.addEventListener('beforeinput', (event) => {
    if(mode !== 'edit' || composing || applyingAssistance || event.isComposing || !event.cancelable){
        return;
    }

    const inserted = (['insertLineBreak', 'insertParagraph'].includes(event.inputType)) ?
        '\n' :
        ((event.inputType === 'insertText') ? event.data : null);
    const edit = planJsonInput(input.value, input.selectionStart, input.selectionEnd, inserted, editorDocument.editIndent);

    if(!edit){
        return;
    }

    event.preventDefault();
    input.setSelectionRange(edit.start, edit.end);

    let insertedNatively = false;

    applyingAssistance = true;

    try{
        insertedNatively = (document.execCommand?.('insertText', false, edit.text) === true);
    } catch(e){
        // TODO: Fall back to the standard textarea replacement API.
    } finally{
        applyingAssistance = false;
    }

    if(!insertedNatively){
        input.setRangeText(edit.text, edit.start, edit.end, 'end');
    }

    input.setSelectionRange(edit.caret, edit.caret);
    editorDocument.setSource(input.value);

    setAction('');

    update();
});

editButton.addEventListener('click', () => setMode('edit'));
viewButton.addEventListener('click', () => setMode('view'));
treeButton.addEventListener('click', () => setMode('tree'));

function closeFilenameEditor(){
    filenameForm.hidden = true;
    filenameDisplay.hidden = false;

    renameButton.setAttribute('aria-expanded', 'false');
    renameButton.focus({ preventScroll: true });
}

renameButton.addEventListener('click', () => {
    filenameInput.value = editorDocument.filename;

    filenameInput.removeAttribute('aria-invalid');

    filenameError.hidden = true;
    filenameError.textContent = '';
    filenameDisplay.hidden = true;
    filenameForm.hidden = false;

    renameButton.setAttribute('aria-expanded', 'true');
    filenameInput.focus({ preventScroll: true });
    filenameInput.select();
});

filenameForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = filenameInput.value.trim();
    if(!name){
        filenameError.textContent = 'Enter a file name.';
        filenameError.hidden = false;

        filenameInput.setAttribute('aria-invalid', 'true');
        filenameInput.focus();

        return;
    }

    editorDocument.filename = name;
    filenameLabel.textContent = name;
    filenameLabel.title = name;

    closeFilenameEditor();

    setAction(`File name changed to ${name}.`);
});

filenameInput.addEventListener('input', () => {
    filenameInput.removeAttribute('aria-invalid');

    filenameError.hidden = true;
    filenameError.textContent = '';
});

filenameInput.addEventListener('keydown', (event) => {
    if(event.key === 'Escape'){
        event.preventDefault();

        closeFilenameEditor();
    }
});

validateButton.addEventListener('click', () => {
    const result = validate();
    setAction(result.state === 'empty' ? 'Enter JSON to validate.' : '');
});

indentSelect.addEventListener('change', () => {
    if(mode === 'tree') return;
    const nextWidth = Number(indentSelect.value);

    if(viewing){
        if(!editorDocument.setIndent(nextWidth)){
            indentSelect.value = String(editorDocument.indent);
            update(true);

            return;
        }

        code.style.tabSize = String(editorDocument.view.indent);

        update(true);

        setAction(`Display indentation adjusted to ${nextWidth} spaces. Existing line breaks and inline spacing kept.`);

        return;
    }

    const source = editorDocument.text;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const direction = input.selectionDirection;
    const scrollTop = input.scrollTop;
    const scrollLeft = input.scrollLeft;

    const adjusted = changeJsonIndent(source, editorDocument.indent, nextWidth);

    // Keep the selection on the same text after changing leading whitespace.
    const beforeLines = source.split('\n');
    const afterLines = adjusted.split('\n');

    const mapPosition = (position) => {
        let mapped = position;
        let offset = 0;

        for(let index = 0; index < beforeLines.length; index++){
            const before = beforeLines[index];
            const delta = afterLines[index].length - before.length;

            if(position <= offset + before.length){
                const column = position - offset;
                const oldIndent = before.match(/^[\t ]*/)[0].length;

                mapped += column < oldIndent ? Math.max(-column, delta) : delta;

                break;
            }

            mapped += delta;
            offset += before.length + 1;
        }

        return mapped;
    };

    editorDocument.setIndent(nextWidth);
    editorDocument.setText(adjusted);

    if(!viewing){
        input.value = editorDocument.source;
        input.setSelectionRange(mapPosition(start), mapPosition(end), direction);
        input.scrollTop = scrollTop;
        input.scrollLeft = scrollLeft;
    }

    code.style.tabSize = String(editorDocument.view.indent);
    input.style.tabSize = String(editorDocument.editIndent);

    update(true);

    setAction(`${(viewing) ? 'Display' : 'Source'} indentation adjusted to ${nextWidth} spaces. Existing line breaks and inline spacing kept.`);
});

prettyButton.addEventListener('click', () => {
    if(mode === 'tree') return;
    if(validate().state !== 'valid'){
        setAction('Fix the syntax errors before formatting. Your text has been kept.');

        return;
    }

    try{
        if(viewing){
            editorDocument.setViewFormat('pretty');
        } else{
            editorDocument.setText(prettyPrintJson(editorDocument.text, editorDocument.indent));

            input.value = editorDocument.source;
        }

        update(true);

        setAction(`${viewing ? 'Display' : 'Source'} formatted with ${indentSelect.value}-space indentation.`);
    } catch(e){
        setAction('Could not format this document. Your text has been kept.');
    }
});

minifyButton.addEventListener('click', () => {
    if(mode === 'tree') return;
    if(validate().state !== 'valid'){
        setAction('Fix the syntax errors before minifying. Your text has been kept.');

        return;
    }

    try{
        if(viewing){
            editorDocument.setViewFormat('minify');
        } else{
            editorDocument.setText(minifyJson(editorDocument.text));
            input.value = editorDocument.source;
        }

        update(true);

        setAction(`${viewing ? 'Display' : 'Source'} minified.`);
    } catch(e){
        setAction('Could not minify this document. Your text has been kept.');
    }
});

sortButton.addEventListener('click', () => {
    if(mode === 'tree') return;
    if(validate().state !== 'valid'){
        return;
    }

    const direction = (editorDocument.sort === 'asc') ? 'desc' : 'asc';

    try{
        editorDocument.sortKeys(direction);

        if(!viewing){
            input.value = editorDocument.source;
        }

        update(true);

        setAction(`${viewing ? 'Display' : 'Source'} object keys sorted in ${(direction === 'asc') ? 'ascending' : 'descending'} natural order.`);
    } catch(e){
        setAction('Could not sort this document. Your text has been kept.');
    }
});

sampleButton.addEventListener('click', () => {
    if(input.value){
        return;
    }

    const sample = '{\n  "name": "Web-Technica",\n  "tools": ["pwdgen", "keygen", "sri-hasher"],\n  "offline": true,\n  "version": 1,\n  "description": null\n}';
    editorDocument.setSource(prettyPrintJson(sample, editorDocument.editIndent));
    treeRenderer.reset();
    input.value = editorDocument.source;

    update(true);
    setMode('view');

    setAction('Sample loaded. Select Edit to change it.');
});

bindCopyButton(copyButton, {
    document,
    read: () => editorDocument.text,
    onSuccess(){
        setAction('JSON text copied.');
    },
    onError(){
        setAction('Could not copy. Select the text and copy it manually.');
    }
});

downloadButton.addEventListener('click', () => {
    try{
        downloadText(editorDocument.text, editorDocument.filename, document, 'application/json;charset=utf-8');

        const result = validate();

        setAction((result.state === 'valid') ?
            'Download requested.' :
            'Download requested. The text is not valid JSON.');
    } catch(e){
        setAction('Could not download. Copy the text to save it manually.');
    }
});

update();
