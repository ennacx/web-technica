import {
    OPTION, SYMBOL, SYMBOL_ZEN, MISLEAD_SYMBOLS,
    PWD_LEN_MIN, PWD_LEN_MAX, PWD_BULK_MAX,
    ENTROPY_STRENGTH, validation, passwordGenerate, bulkPasswordGenerate,
    uuidGenerate, bulkUuidGenerate
} from './pwdgen.js';

import { getById, querySel } from "#utils/dom.js";
import { numberFormat } from "#utils/format.js";
import { copyText } from "#utils/clipboard.js";
import { downloadText } from "#utils/download.js";

// UI state stays in memory. Generated values never enter storage, URLs, or logs.
export function initializePwdgen(document){
    const root = document.querySelector('[data-pwdgen]');
    if (!root || root.dataset.ready) {
        return;
    }

    root.dataset.ready = 'true';

    const window = document.defaultView;
    const get = (id) => getById(id, document);

    const form = get('pwdgen-form');
    const settings = get('pwdgen-settings');
    const length = get('pwd_len_input');
    const slider = get('pwd_len_slider');
    const types = ['alpha_u', 'alpha_l', 'num', 'symbol'].map(get);
    const hex = get('hex');
    const uuid = get('uuid');
    const unique = get('unique');
    const mislead = get('mislead');
    const ignored = get('ignore_symbols');
    const cryptRadio = get('algorithm_crypt');
    const mathRadio = get('algorithm_math');
    const error = get('validation-error');
    const count = get('batch-count');
    const preset = get('batch-preset');
    const batch = get('bulk-passwords');
    const singleCopy = get('password-copy');
    const batchCopy = get('batch-copy');
    const download = get('batch-download');
    const generateButtons = ['generate', 'generate-multiple', 'batch-generate'].map(get);

    const cryptoReady = (typeof globalThis.crypto?.getRandomValues === 'function');

    let currentPassword = '';
    let busy = false;

    const copyTimers = new Map();

    get('symbol-samples').textContent = SYMBOL;
    get('mislead-samples').textContent = `(${MISLEAD_SYMBOLS.split('').join(', ')})`;
    get('crypto-unavailable').hidden = cryptoReady;

    function updateRange(){
        slider.value = length.value;
        const progress = (Number(slider.value) - PWD_LEN_MIN) / (PWD_LEN_MAX - PWD_LEN_MIN) * 100;
        slider.style.setProperty('--range-progress', `${progress}%`);
    }

    function updateMode(){
        const uuidMode = uuid.checked;

        slider.disabled = uuidMode;
        length.readOnly = uuidMode;
        unique.disabled = uuidMode;
        mislead.disabled = (uuidMode || hex.checked);
        cryptRadio.disabled = uuidMode || !cryptoReady;
        mathRadio.disabled = uuidMode;

        uuid.disabled = (typeof globalThis.crypto?.randomUUID !== 'function');
        if(uuidMode){
            length.value = '36';
            unique.checked = false;
            mislead.checked = false;
            cryptRadio.checked = true;
        }

        get('symbol-info').hidden = (!get('symbol').checked || hex.checked || uuidMode);
        get('algorithm-warning').hidden = !mathRadio.checked;

        updateRange();
    }

    function restoreDefaults(){
        types.forEach((input, index) => { input.checked = (index < 3); });
    }

    // 文字種
    types.forEach((input) => input.addEventListener('change', () => {
        if(input.checked){
            hex.checked = false;
            uuid.checked = false;
        }

        updateMode();
    }));

    // 16進数
    hex.addEventListener('change', () => {
        if(hex.checked){
            uuid.checked = false;
            types.forEach((input) => { input.checked = false; });
            mislead.checked = false;
        } else{
            restoreDefaults();
        }

        updateMode();
    });

    // UUID
    uuid.addEventListener('change', () => {
        if(uuid.checked){
            hex.checked = false;
            types.forEach((input) => { input.checked = false; });
        } else{
            restoreDefaults();
        }

        updateMode();
    });

    // アルゴリズム選択
    [cryptRadio, mathRadio].forEach((input) => input.addEventListener('change', updateMode));

    slider.addEventListener('input', () => {
        length.value = slider.value;

        updateRange();
    });

    length.addEventListener('input', updateRange);
    length.addEventListener('change', () => {
        if(length.value !== '' && Number.isFinite(Number(length.value))){
            length.value = String(Math.max(PWD_LEN_MIN, Math.min(PWD_LEN_MAX, Math.trunc(Number(length.value)))));
        }

        updateRange();
    });

    function normalizeSymbols(){
        const fullWidth = Array.from(SYMBOL_ZEN);
        const symbols = Array.from(SYMBOL);

        ignored.value = [...new Set(Array
            .from(ignored.value, (character) => {
                const index = fullWidth.indexOf(character);

                return (index >= 0) ? symbols[index] : character;
            })
            .filter((character) => SYMBOL.includes(character))
        )].join('');
    }

    ignored.addEventListener('change', normalizeSymbols);

    function readOptions(){
        normalizeSymbols();

        return {
            ...OPTION,
            length: Number(length.value),
            use_type: (uuid.checked) ? 'uuid' : ((hex.checked) ? 'hex' : 'default'),
            alpha_u: get('alpha_u').checked,
            alpha_l: get('alpha_l').checked,
            numeric: get('num').checked,
            symbol: get('symbol').checked,
            hex: hex.checked,
            uuid: uuid.checked,
            unique: unique.checked,
            mislead: mislead.checked,
            algorithm: (mathRadio.checked) ? 'math' : 'crypt',
            ignore_symbols: ignored.value
        };
    }

    function showError(message){
        error.textContent = message;
        error.hidden = false;
        error.focus({ preventScroll: true });
    }
    function clearError(){
        error.hidden = true;
        error.textContent = '';
    }

    function resetCopy(button){
        window.clearTimeout(copyTimers.get(button));

        querySel('[data-icon-copy]', button).hidden = false;
        querySel('[data-icon-check]', button).hidden = true;
    }

    function clearSingle(){
        currentPassword = '';

        get('generate-password').textContent = '';
        get('generate-result').hidden = true;
        get('single-empty').hidden = false;

        singleCopy.disabled = true;

        resetCopy(singleCopy);

        get('single-status').textContent = '';
    }

    function showSingle(result, options) {
        currentPassword = result.password;
        get('generate-result').hidden = false;
        get('single-empty').hidden = true;

        get('generate-password').textContent = result.password;
        get('result-length').textContent = numberFormat(result.length);
        get('entropy-value').textContent = numberFormat(result.entropy);
        get('charset-size').textContent = numberFormat(result.charset_size);
        get('gen-ms-value').textContent = numberFormat(result.generate_time);

        const level = (options.algorithm === 'math') ? 'Not secure (Math)' : ENTROPY_STRENGTH.getLabel(result.entropy);
        const strength = (options.algorithm === 'math') ? 'danger' : ENTROPY_STRENGTH.getBarClass(result.entropy);

        get('entropy-label').textContent = level;
        get('entropy-label').dataset.strength = strength;

        const meter = get('entropy-meter');
        meter.setAttribute('aria-valuenow', Math.min(result.entropy, 128));
        meter.setAttribute('aria-valuetext', `${numberFormat(result.entropy)} bits; ${level}`);

        get('entropy-bar').style.width = `${Math.min(result.entropy / 128, 1) * 100}%`;
        get('entropy-bar').dataset.strength = strength;

        resetCopy(singleCopy);

        singleCopy.disabled = false;

        get('single-status').textContent = `${(options.uuid) ? 'UUID' : 'Password'} generated. Length: ${result.length}.`;
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        if(busy){
            return;
        }

        clearError();

        const options = readOptions();
        const message = validation(options);

        if(message){
            clearSingle();
            showError(message);

            return;
        }

        try{
            const result = (options.uuid) ? uuidGenerate() : passwordGenerate(options);
            if(!result){
                throw new Error('Generation failed');
            }

            showSingle(result, options);
        } catch(e){
            clearSingle();
            showError('Generation failed. Web Crypto may be unavailable or blocked. Review your options and try again.');
        }
    });

    function clearBatch(){
        batch.value = '';
        batchCopy.disabled = true;
        download.disabled = true;

        get('bulk-stats').hidden = true;

        resetCopy(batchCopy);
    }

    async function generateBatch(){
        if(busy){
            return;
        }

        clearError();

        const options = readOptions();
        const quantity = Number(count.value);
        const message = validation(options);

        if (message || !Number.isInteger(quantity) || quantity < 1 || quantity > PWD_BULK_MAX){
            clearBatch();

            get('bulk-status').textContent = '';
            showError(message || 'Quantity must be a whole number between 1 and 10,000.');

            return;
        }

        busy = true;

        settings.disabled = true;
        count.disabled = preset.disabled = true;

        generateButtons.forEach((button) => { button.disabled = true; });

        get('batch-section').setAttribute('aria-busy', 'true');

        clearBatch();

        get('bulk-status').textContent = `Generating ${numberFormat(quantity)} results…`;

        try{
            const passwords = [];

            let elapsed = 0;
            let entropy = 0;

            while(passwords.length < quantity){
                // Yield between chunks so a large batch does not lock the page.
                await new Promise((resolve) => window.setTimeout(resolve, 0));

                const size = Math.min(100, quantity - passwords.length);
                const results = options.uuid ? bulkUuidGenerate(size) : bulkPasswordGenerate(options, size);

                if(!results){
                    throw new Error('Generation failed');
                }

                for(const result of results){
                    passwords.push(result.password);

                    elapsed += result.generate_time;
                    entropy = result.entropy;
                }
            }

            batch.value = passwords.join('\n');

            get('bulk-stats').textContent = `${numberFormat(quantity)} results · ${numberFormat(entropy)} bits per result · ${numberFormat(elapsed)} ms generation time${options.algorithm === 'math' ? ' · Not secure (Math)' : ''}`;
            get('bulk-stats').hidden = false;

            batchCopy.disabled = download.disabled = false;

            get('bulk-status').textContent = `${numberFormat(quantity)} results generated. Ready to copy or download.`;
        } catch(e){
            clearBatch();

            get('bulk-status').textContent = 'Batch generation failed.';
            showError('Batch generation failed. Review your options and try again.');
        } finally{
            busy = false;
            settings.disabled = false;
            count.disabled = preset.disabled = false;

            generateButtons.forEach((button) => { button.disabled = false; });

            get('batch-section').setAttribute('aria-busy', 'false');

            updateMode();
        }
    }

    get('generate-multiple').addEventListener('click', generateBatch);
    get('batch-generate').addEventListener('click', generateBatch);

    preset.addEventListener('change', () => {
        if(preset.value){
            count.value = preset.value;
        }
    });
    count.addEventListener('input', () => { preset.value = ''; });

    function bindCopy(button, getText, status, message){
        button.addEventListener('click', async () => {
            if(button.disabled || !getText()){
                return;
            }

            const copiedText = getText();

            try{
                await copyText(copiedText, document);

                // A new generation may finish while clipboard permission is pending.
                if(copiedText === getText()){
                    resetCopy(button);

                    button.querySelector('[data-icon-copy]').hidden = true;
                    button.querySelector('[data-icon-check]').hidden = false;

                    copyTimers.set(button, window.setTimeout(() => resetCopy(button), 2000));

                    status.textContent = message;
                }
            } catch(e){
                status.textContent = 'Copy failed. Select the text and copy it manually.';
            }
        });
    }

    bindCopy(singleCopy, () => currentPassword, get('single-status'), 'Password copied.');
    bindCopy(batchCopy, () => batch.value, get('bulk-status'), 'All results copied.');

    download.addEventListener('click', () => {
        if(download.disabled || !batch.value){
            return;
        }

        try{
            downloadText(batch.value, `passwords_${batch.value.split('\n').length}.txt`, document);

            get('bulk-status').textContent = 'Download started.';
        } catch(e){
            get('bulk-status').textContent = 'Download failed. Copy the results instead.';
        }
    });

    updateMode();
}

if(typeof document !== 'undefined'){
    initializePwdgen(document);
}
