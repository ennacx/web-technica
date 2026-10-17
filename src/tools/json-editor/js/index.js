import { getById } from '#utils/dom.js';
import { copyText } from '#utils/clipboard.js';
import { downloadText } from '#utils/download.js';

const get = (id) => getById(id, document);

// UI preview only: the source remains text. No parsing or JSON transformations.
const input = get('json-input');
const display = get('json-display');
const code = get('json-code');
const lines = get('json-lines');
const editButton = get('json-edit');
const viewButton = get('json-view');
const copyButton = get('json-copy');
const downloadButton = get('json-download');
const sampleButton = get('json-sample');
const status = get('json-action-status');

let viewing = false;

// Cosmetic token colors are not a syntax check. Never insert source as HTML.
function renderSource(){
    code.replaceChildren();

    const source = input.value;
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

    const count = source.split('\n').length;

    lines.textContent = Array.from({ length: count }, (_, index) => index + 1).join('\n');
}

function update(){
    const length = input.value.length;
    const count = input.value.split('\n').length;

    get('json-stats').textContent = `${length.toLocaleString('en')} characters · ${count.toLocaleString('en')} line${(count === 1) ? '' : 's'}`;
    get('json-syntax-text').textContent = (length) ? 'Not validated · validation coming next' : 'No JSON yet';

    copyButton.disabled = downloadButton.disabled = !length;

    // 入力開始後はドキュメントをサンプルに置き換えさせない
    sampleButton.disabled = Boolean(length);

    if(viewing){
        renderSource();
    }
}

function setMode(view){
    viewing = view;

    if(view){
        renderSource();
    }

    input.hidden = view;
    display.hidden = !view;

    editButton.setAttribute('aria-pressed', String(!view));
    viewButton.setAttribute('aria-pressed', String(view));

    if(!view){
        input.focus({ preventScroll: true });
    }
}

input.addEventListener('input', () => {
    status.textContent = ''; update();
});

editButton.addEventListener('click', () => setMode(false));

viewButton.addEventListener('click', () => setMode(true));

sampleButton.addEventListener('click', () => {
    if(input.value){
        return;
    }

    input.value = '{\n  "name": "Web-Technica",\n  "tools": ["pwdgen", "keygen", "sri-hasher"],\n  "offline": true,\n  "version": 1,\n  "description": null\n}';

    update();
    setMode(true);

    status.textContent = 'Sample loaded. Select Edit to change it.';
});

copyButton.addEventListener('click', async () => {
    try{
        await copyText(input.value);
        status.textContent = 'JSON text copied.';
    } catch(e){
        status.textContent = 'Could not copy. Select the text and copy it manually.';
    }
});

downloadButton.addEventListener('click', () => {
    try{
        downloadText(input.value, 'document.json', document, 'application/json;charset=utf-8');
        status.textContent = 'Download requested. Syntax has not been validated.';
    } catch(e){
        status.textContent = 'Could not download. Copy the text to save it manually.';
    }
});

update();
