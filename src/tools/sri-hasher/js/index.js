import { getById, querySel } from '#utils/dom.js';
import { bindCopyButton } from '#components/copy-button.js';
import { validateURL, validateFile, fetchContent, sriFromArrayBuffer, makeHtmlTag } from './sri-hasher.js';

export function initializeSriHasher(document){
    const root = querySel('[data-sri-hasher]', document);

    if(!root || root.dataset.ready){
        return;
    }

    root.dataset.ready = 'true';

    const get = (id) => getById(`sri-${id}`, document);

    const form = get('form');
    const settings = get('settings');
    const url = get('url');
    const file = get('file');
    const algorithm = get('algorithm');
    const generate = get('generate');
    const error = get('error');
    const progress = get('progress');
    const status = get('copy-status');
    const result = get('results');
    const panel = get('result-panel');
    const modes = [...root.querySelectorAll('[name="source-mode"]')];
    const copy = get('copy');
    const copyTag = get('tag-copy');

    const cryptoReady = (typeof globalThis.crypto?.subtle?.digest === 'function');

    let busy = false;
    let revision = 0;
    let current = null;

    const mode = () => modes.find((radio) => radio.checked)?.value;

    function clearResult(){
        revision++;

        current = null;

        result.hidden = true;
        get('empty').hidden = false;
        get('value').textContent = '';
        get('tag').textContent = '';
        get('result-note').textContent = '';

        copy.disabled = copyTag.disabled = true;
        status.textContent = '';
    }

    function clearError(){
        error.hidden = true;
        error.textContent = '';

        url.removeAttribute('aria-invalid');
        file.removeAttribute('aria-invalid');
    }

    function showError(message){
        error.textContent = message;
        error.hidden = false;
        error.focus({ preventScroll: true });
    }

    function updateMode(){
        const remote = (mode() === 'fetch');

        get('url-fields').hidden = !remote;
        get('file-fields').hidden = remote;

        url.disabled = !remote;
        file.disabled = remote;

        clearResult();
        clearError();

        progress.textContent = '';
    }

    modes.forEach((radio) => radio.addEventListener('change', updateMode));
    for(const input of [url, file, algorithm]){
        input.addEventListener((input === url) ? 'input' : 'change', () => {
            clearResult();
            clearError();

            progress.textContent = '';
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if(busy || !cryptoReady){
            return;
        }

        clearError();
        clearResult();

        progress.textContent = '';

        const remote = (mode() === 'fetch');
        const selected = file.files?.[0];
        const validation = (remote) ? validateURL(url.value.trim()) : validateFile(selected);

        if(!validation.isValid){
            ((remote) ? url : file).setAttribute('aria-invalid', 'true');
            showError((remote) ?
                'Enter an HTTP or HTTPS URL for a .js or .css resource. URLs with file or filename query parameters are also supported.' :
                'Select a JavaScript (.js) or CSS (.css) file.'
            );

            return;
        }

        const source = (remote) ? validation.url : './' + encodeURIComponent(selected.name);
        const selectedAlgorithm = algorithm.value;
        const generation = revision;

        busy = true;

        settings.disabled = generate.disabled = true;

        panel.setAttribute('aria-busy', 'true');
        generate.querySelector('span').textContent = 'Generating…';

        progress.textContent = (remote) ?
            'Fetching resource and generating hash…' :
            'Reading local file and generating hash…';

        try{
            const buffer = (remote) ? await fetchContent(source) : await selected.arrayBuffer();
            const sri = await sriFromArrayBuffer(buffer, selectedAlgorithm);

            if(generation !== revision){
                return;
            }

            current = { sri, tag: makeHtmlTag(source, sri, validation.extension) };

            get('value').textContent = current.sri;
            get('tag').textContent = current.tag;
            get('result-note').textContent = (remote) ?
                'Generated from the fetched response. Regenerate if the resource changes.' :
                'Generated from your local file. Adjust the relative path for its published location.';

            get('empty').hidden = true;

            result.hidden = false;
            copy.disabled = false;
            copyTag.disabled = false;

            progress.textContent = 'SRI generated. Ready to copy.';
        } catch(e){
            if(generation !== revision){
                return;
            }

            progress.textContent = 'Generation failed.';

            showError((e instanceof Error) ? e.message : 'Generation failed. Check the resource and try again.');
        } finally{
            busy = false;

            settings.disabled = generate.disabled = false;

            panel.setAttribute('aria-busy', 'false');
            generate.querySelector('span').textContent = 'Generate SRI';
        }
    });

    function bindCopy(button, property, message){
        bindCopyButton(button, {
            document,
            read: () => current,
            getText: (snapshot) => snapshot[property],
            onSuccess(){
                status.textContent = message;
            },
            onError(){
                status.textContent = 'Copy failed. Select the text and copy it manually.';
            }
        });
    }

    bindCopy(copy, 'sri', 'SRI copied.');
    bindCopy(copyTag, 'tag', 'HTML tag copied.');

    updateMode();

    if(!cryptoReady){
        settings.disabled = generate.disabled = true;

        showError('Web Crypto is unavailable. Use a supported browser over HTTPS or localhost.');
    }
}

if(typeof document !== 'undefined'){
    initializeSriHasher(document);
}
