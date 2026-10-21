import { getById, querySelAll } from '#utils/dom.js';
import { lineCount } from '#utils/text.js';
import { bindCopyButton } from '#components/copy-button.js';
import { createNotice } from '#components/notice.js';
import { setupSplitPane } from '#components/split-pane.js';
import { createExecutionController } from './controller.js';
import { createRenderer } from './render.js';
import { LIMITS, normalizeTimeoutMs } from './result.js';

const get = (name) => getById(`regex-${name}`, document);

const pattern = get('pattern');
const text = get('text');
const mode = get('mode');
const run = get('run');
const timeout = get('timeout');
const copy = get('copy');

const copyNotice = createNotice(get('copy-status'), {
    container: get('copy-notice'),
    dismiss: get('copy-dismiss'),
    focusTarget: copy
});

timeout.min = String(LIMITS.timeoutMinMs);
timeout.max = String(LIMITS.timeoutMaxMs);
timeout.step = String(LIMITS.timeoutStepMs);
timeout.value = String(LIMITS.timeoutDefaultMs);
timeout.disabled = false;

function updateTimeoutLabel(){
    const seconds = (normalizeTimeoutMs(Number(timeout.value)) / 1000).toFixed(1);

    get('timeout-value').textContent = `${seconds} s`;

    timeout.setAttribute('aria-valuetext', `${seconds} seconds`);
}

updateTimeoutLabel();

const flags = [...querySelAll('.regex-flags input', document)];
const sample = {
    pattern: String.raw`(?<name>[\w.+-]+)@(?<domain>[\w.-]+\.[a-z]{2,})`,
    text: [
        'Contact the team:',
        '  alice@example.com — Product',
        '  bob@web-technica.dev — Engineering',
        '  support@example.org — Support'
    ].join('\n'),
    flags: 'gi'
};

let composing = false;
let copying = false;
let inputRevision = 0;

const renderer = createRenderer(document);
const controller = createExecutionController({
    onState(state){
        mode.value = state.mode;
        renderer.render(state);
    }
});

// テキストエリア内でのハイライト同期
text.addEventListener('scroll', () => renderer.syncHighlight());
new ResizeObserver(() => renderer.syncHighlight()).observe(text);

function readInput(){
    return {
        engine: 'javascript',
        pattern: pattern.value,
        text: text.value,
        flags: flags.filter((flag) => (flag.checked)).map((flag) => flag.value).join(''),
        mode: mode.value,
        timeoutMs: normalizeTimeoutMs(Number(timeout.value))
    };
}

function inputChanged(){
    const snapshot = readInput();

    run.disabled = (composing || snapshot.pattern === '' || snapshot.text === '');
    copy.disabled = (composing || copying || snapshot.pattern === '');

    ++inputRevision;

    copyNotice.clear();

    get('flags-summary').textContent = snapshot.flags;
    get('text-stats').textContent = [
        `${snapshot.text.length} characters`,
        `${lineCount(snapshot.text)} lines`
    ].join(' · ');

    controller.update(snapshot, { composing });
}

for(const element of [pattern, text]){
    element.addEventListener('input', inputChanged);
    element.addEventListener('compositionstart', () => {
        composing = true;

        inputChanged();
    });

    element.addEventListener('compositionend', () => {
        composing = false;

        inputChanged();
    });
}

flags.forEach((flag) => flag.addEventListener('change', inputChanged));

mode.addEventListener('change', inputChanged);

timeout.addEventListener('input', updateTimeoutLabel);

timeout.addEventListener('change', () => {
    updateTimeoutLabel();
    inputChanged();
});

run.addEventListener('click', () => {
    if(!composing && !run.disabled){
        controller.run(readInput());
    }
});

bindCopyButton(copy, {
    document,
    read: () => ({ ...readInput(), revision: inputRevision }),
    getText: (snapshot) => `/${snapshot.pattern}/${snapshot.flags}`,
    isCurrent: (snapshot) => snapshot.revision === inputRevision,
    onStart(){
        copying = true;
        copy.disabled = true;
        copyNotice.show('');
    },
    onSuccess(){
        copyNotice.show('Regular expression copied.', 'success');
    },
    onError(){
        copyNotice.show('Copy failed. Check clipboard permissions and try again.', 'error');
    },
    onSettled(){
        copying = false;
        copy.disabled = (composing || pattern.value === '');
    }
});

get('sample').addEventListener('click', () => {
    pattern.value = sample.pattern;
    text.value = sample.text;

    flags.forEach((flag) => {
        flag.checked = (sample.flags.includes(flag.value));
    });

    inputChanged();
});

setupSplitPane(get('workspace'), get('splitter'), get('reset-layout'));
setupSplitPane(get('workspace'), get('results-splitter'), get('reset-layout'), {
    pane: get('results-pane'),
    name: 'results',
    label: 'Match results'
});

window.addEventListener('pagehide', () => controller.cancel());

window.addEventListener('pageshow', (event) => {
    if(event.persisted){
        inputChanged();
    }
});

inputChanged();
