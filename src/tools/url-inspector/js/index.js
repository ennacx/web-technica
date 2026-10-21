import { getById } from '#utils/dom.js';
import { bindCopyButton } from '#components/copy-button.js';
import { createNotice } from '#components/notice.js';
import { componentNames, UrlInspectorDocument } from './document.js';
import { componentFieldValue, componentUrlValue, hasHierarchicalPath, pathSegments, canHaveCredentials } from './components.js';

const state = new UrlInspectorDocument();

const get = (id) => getById(`url-${id}`, document);

const current = get('current');
const rowsElement = get('query-rows');

const componentInputs = Object.fromEntries(componentNames.map((name) => [name, get(name)]));

const sample = 'https://example.com:8443/search?q=mirrorless+camera&tag=photo&tag=travel&page=2#results';

const { show: announce } = createNotice(get('action-status'));

function render({ rows = true, components = true } = {}){
    if(current.value !== state.currentUrl){
        current.value = state.currentUrl;
    }

    get('original').value = state.originalUrl ?? '';
    get('validity').textContent = (state.valid) ? 'Valid URL' : ((state.currentUrl) ? 'Invalid URL' : 'No URL yet');
    get('validity').dataset.state = (state.valid) ? 'valid' : ((state.currentUrl) ? 'invalid' : 'empty');

    current.setAttribute('aria-invalid', String(Boolean(state.currentUrl) && !state.valid));

    get('error').hidden = (state.valid || !state.currentUrl);
    get('error').textContent = 'Enter an absolute URL, including its scheme (for example, https://example.com/). Validity does not indicate that a URL is safe to visit.';
    get('stale').hidden = (state.valid || !state.lastValidUrl);
    get('query-empty').hidden = (state.rows.length > 0);

    get('components').disabled = !state.valid;
    get('query').disabled = !state.valid;
    get('copy').disabled = !state.currentUrl;
    get('clear').disabled = !state.currentUrl;
    get('reset').disabled = (state.originalUrl === null || state.currentUrl === state.originalUrl);
    get('store').disabled = (!state.valid || state.currentUrl === state.originalUrl);

    const credentialsEditable = (state.valid && canHaveCredentials(state.lastValidUrl));
    for(const name of ['username', 'password', 'port']){
        componentInputs[name].disabled = (!credentialsEditable);
    }
    get('show-password').disabled = (!credentialsEditable);
    get('credentials-help').hidden = (!state.valid || credentialsEditable);

    get('length').textContent = `${state.currentUrl.length.toLocaleString('en-US')} characters`;

    const queryCount = state.rows.length;

    get('query-count').textContent = `${queryCount.toLocaleString('en-US')} ${(queryCount > 1) ? 'queries' : 'query'}.`;

    if(components){
        get('component-error').hidden = true;

        for(const name of componentNames){
            componentInputs[name].value = componentFieldValue(name, state.lastValidUrl?.[name] ?? '');
            componentInputs[name].removeAttribute('aria-invalid');
        }

        renderPathSegments();
    }

    if(rows){
        renderRows();
    }
}

function renderPathSegments(){
    const fragment = document.createDocumentFragment();
    const segments = (state.lastValidUrl && hasHierarchicalPath(state.lastValidUrl)) ?
        pathSegments(componentInputs.pathname.value) :
        [];

    get('path-preview').hidden = (segments.length === 0);

    segments.forEach((segment, index) => {
        const item = document.createElement('li');

        if(index > 0){
            const separator = document.createElement('span');

            separator.className = 'url-path-separator';
            separator.textContent = '›';
            separator.setAttribute('aria-hidden', 'true');

            item.append(separator);
        }

        const label = document.createElement('code');

        label.className = 'url-path-segment';
        label.textContent = (segment === '') ? '(empty)' : segment;
        label.title = (index === 0) ? 'Root' : `Segment ${index}${(segment === '') ? ': empty' : ''}`;

        if(index === 0){
            label.textContent = 'Root /';
            label.title = 'Root /';
        } else if(index === segments.length - 1 && segment === ''){
            label.textContent = 'Trailing /';
            label.title = 'Trailing slash (empty final segment)';
        }

        if(segment === ''){
            label.classList.add('is-empty');
        }

        item.append(label);
        fragment.append(item);
    });

    get('path-segments').replaceChildren(fragment);
}

function makeButton(label, text, action, id){
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.action = action;
    button.dataset.id = id;

    return button;
}

function renderRows(){
    const fragment = document.createDocumentFragment();

    state.rows.forEach((row, index) => {
        const tr = document.createElement('tr');

        for(const name of ['key', 'value']){
            const td = document.createElement('td');
            const input = document.createElement('input');

            input.className = 'input';
            input.value = row[name];
            input.spellcheck = false;
            input.autocomplete = 'off';
            input.setAttribute('autocapitalize', 'off');
            input.setAttribute('aria-label', `${(name === 'key') ? 'Key' : 'Value'} for parameter ${index + 1}`);
            input.dataset.id = row.id;
            input.dataset.field = name;

            td.append(input);
            tr.append(td);
        }

        const orderCell = document.createElement('td');
        const order = document.createElement('div');

        order.className = 'url-row-order';

        const up = makeButton(`Move parameter ${index + 1} up`, '↑', 'up', row.id);
        const down = makeButton(`Move parameter ${index + 1} down`, '↓', 'down', row.id);

        up.disabled = (index === 0);
        down.disabled = (index === state.rows.length - 1);

        order.append(up, down);
        orderCell.append(order);

        const deleteCell = document.createElement('td');
        const remove = makeButton(`Delete parameter ${index + 1}`, '×', 'delete', row.id);

        remove.classList.add('url-row-delete');

        deleteCell.append(remove);
        tr.append(orderCell, deleteCell);
        fragment.append(tr);
    });

    rowsElement.replaceChildren(fragment);
}

function setCurrent(text, message = ''){
    state.setCurrent(text);

    render();

    announce(message);
}

function focusRow(id, action){
    const selector = (action) ?
        `button[data-id="${id}"][data-action="${action}"]:not(:disabled)` :
        `input[data-id="${id}"]`;

    (rowsElement.querySelector(selector) ?? rowsElement.querySelector(`input[data-id="${id}"]`) ?? get('add')).focus();
}

current.addEventListener('input', () => setCurrent(current.value));

get('sample').addEventListener('click', () => setCurrent(sample, 'Sample loaded.'));

get('clear').addEventListener('click', () => {
    setCurrent('', 'Current URL cleared. Original kept.');
    current.focus();
});

get('reset').addEventListener('click', () => {
    state.reset();

    render();

    announce('Original restored.');
});

get('store').addEventListener('click', () => {
    state.storeOriginal();

    render({
        rows: false,
        components: false
    });

    announce('Current URL stored as Original.');
});

bindCopyButton(get('copy'), {
    document,
    read: () => state.currentUrl,
    onSuccess(){
        announce('Current URL copied, including any credentials.');
    },
    onError(){
        announce('Copy unavailable. Select and copy the Current URL manually.');
    }
});

get('show-password').addEventListener('change', (event) => {
    get('password').type = (event.target.checked) ? 'text' : 'password';
});

componentInputs.pathname.addEventListener('input', renderPathSegments);

get('components-form').addEventListener('submit', (event) => {
    event.preventDefault();

    if(!state.valid){
        return;
    }

    try{
        const drafts = Object.fromEntries(componentNames.map((name) => [name, componentUrlValue(name, componentInputs[name].value)]));

        state.applyComponents(drafts);

        render();

        announce('Components applied. URL rebuilt using the standard URL API.');
    } catch(e){
        get('component-error').textContent = e.message;
        get('component-error').hidden = false;

        if(e.component){
            componentInputs[e.component].setAttribute('aria-invalid', 'true');
            componentInputs[e.component].focus();
        }
    }
});

rowsElement.addEventListener('change', (event) => {
    const { id, field } = event.target.dataset;

    if(!id || !field || !state.valid){
        return;
    }

    state.editRow(Number(id), field, event.target.value);

    // このDOMノードとカーソルを保持すること。テキスト編集によってテーブルが再描画される事は禁止。
    render({ rows: false, components: false });
    announce('Query updated.');
});
rowsElement.addEventListener('keydown', (event) => {
    if(event.key === 'Enter' && event.target.matches('input')){
        event.preventDefault();
        event.target.blur();
    }
});

get('add').addEventListener('click', () => {
    const id = state.addRow();

    render({ components: false });

    focusRow(id);

    announce('Parameter added.');
});

rowsElement.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');

    if(!button || !state.valid){
        return;
    }

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const index = state.rows.findIndex((row) => (row.id === id));

    const deleteAction = (action === 'delete');

    if(deleteAction){
        state.deleteRow(id);
    } else{
        state.moveRow(id, (action === 'up') ? -1 : 1);
    }

    render({ components: false });

    focusRow(
        (deleteAction) ? state.rows[Math.min(index, state.rows.length - 1)]?.id : id,
        action
    );

    announce((deleteAction) ? 'Parameter deleted.' : 'Parameter moved.');
});

render();
