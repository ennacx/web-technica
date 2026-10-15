import {
    OPTION, SYMBOL, SYMBOL_ZEN, MISLEAD_SYMBOLS,
    PWD_LEN_MIN, PWD_LEN_MAX, PWD_BULK_MAX,
    ENTROPY_STRENGTH, validation, passwordGenerate, bulkPasswordGenerate,
    uuidGenerate, bulkUuidGenerate
} from './pwdgen.js';

import { getById as gbi, querySel } from "#utils/dom.js";
import { numberFormat } from "#utils/format.js";

// UI state stays in memory. Generated values never enter storage, URLs, or logs.
export function initializePwdgen(document){
    const root = document.querySelector('[data-pwdgen]');
    if (!root || root.dataset.ready) {
        return;
    }

    root.dataset.ready = 'true';

    const window = document.defaultView;
    const getById = (id) => gbi(id, document);

    const form = getById('pwdgen-form');
    const settings = getById('pwdgen-settings');
    const length = getById('pwd_len_input');
    const slider = getById('pwd_len_slider');
    const types = ['alpha_u', 'alpha_l', 'num', 'symbol'].map((v) => getById(v));
    const hex = getById('hex');
    const uuid = getById('uuid');
    const unique = getById('unique');
    const mislead = getById('mislead');
    const ignored = getById('ignore_symbols');
    const cryptRadio = getById('algorithm_crypt');
    const mathRadio = getById('algorithm_math');
    const error = getById('validation-error');
    const count = getById('batch-count');
    const preset = getById('batch-preset');
    const batch = getById('bulk-passwords');
    const singleCopy = getById('password-copy');
    const batchCopy = getById('batch-copy');
    const download = getById('batch-download');
    const generateButtons = ['generate', 'generate-multiple', 'batch-generate'].map((v) => getById(v));

    const cryptoReady = (typeof globalThis.crypto?.getRandomValues === 'function');

    let currentPassword = '';
    let busy = false;

    const copyTimers = new Map();

    getById('symbol-samples').textContent = SYMBOL;
    getById('mislead-samples').textContent = `(${MISLEAD_SYMBOLS.split('').join(', ')})`;
    getById('crypto-unavailable').hidden = cryptoReady;

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

        getById('symbol-info').hidden = (!getById('symbol').checked || hex.checked || uuidMode);
        getById('algorithm-warning').hidden = !mathRadio.checked;

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
            alpha_u: getById('alpha_u').checked,
            alpha_l: getById('alpha_l').checked,
            numeric: getById('num').checked,
            symbol: getById('symbol').checked,
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

        getById('generate-password').textContent = '';
        getById('generate-result').hidden = true;
        getById('single-empty').hidden = false;

        singleCopy.disabled = true;

        resetCopy(singleCopy);

        getById('single-status').textContent = '';
    }

    function showSingle(result, options) {
        currentPassword = result.password;
        getById('generate-result').hidden = false;
        getById('single-empty').hidden = true;

        getById('generate-password').textContent = result.password;
        getById('result-length').textContent = numberFormat(result.length);
        getById('entropy-value').textContent = numberFormat(result.entropy);
        getById('charset-size').textContent = numberFormat(result.charset_size);
        getById('gen-ms-value').textContent = numberFormat(result.generate_time);

        const level = (options.algorithm === 'math') ? 'Not secure (Math)' : ENTROPY_STRENGTH.getLabel(result.entropy);
        const strength = (options.algorithm === 'math') ? 'danger' : ENTROPY_STRENGTH.getBarClass(result.entropy);

        getById('entropy-label').textContent = level;
        getById('entropy-label').dataset.strength = strength;

        const meter = getById('entropy-meter');
        meter.setAttribute('aria-valuenow', Math.min(result.entropy, 128));
        meter.setAttribute('aria-valuetext', `${numberFormat(result.entropy)} bits; ${level}`);

        getById('entropy-bar').style.width = `${Math.min(result.entropy / 128, 1) * 100}%`;
        getById('entropy-bar').dataset.strength = strength;

        resetCopy(singleCopy);

        singleCopy.disabled = false;

        getById('single-status').textContent = `${(options.uuid) ? 'UUID' : 'Password'} generated. Length: ${result.length}.`;
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

        getById('bulk-stats').hidden = true;

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

            getById('bulk-status').textContent = '';
            showError(message || 'Quantity must be a whole number between 1 and 10,000.');

            return;
        }

        busy = true;

        settings.disabled = true;
        count.disabled = preset.disabled = true;

        generateButtons.forEach((button) => { button.disabled = true; });

        getById('batch-section').setAttribute('aria-busy', 'true');

        clearBatch();

        getById('bulk-status').textContent = `Generating ${numberFormat(quantity)} results…`;

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

            getById('bulk-stats').textContent = `${numberFormat(quantity)} results · ${numberFormat(entropy)} bits per result · ${numberFormat(elapsed)} ms generation time${options.algorithm === 'math' ? ' · Not secure (Math)' : ''}`;
            getById('bulk-stats').hidden = false;

            batchCopy.disabled = download.disabled = false;

            getById('bulk-status').textContent = `${numberFormat(quantity)} results generated. Ready to copy or download.`;
        } catch(e){
            clearBatch();

            getById('bulk-status').textContent = 'Batch generation failed.';
            showError('Batch generation failed. Review your options and try again.');
        } finally{
            busy = false;
            settings.disabled = false;
            count.disabled = preset.disabled = false;

            generateButtons.forEach((button) => { button.disabled = false; });

            getById('batch-section').setAttribute('aria-busy', 'false');

            updateMode();
        }
    }

    getById('generate-multiple').addEventListener('click', generateBatch);
    getById('batch-generate').addEventListener('click', generateBatch);

    preset.addEventListener('change', () => {
        if(preset.value){
            count.value = preset.value;
        }
    });
    count.addEventListener('input', () => { preset.value = ''; });

    async function copyText(text){
        if(window.navigator.clipboard && window.isSecureContext){
            await window.navigator.clipboard.writeText(text);
            return;
        }

        const focused = document.activeElement;
        const textarea = document.createElement('textarea');

        textarea.className = 'visually-hidden';
        textarea.value = text;
        textarea.readOnly = true;

        document.body.append(textarea);

        try{
            textarea.focus();
            textarea.select();

            if(typeof document.execCommand !== 'function' || !document.execCommand('copy')){
                throw new Error('Copy unavailable');
            }
        } finally{
            textarea.remove();
            focused?.focus({ preventScroll: true });
        }
    }

    function bindCopy(button, getText, status, message){
        button.addEventListener('click', async () => {
            if(button.disabled || !getText()){
                return;
            }

            const copiedText = getText();

            try{
                await copyText(copiedText);

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

    bindCopy(singleCopy, () => currentPassword, getById('single-status'), 'Password copied.');
    bindCopy(batchCopy, () => batch.value, getById('bulk-status'), 'All results copied.');

    download.addEventListener('click', () => {
        if(download.disabled || !batch.value){
            return;
        }

        let url;

        const anchor = document.createElement('a');

        try{
            const blob = new window.Blob([batch.value], { type: 'text/plain;charset=utf-8' });
            url = window.URL.createObjectURL(blob);
            anchor.href = url;
            anchor.download = `passwords_${batch.value.split('\n').length}.txt`;
            document.body.append(anchor);
            anchor.click();

            getById('bulk-status').textContent = 'Download started.';
        } catch(e){
            getById('bulk-status').textContent = 'Download failed. Copy the results instead.';
        } finally{
            anchor.remove();

            if(url){
                window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            }
        }
    });

    updateMode();
}

if(typeof document !== 'undefined'){
    initializePwdgen(document);
}
