import './helpers/register-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeJavaScript } from '../src/tools/regex-tester/js/engines/javascript.js';
import { LIMITS } from '../src/tools/regex-tester/js/result.js';

const { createRenderer } = await import('../src/tools/regex-tester/js/render.js');

// DOM double checks event wiring, safe text insertion and bounded rendering.
// It does not substitute for browser layout / touch / assistive-technology checks.
function fixture(){
    class Element {
        constructor(tag){
            Object.assign(this, { tag, children: [], listeners: {}, attributes: {}, dataset: {}, value: '', checked: false,
                style: { setProperty(name, value){ this[name] = value; } } });
        }
        set textContent(value){ this.children = [String(value)]; }
        get textContent(){ return this.children.map((node) => typeof node === 'string' ? node : node.textContent).join(''); }
        append(...nodes){ for(const node of nodes){ this.children.push(...(node.tag === 'fragment' ? node.children : [node])); } }
        replaceChildren(...nodes){ this.children = []; this.append(...nodes); }
        addEventListener(name, fn){ this.listeners[name] = fn; }
        fire(name){ this.listeners[name]?.({ preventDefault(){} }); }
        setAttribute(name, value){ this.attributes[name] = String(value); }
    }
    const template = readFileSync('src/tools/regex-tester/index.njk', 'utf8');
    const nodes = new Map([...template.matchAll(/<([a-z]+)\b[^>]*\bid="(regex-[^"]+)"/g)].map(([, tag, id]) => [id, new Element(tag)]));
    const created = [];
    const flags = ['g', 'i', 'm', 's', 'u'].map((value) => Object.assign(new Element('input'), { value, checked: value === 'g' || value === 'i' }));
    const root = {
        defaultView: { HTMLElement: Element },
        getElementById: (id) => nodes.get(id),
        querySelectorAll: () => flags,
        createElement(tag){ const element = new Element(tag); created.push(element); return element; },
        createTextNode: (text) => String(text),
        createDocumentFragment: () => new Element('fragment')
    };
    const get = (name) => nodes.get('regex-' + name);
    get('pattern').value = '(?<name>a)';
    get('text').value = 'aa';
    get('mode').value = 'auto';
    return { root, get, created, flags };
}

test('renderer uses UTF-16 capture positions and text nodes, preserving hostile input literally', () => {
    const f = fixture();
    const renderer = createRenderer(f.root);
    const input = { requestId: 1, engine: 'javascript', pattern: '(?<tag><img[^>]+>)', text: '😀<img src=x onerror=alert(1)>', flags: 'g' };
    renderer.render({ status: 'success', input, result: executeJavaScript(input) });
    assert.match(f.get('matches').textContent, /Named · tag/);
    assert.match(f.get('matches').textContent, /\[2, 30\)/);
    assert.equal(f.get('preview').textContent, input.text);
    assert.ok(!f.created.some((node) => node.tag === 'img'));
    f.get('preview-tab').fire('click');
    assert.equal(f.get('preview').hidden, false);
    assert.equal(f.get('matches').hidden, true);
    renderer.render({ status: 'scheduled', input, result: null });
    assert.equal(f.get('matches').children.length, 0);
    assert.equal(f.get('preview').children.length, 0);
    assert.equal(f.get('match-count').textContent, 'Waiting…');
});

test('renderer marks zero-width matches and bounds match lists, captures and highlight text', () => {
    const f = fixture();
    const renderer = createRenderer(f.root);
    const empty = { engine: 'javascript', pattern: '(?<empty>)', text: '😀', flags: 'gu' };
    renderer.render({ status: 'success', input: empty, result: executeJavaScript(empty) });
    assert.equal(f.created.filter((node) => node.className === 'regex-zero-width').length, 2);
    const large = { engine: 'javascript', pattern: '()'.repeat(101), text: 'a'.repeat(200000), flags: 'g' };
    const result = executeJavaScript(large);
    renderer.render({ status: 'success', input: large, result });
    assert.ok(f.get('matches').children.length <= LIMITS.displayedMatches);
    assert.match(f.get('matches').textContent, /capture entries/);
    assert.match(f.get('status').textContent, /limit/);
    assert.match(f.get('preview').textContent, /first 100,000 UTF-16/);
    const lots = { engine: 'javascript', pattern: 'a', text: 'a'.repeat(200), flags: 'g' };
    renderer.render({ status: 'success', input: lots, result: executeJavaScript(lots) });
    assert.equal(f.get('matches').children.length, LIMITS.displayedMatches);
    assert.match(f.get('status').textContent, /first 100/);
});

test('index handles snapshots, IME, sample restore, rendering and page lifecycle', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture();
    const old = Object.fromEntries(['document', 'window', 'Worker', 'ResizeObserver', 'getComputedStyle'].map((name) => [name, globalThis[name]]));
    const lifecycle = {};
    const workers = [];
    globalThis.document = f.root;
    globalThis.window = { addEventListener(name, fn){ lifecycle[name] = fn; } };
    globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => ({ '--input-min': '400px', '--input-max': '1600px', '--input-default': '480px' })[name] });
    globalThis.ResizeObserver = class { observe(){} };
    globalThis.Worker = class {
        constructor(){ workers.push(this); }
        postMessage(request){ this.request = request; }
        terminate(){ this.terminated = true; }
    };
    t.after(() => { lifecycle.pagehide?.(); Object.assign(globalThis, old); });
    await import('../src/tools/regex-tester/js/index.js');
    assert.equal(f.get('match-count').textContent, 'Waiting…');
    t.mock.timers.tick(300);
    assert.equal(workers.length, 1);
    workers[0].onmessage({ data: executeJavaScript(workers[0].request) });
    assert.equal(f.get('match-count').textContent, '2 matches');
    const snapshot = workers[0].request;
    f.get('pattern').value = 'new';
    f.get('pattern').fire('compositionstart');
    f.get('pattern').fire('input');
    assert.equal(f.get('run').disabled, true);
    f.get('run').fire('click');
    t.mock.timers.tick(500);
    assert.equal(workers.length, 1, 'composition defers both Auto and Run');
    assert.equal(snapshot.pattern, '(?<name>a)', 'old snapshot is not mutated');
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
    assert.equal(f.get('pattern').value, '(?<name>a)');
    assert.equal(f.get('text').value, 'aa');
    assert.equal(f.get('flags-summary').textContent, 'gi');
    t.mock.timers.tick(500);
    assert.equal(workers.length, 1, 'Manual cancels the Auto scheduled at composition end');
    f.get('run').fire('click');
    assert.equal(workers[1].request.mode, 'manual');
    lifecycle.pagehide();
    assert.equal(workers[1].terminated, true);
    workers[1].onmessage({ data: executeJavaScript(workers[1].request) });
    assert.equal(f.get('match-count').textContent, 'Not run');
    lifecycle.pageshow({ persisted: true });
    assert.equal(f.get('mode').value, 'manual');
});
