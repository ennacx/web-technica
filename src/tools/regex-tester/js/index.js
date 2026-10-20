import { getById, querySelAll, create as kreate } from '#utils/dom.js';
import { setupSplitPane } from './split-pane.js';

const get = (name) => getById(`regex-${name}`, document);
const create = (tag) => kreate(tag, document);

const pattern = get('pattern');
const text = get('text');

const initialPattern = pattern.value;
const initialText = text.value;
const flags = [...querySelAll('.regex-flags input', document)];

let view = 'matches';
let sampleVisible = true;

// Fixture data only. No user-supplied regular expression is executed by this mockup.
const samples = [
    { value: 'alice@example.com', name: 'alice', domain: 'example.com' },
    { value: 'bob@web-technica.dev', name: 'bob', domain: 'web-technica.dev' },
    { value: 'support@example.org', name: 'support', domain: 'example.org' }
];

for(const [index, match] of samples.entries()){
    const card = create('details');
    card.className = 'regex-match';
    card.open = (index === 0);

    const summary = create('summary');

    const value = create('code');
    value.textContent = match.value;

    const position = create('span');
    position.className = 'field-help';

    const start = initialText.indexOf(match.value);

    position.textContent = `${start}–${start + match.value.length}`;

    summary.append(`Match ${index + 1}`, value, position);

    const groups = document.createElement('dl');

    for(const [label, content] of [['Group 1 · name', match.name], ['Group 2 · domain', match.domain]]){
        const key = document.createElement('dt');
        const entry = document.createElement('dd');

        key.textContent = label;
        entry.textContent = content;
        groups.append(key, entry);
    }

    card.append(summary, groups);

    get('matches').append(card);
}

function renderView(){
    for(const name of ['matches', 'preview']){
        get(name).hidden = (!sampleVisible || name !== view);
        get(`${name}-tab`).setAttribute('aria-pressed', String(name === view));
    }

    get('results-empty').hidden = (sampleVisible);
}

function updateStats(){
    get('text-stats').textContent = `${text.value.length} characters · ${text.value.split('\n').length} lines`;
}

function edited(){
    sampleVisible = false;

    get('match-count').textContent = 'Not run';
    get('status').textContent = 'Input changed · Not run.';
    get('flags-summary').textContent = flags.filter((flag) => flag.checked).map((flag) => flag.value).join('');

    updateStats();

    renderView();
}

pattern.addEventListener('input', edited);
text.addEventListener('input', edited);

flags.forEach((flag) => flag.addEventListener('change', edited));

for(const name of ['matches', 'preview']){
    get(`${name}-tab`).addEventListener('click', () => {
        view = name;

        renderView();
    });
}

get('sample').addEventListener('click', () => {
    pattern.value = initialPattern;
    text.value = initialText;

    flags.forEach((flag) => {
        flag.checked = (flag.value === 'g' || flag.value === 'i');
    });

    sampleVisible = true;

    get('flags-summary').textContent = 'gi';
    get('match-count').textContent = '3 matches';
    get('status').textContent = '3 matches · 2 named groups per match.';

    updateStats();

    renderView();
});

setupSplitPane(get('workspace'), get('splitter'), get('reset-layout'));

updateStats();

renderView();
