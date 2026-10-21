import './helpers/register-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeJavaScript } from '../src/tools/regex-tester/js/engines/javascript.js';
import { LIMITS, failure } from '../src/tools/regex-tester/js/result.js';

const { createRenderer } = await import('../src/tools/regex-tester/js/render.js');

// DOM double checks event wiring, safe text insertion and bounded rendering.
// It does not substitute for browser layout / touch / assistive-technology checks.
function fixture(){
    class Element {
        constructor(tag){
            Object.assign(this, { tag, children: [], listeners: {}, attributes: {}, dataset: {}, value: '', checked: false,
                clientWidth: 320, clientHeight: 180, scrollTop: 0, scrollLeft: 0,
                style: { setProperty(name, value){ this[name] = value; } } });
        }
        set textContent(value){ this.children = [String(value)]; }
        get textContent(){ return this.children.map((node) => typeof node === 'string' ? node : node.textContent).join(''); }
        append(...nodes){ for(const node of nodes){ this.children.push(...(node.tag === 'fragment' ? node.children : [node])); } }
        replaceChildren(...nodes){ this.children = []; this.append(...nodes); }
        addEventListener(name, fn){ this.listeners[name] = fn; }
        fire(name){ return this.listeners[name]?.({ preventDefault(){} }); }
        focus(){}
        setAttribute(name, value){ this.attributes[name] = String(value); }
    }
    const template = readFileSync('src/tools/regex-tester/index.njk', 'utf8');
    const nodes = new Map([...template.matchAll(/<([a-z]+)\b[^>]*\bid="(regex-[^"]+)"/g)].map(([, tag, id]) => [id, new Element(tag)]));
    const created = [];
    const flags = ['g', 'i', 'm', 's', 'u'].map((value) => Object.assign(new Element('input'), { value, checked: value === 'g' || value === 'i' }));
    const root = {
        defaultView: { HTMLElement: Element, getComputedStyle: () => ({ getPropertyValue: () => '10' }) },
        getElementById: (id) => nodes.get(id),
        querySelectorAll: () => flags,
        createElement(tag){ const element = new Element(tag); created.push(element); return element; },
        createTextNode: (text) => String(text),
        createDocumentFragment: () => new Element('fragment')
    };
    const get = (name) => nodes.get('regex-' + name);
    get('mode').value = 'auto';
    return { root, get, created, flags };
}

test('renderer uses UTF-16 capture positions and text nodes, preserving hostile input literally', () => {
    const f = fixture();
    const renderer = createRenderer(f.root);
    const input = { requestId: 1, engine: 'javascript', pattern: '(?<tag><img[^>]+>)', text: '😀<img src=x onerror=alert(1)>', flags: 'g' };
    f.get('text').value = input.text;
    renderer.render({ status: 'success', input, result: executeJavaScript(input) });
    assert.match(f.get('matches').textContent, /Named · tag/);
    assert.match(f.get('matches').textContent, /\[2, 30\)/);
    assert.equal(f.get('highlight').textContent, input.text);
    assert.ok(!f.created.some((node) => node.tag === 'img'));
    assert.equal(f.get('matches').hidden, false);
    renderer.render({ status: 'scheduled', input, result: null });
    assert.equal(f.get('matches').children.length, 0);
    assert.equal(f.get('highlight').children.length, 0);
    assert.equal(f.get('text').value, input.text, 'clearing results never hides or changes native textarea text');
    assert.equal(f.get('match-count').textContent, 'Waiting…');
});

test('renderer marks zero-width matches and bounds match lists, captures and highlight text', () => {
    const f = fixture();
    const renderer = createRenderer(f.root);
    const empty = { engine: 'javascript', pattern: '(?<empty>)', text: '😀', flags: 'gu' };
    renderer.render({ status: 'success', input: empty, result: executeJavaScript(empty) });
    assert.equal(f.created.filter((node) => node.className === 'regex-zero-width').length, 2);
    assert.ok(f.created.filter((node) => node.className === 'regex-zero-width').every((node) => node.textContent === ''), 'zero-width marks insert no glyph or width');
    assert.equal(f.get('highlight').textContent, empty.text);
    const large = { engine: 'javascript', pattern: '()'.repeat(101), text: 'a'.repeat(200000), flags: 'g' };
    const result = executeJavaScript(large);
    renderer.render({ status: 'success', input: large, result });
    assert.ok(f.get('matches').children.length <= LIMITS.displayedMatches);
    assert.match(f.get('matches').textContent, /capture entries/);
    assert.match(f.get('status').textContent, /limit/);
    assert.equal(f.get('highlight').textContent, large.text, 'plain tail preserves scroll extents after highlight cap');
    assert.match(f.get('status').textContent, /first 100,000 UTF-16/);
    const lots = { engine: 'javascript', pattern: 'a', text: 'a'.repeat(200), flags: 'g' };
    renderer.render({ status: 'success', input: lots, result: executeJavaScript(lots) });
    assert.equal(f.get('matches').children.length, LIMITS.displayedMatches);
    assert.match(f.get('status').textContent, /first 100/);
});

test('overlay preserves tabs, Unicode, trailing lines, selection and viewport geometry across states', () => {
    const f = fixture();
    const renderer = createRenderer(f.root);
    const input = { requestId: 9, engine: 'javascript', pattern: '(?=B)|日本', text: '\t😀 B\n日本\n', flags: 'gu' };
    const textarea = f.get('text');
    textarea.value = input.text;
    textarea.selectionStart = 1;
    textarea.selectionEnd = 5;
    textarea.scrollTop = 32;
    textarea.scrollLeft = 64;
    renderer.render({ status: 'success', input, result: executeJavaScript(input) });
    assert.equal(f.get('highlight').textContent, input.text + '\u200b', 'trailing newline retains its final line box');
    assert.equal(f.get('highlight').scrollTop, 32);
    assert.equal(f.get('highlight').scrollLeft, 64);
    assert.equal(f.get('highlight').style.width, '320px');
    assert.equal(f.get('highlight').style.height, '180px');
    for(const status of ['idle', 'scheduled', 'running', 'syntax-error', 'timeout', 'input-limit']){
        renderer.render({ status, input, result: status.includes('error') || status === 'timeout' || status === 'input-limit' ? failure(input, status, status, 'Test error') : null });
        assert.equal(f.get('highlight').children.length, 0);
        assert.equal(textarea.value, input.text);
        assert.equal(textarea.selectionStart, 1);
        assert.equal(textarea.selectionEnd, 5);
    }
});

test('match palette cycles after ten and pairs card/overlay colors; capture rows use stable slots', () => {
    const f = fixture();
    const renderer = createRenderer(f.root);
    const input = { engine: 'javascript', pattern: '(?<first>a)(b)', text: 'ab '.repeat(12), flags: 'g' };
    renderer.render({ status: 'success', input, result: executeJavaScript(input) });
    const cards = f.get('matches').children;
    const marks = f.get('highlight').children.filter((node) => node?.tag === 'mark');
    const colors = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '1', '2'];
    assert.deepEqual(cards.map((node) => node.dataset.regexColor), colors);
    assert.deepEqual(marks.map((node) => node.dataset.regexColor), colors);
    for(const card of cards){
        const list = card.children.find((node) => node.tag === 'dl');
        assert.deepEqual(list.children.map((node) => node.dataset.regexColor), ['1', '1', '2', '2', '3', '3']);
        assert.match(card.textContent, /Group 1/);
        assert.match(card.textContent, /Named · first/);
    }
    const zero = { ...input, pattern: '(?=a)' };
    renderer.render({ status: 'success', input: zero, result: executeJavaScript(zero) });
    assert.deepEqual(f.get('highlight').children.filter((node) => node?.tag === 'mark').map((node) => node.dataset.regexColor), colors);
    assert.equal(f.get('highlight').textContent, input.text);
});

test('index handles empty startup, sample loading, snapshots, IME, rendering and page lifecycle', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture();
    const old = Object.fromEntries(['document', 'window', 'Worker', 'ResizeObserver', 'getComputedStyle'].map((name) => [name, globalThis[name]]));
    const lifecycle = {};
    const workers = [];
    const observers = [];
    const copied = [];
    let rejectCopy = false;
    f.root.defaultView.isSecureContext = true;
    f.root.defaultView.navigator = { clipboard: { async writeText(value){
        if(rejectCopy){ throw new Error('Denied'); }
        copied.push(value);
    } } };
    globalThis.document = f.root;
    globalThis.window = { addEventListener(name, fn){ lifecycle[name] = fn; } };
    globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => ({
        '--input-min': '400px', '--input-max': '1600px', '--input-default': '480px',
        '--results-min': '320px', '--results-max': '2400px', '--results-default': '400px'
    })[name] });
    globalThis.ResizeObserver = class {
        constructor(callback){ this.callback = callback; }
        observe(target){ observers.push({ target, callback: this.callback }); }
    };
    globalThis.Worker = class {
        constructor(){ workers.push(this); }
        postMessage(request){ this.request = request; }
        terminate(){ this.terminated = true; }
    };
    t.after(() => { lifecycle.pagehide?.(); Object.assign(globalThis, old); });
    await import('../src/tools/regex-tester/js/index.js');
    assert.equal(f.get('timeout').min, String(LIMITS.timeoutMinMs));
    assert.equal(f.get('timeout').max, String(LIMITS.timeoutMaxMs));
    assert.equal(f.get('timeout').step, String(LIMITS.timeoutStepMs));
    assert.equal(f.get('timeout-value').textContent, '1.5 s');
    assert.equal(f.get('run').disabled, true);
    assert.equal(f.get('copy').disabled, true);
    assert.equal(f.get('status').textContent, 'Enter a pattern and test text.');
    t.mock.timers.tick(500);
    assert.equal(workers.length, 0, 'empty initial fields do not execute');
    f.get('sample').fire('click');
    const samplePattern = f.get('pattern').value;
    const sampleText = f.get('text').value;
    assert.ok(samplePattern.includes('(?<name>'));
    assert.ok(sampleText.includes('alice@example.com'));
    assert.equal(f.get('match-count').textContent, 'Waiting…');
    t.mock.timers.tick(300);
    assert.equal(workers.length, 1);
    workers[0].onmessage({ data: executeJavaScript(workers[0].request) });
    assert.equal(f.get('match-count').textContent, '3 matches');
    assert.equal(f.get('highlight').textContent, sampleText);
    f.get('text').scrollTop = 40;
    f.get('text').scrollLeft = 80;
    f.get('text').fire('scroll');
    assert.equal(f.get('highlight').scrollTop, 40);
    assert.equal(f.get('highlight').scrollLeft, 80);
    f.get('text').clientWidth = 280;
    f.get('text').clientHeight = 240;
    observers.find((observer) => observer.target === f.get('text')).callback();
    assert.equal(f.get('highlight').style.width, '280px');
    assert.equal(f.get('highlight').style.height, '240px');
    assert.deepEqual(executeJavaScript(workers[0].request).matches.map((match) => match.namedGroups.map((group) => group.name)), [
        ['name', 'domain'], ['name', 'domain'], ['name', 'domain']
    ]);
    f.get('timeout').value = '2200';
    f.get('timeout').fire('input');
    assert.equal(f.get('timeout-value').textContent, '2.2 s');
    assert.equal(f.get('timeout').attributes['aria-valuetext'], '2.2 seconds');
    assert.equal(f.get('match-count').textContent, '3 matches', 'dragging only updates the displayed setting');
    f.get('timeout').fire('change');
    assert.equal(f.get('match-count').textContent, 'Waiting…', 'committing the setting schedules Auto');
    const snapshot = workers[0].request;
    f.get('pattern').value = 'new';
    f.get('pattern').fire('compositionstart');
    f.get('pattern').fire('input');
    assert.equal(f.get('run').disabled, true);
    assert.equal(f.get('copy').disabled, true);
    assert.equal(f.get('highlight').children.length, 0, 'IME immediately clears stale highlight');
    f.get('run').fire('click');
    t.mock.timers.tick(500);
    assert.equal(workers.length, 1, 'composition defers both Auto and Run');
    assert.equal(snapshot.pattern, samplePattern, 'old snapshot is not mutated');
    f.get('pattern').fire('compositionend');
    assert.equal(f.get('run').disabled, false);
    assert.equal(f.get('match-count').textContent, 'Waiting…');
    f.get('mode').value = 'manual';
    f.get('mode').fire('change');
    assert.equal(f.get('match-count').textContent, 'Not run');
    f.flags[0].checked = false;
    f.flags[0].fire('change');
    assert.equal(f.get('flags-summary').textContent, 'i');
    f.get('text').value = 'changed';
    f.get('text').fire('input');
    f.get('sample').fire('click');
    assert.equal(f.get('mode').value, 'manual');
    assert.equal(f.get('pattern').value, samplePattern);
    assert.equal(f.get('text').value, sampleText);
    assert.equal(f.get('flags-summary').textContent, 'gi');
    t.mock.timers.tick(500);
    assert.equal(workers.length, 1, 'Manual cancels the Auto scheduled at composition end');
    f.get('run').fire('click');
    assert.equal(workers[1].request.mode, 'manual');
    assert.equal(workers[1].request.timeoutMs, 2200, 'Manual Run uses the selected timeout after sample restore');
    lifecycle.pagehide();
    assert.equal(workers[1].terminated, true);
    workers[1].onmessage({ data: executeJavaScript(workers[1].request) });
    assert.equal(f.get('match-count').textContent, 'Not run');
    lifecycle.pageshow({ persisted: true });
    assert.equal(f.get('mode').value, 'manual');
    f.get('pattern').value = '';
    f.get('pattern').fire('input');
    assert.equal(f.get('run').disabled, true);
    assert.equal(f.get('status').textContent, 'Enter a pattern.');
    assert.equal(f.get('matches').children.length, 0);
    f.get('run').fire('click');
    assert.equal(workers.length, 2);
    f.get('text').value = '';
    f.get('text').fire('input');
    assert.equal(f.get('status').textContent, 'Enter a pattern and test text.');
    f.get('pattern').value = 'a';
    f.get('pattern').fire('input');
    assert.equal(f.get('status').textContent, 'Enter test text.');
    f.get('sample').fire('click');
    assert.equal(f.get('run').disabled, false);

    f.get('text').value = '';
    f.get('text').fire('input');
    f.get('pattern').value = '[^1-9a-t]';
    f.get('pattern').fire('input');
    assert.equal(f.get('copy').disabled, false, 'copy does not require test text or a completed run');
    const executionStatus = f.get('status').textContent;
    const pendingCopy = f.get('copy').fire('click');
    assert.equal(f.get('copy').disabled, true, 'prevent duplicate clipboard requests');
    await pendingCopy;
    assert.equal(copied.at(-1), '/[^1-9a-t]/gi');
    assert.equal(f.get('copy-status').textContent, 'Regular expression copied.');
    assert.equal(f.get('status').textContent, executionStatus, 'copy does not overwrite execution status');
    assert.equal(workers.length, 2, 'copy does not execute the regex');
    f.get('copy-dismiss').fire('click');
    assert.equal(f.get('copy-notice').hidden, true);
    f.flags.forEach((flag) => { flag.checked = false; });
    f.flags[0].fire('change');
    await f.get('copy').fire('click');
    assert.equal(copied.at(-1), '/[^1-9a-t]/');
    f.get('pattern').value = '(';
    f.get('pattern').fire('input');
    await f.get('copy').fire('click');
    assert.equal(copied.at(-1), '/(/', 'copy is available while fixing syntax errors');
    rejectCopy = true;
    await f.get('copy').fire('click');
    assert.equal(f.get('copy-status').dataset.state, 'error');
    assert.equal(f.get('copy').disabled, false, 'clipboard failure permits retry');
    f.get('pattern').value = '';
    f.get('pattern').fire('input');
    assert.equal(f.get('copy').disabled, true);
    assert.equal(f.get('copy-notice').hidden, true);
});
