import { getById, querySel, querySelAll } from '#utils/dom.js';
import { downloadText } from '#utils/download.js';
import { bindCopyButton, createCopyFeedback } from '#components/copy-button.js';
import { generateKeypair, validateKeyOptions } from './keygen.js';
import { initializePointerCollector } from './guri2.js';

export function initializeKeygen(document, generate = generateKeypair){
    const get = (id) => getById(id, document);

    const root = querySel('[data-keygen]', document);

    if(!root || root.dataset.ready){
        return;
    }

    const rootQuery = (sel) => querySel(sel, root);

    root.dataset.ready = 'true';

    const window = document.defaultView;

    const form = get('keygen-form');
    const settings = get('keygen-settings');
    const algorithm = get('algo');
    const passEnabled = get('use-passphrase');
    const passphrase = get('passphrase');
    const confirmation = get('passphrase_c');
    const sampling = get('guri2view');
    const error = get('error-alert');
    const status = get('keygen-status');
    const progress = get('generate-progress');
    const button = get('generate-button');
    const reset = get('gen-reset-button')

    const runtimeReady = (typeof globalThis.crypto?.subtle?.generateKey === 'function' && typeof globalThis.crypto?.getRandomValues === 'function');

    const outputs = {
        'pub-fp': 'fingerprint',
        'pub-openssh': 'openssh',
        pub: 'publicPEM',
        priv: 'privatePEM'
    };
    const copies = {
        'copy-fp': 'fingerprint',
        'copy-openssh': 'openssh',
        'copy-public': 'publicPEM',
        'copy-private': 'privatePEM'
    };
    const downloads = {
        dlPub: 'publicPEM',
        dlPubOpenSSH: 'openssh',
        dlPriv: 'privatePEM',
        dlPrivPpk: 'ppk'
    };

    const { reset: resetCopy, show: showCopied } = createCopyFeedback(window);

    let result = null;
    let busy = false;
    let revision = 0;

    function showError(message){
        error.textContent = message;
        error.hidden = false;

        error.focus({ preventScroll: true });
    }

    function clearError(){
        error.hidden = true;
        error.textContent = '';

        passphrase.removeAttribute('aria-invalid');
        confirmation.removeAttribute('aria-invalid');
    }

    function clearResults(){
        revision++;

        result = null;

        Object.keys(outputs).forEach((id) => {
            get(id).textContent = '';
        });
        Object.keys(copies).forEach((id) => {
            get(id).disabled = true;

            resetCopy(get(id));
        });
        Object.keys(downloads).forEach((id) => {
            get(id).disabled = true;
        });

        get('keygen-empty').hidden = false;
        get('keygen-results').hidden = true;
        get('private-key-details').open = false;

        status.textContent = '';
        progress.value = 0;
    }

    const collector = initializePointerCollector(document, () => {
        updateButton();

        generateFromForm();
    }, showError);

    function updateButton(){
        button.disabled = (!runtimeReady || busy || (sampling.checked && collector.selectionIndex < 0));
    }

    function updateMode(){
        const groups = {
            RSA: 'rsa-length-radio',
            EdDSA: 'eddsa-length-radio',
            ECDSA: 'ecdsa-nist-radio'
        };

        for(const [name, id] of Object.entries(groups)){
            const algo = algorithm.value;

            get(id).hidden = (algo !== name);
            get(id).disabled = (algo !== name);
        }

        get('passphrase-field').hidden = (!passEnabled.checked);
        get('passphrase-field').disabled = (!passEnabled.checked);

        const custom = (rootQuery('[name="enc-type"]:checked')?.value === 'cc20p1305');

        get('custom-format-warning').hidden = (!passEnabled.checked || !custom);
        get('guri2-field').hidden = (!sampling.checked);

        updateButton();
    }

    for(const toggle of querySelAll('[data-toggle-passphrase]', root)){
        toggle.addEventListener('click', () => {
            const input = get(toggle.dataset.togglePassphrase);
            const show = (input.type === 'password');

            input.type = (show) ? 'text' : 'password';
            toggle.textContent = (show) ? 'Hide' : 'Show';

            toggle.setAttribute('aria-pressed', String(show));
        });
    }

    settings.addEventListener('input', () => {
        clearResults();
        clearError();
    });
    settings.addEventListener('change', (event) => {
        clearResults();
        clearError();

        if(event.target === sampling){
            collector.reset(sampling.checked);
        }

        if(event.target === passEnabled && !passEnabled.checked){
            passphrase.value = '';
            confirmation.value = '';

            for(const toggle of querySelAll('[data-toggle-passphrase]', root)){
                get(toggle.dataset.togglePassphrase).type = 'password';

                toggle.textContent = 'Show';

                toggle.setAttribute('aria-pressed', 'false');
            }
        }

        updateMode();
    });

    reset.addEventListener('click', () => {
        if(busy){
            return;
        }

        clearResults();
        clearError();

        passEnabled.checked = false;
        passphrase.value = '';
        confirmation.value = '';

        for(const toggle of querySelAll('[data-toggle-passphrase]', root)){
            get(toggle.dataset.togglePassphrase).type = 'password';

            toggle.textContent = 'Show';

            toggle.setAttribute('aria-pressed', 'false');
        }

        collector.reset(sampling.checked);

        updateMode();

        if(!runtimeReady){
            showError('Web Crypto is unavailable. Use a supported browser over HTTPS or localhost.');
        }
    });

    async function generateFromForm(){
        if(busy || !runtimeReady || (sampling.checked && collector.selectionIndex < 0)){
            return;
        }

        clearError();
        clearResults();

        if(passEnabled.checked && (!passphrase.value || passphrase.value !== confirmation.value)){
            const invalid = (!passphrase.value) ? passphrase : confirmation;

            invalid.setAttribute('aria-invalid', 'true');

            showError(!passphrase.value ? 'Enter a non-empty passphrase.' : 'Passphrases do not match.');

            return;
        }

        const options = {
            algorithm: algorithm.value,
            length: Number(rootQuery('[name="rsalen"]:checked').value),
            curve: (algorithm.value === 'ECDSA') ? rootQuery('[name="nist"]:checked').value : rootQuery('[name="edval"]:checked').value,
            comment: get('comment').value,
            encryption: (passEnabled.checked) ? rootQuery('[name="enc-type"]:checked').value : 'none',
            passphrase: (passEnabled.checked) ? passphrase.value : '',
            selectionIndex: (sampling.checked) ? collector.selectionIndex : -1
        };

        try{
            validateKeyOptions(options);
        } catch(e){
            showError(e.message);

            return;
        }

        const generation = revision;

        busy = true;
        settings.disabled = reset.disabled = true;

        updateButton();

        root.setAttribute('aria-busy', 'true');

        querySel('[data-label]', button).textContent = 'Generating…';

        status.textContent = 'Generating key pair and output formats…';

        try{
            // 生成前に画面へ処理中状態を反映
            await new Promise((resolve) => window.setTimeout(resolve, 0));

            const generated = await generate(options, (done, total) => {
                if(generation === revision){
                    progress.value = done / total;
                }
            });

            if(generation !== revision) {
                return;
            }

            result = generated;

            for(const [id, property] of Object.entries(outputs)){
                get(id).textContent = result[property];
            }

            Object.keys(copies).forEach((id) => {
                get(id).disabled = false;
            });
            Object.keys(downloads).forEach((id) => {
                get(id).disabled = false;
            });

            get('keygen-empty').hidden = true;
            get('keygen-results').hidden = false;

            progress.value = 1;
            passphrase.value = confirmation.value = '';
            status.textContent = 'Key pair generated. Copy or download your keys, then store the private key securely.';
        } catch(e){
            if(generation !== revision){
                return;
            }

            clearResults();

            showError('Key generation failed. Check browser support and your settings, then try again.');
        } finally{
            busy = false;

            options.passphrase = '';
            settings.disabled = (!runtimeReady);
            reset.disabled = false;

            updateMode();

            root.setAttribute('aria-busy', 'false');

            querySel('[data-label]', button).textContent = 'Generate Key Pair';
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        generateFromForm();
    });

    for(const [id, property] of Object.entries(copies)){
        const copy = get(id);

        bindCopyButton(copy, {
            document,
            read: () => result,
            getText: (snapshot) => snapshot[property],
            onSuccess(){
                showCopied(copy);

                status.textContent = 'Copied to clipboard.';
            },
            onError(){
                status.textContent = 'Copy failed. Select the text and copy it manually.';
            }
        });
    }

    for(const [id, property] of Object.entries(downloads)){
        get(id).addEventListener('click', () => {
            if(!result || get(id).disabled){
                return;
            }

            const filenames = {
                publicPEM: `${result.filenameStem}.pub.pem`,
                openssh: 'authorized_keys',
                privatePEM: `${result.filenameStem}.pem`,
                ppk: `${result.filenameStem}.ppk`
            };

            try{
                downloadText(result[property], filenames[property], document);

                status.textContent = 'Download started.';
            } catch(e){
                status.textContent = 'Download failed. Copy the text instead.';
            }
        });
    }

    clearResults();
    updateMode();

    if(!runtimeReady){
        settings.disabled = true;

        showError('Web Crypto is unavailable. Use a supported browser over HTTPS or localhost.');
    }
}

if(typeof document !== 'undefined'){
    initializeKeygen(document);
}
