import { getById, querySelAll } from '#utils/dom.js';
import { setupSplitPane } from './split-pane.js';
import { createExecutionController } from './controller.js';
import { createRenderer } from './render.js';

const get = (name) => getById(`regex-${name}`, document);

const pattern = get('pattern');
const text = get('text');
const mode = get('mode');
const run = get('run');

const flags = [...querySelAll('.regex-flags input', document)];
const sample = {
    pattern: pattern.value,
    text: text.value,
    flags: flags.map((flag) => (flag.checked))
};

let composing = false;

const renderer = createRenderer(document);
const controller = createExecutionController({
    onState(state){
        mode.value = state.mode;
        renderer.render(state);
    }
});

function readInput(){
    return {
        engine: 'javascript',
        pattern: pattern.value,
        text: text.value,
        flags: flags.filter((flag) => (flag.checked)).map((flag) => flag.value).join(''),
        mode: mode.value
    };
}

function inputChanged(){
    const snapshot = readInput();

    get('flags-summary').textContent = snapshot.flags;
    get('text-stats').textContent = `${snapshot.text.length} characters · ${snapshot.text.split('\n').length} lines`;

    controller.update(snapshot, { composing });
}

for(const element of [pattern, text]){
    element.addEventListener('input', inputChanged);
    element.addEventListener('compositionstart', () => {
        composing = true;
        run.disabled = true;

        inputChanged();
    });

    element.addEventListener('compositionend', () => {
        composing = false;
        run.disabled = false;

        inputChanged();
    });
}

flags.forEach((flag) => flag.addEventListener('change', inputChanged));

mode.addEventListener('change', inputChanged);

run.addEventListener('click', () => {
    if(!composing){
        controller.run(readInput());
    }
});

get('sample').addEventListener('click', () => {
    pattern.value = sample.pattern;
    text.value = sample.text;

    flags.forEach((flag, i) => {
        flag.checked = sample.flags[i];
    });

    inputChanged();
});

setupSplitPane(get('workspace'), get('splitter'), get('reset-layout'));

window.addEventListener('pagehide', () => controller.cancel());

window.addEventListener('pageshow', (event) => {
    if(event.persisted){
        inputChanged();
    }
});

inputChanged();
