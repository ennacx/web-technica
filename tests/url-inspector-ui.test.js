import './helpers/register-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal DOM double for exercising the real event handlers without a browser.
// This checks node identity and focus, not visual layout or browser performance.
function createDocument(){
    const document = { created: 0, activeElement: null };
    class Element {
        constructor(tag){
            this.tag = tag;
            this.children = [];
            this.dataset = {};
            this.attributes = {};
            this.listeners = {};
            this.value = '';
            this.textContent = '';
            this.disabled = false;
            this.replacements = 0;
            this.classList = { add() {} };
        }
        append(...nodes){
            for(const node of nodes){
                this.children.push(...(node.tag === 'fragment' ? node.children : [node]));
            }
        }
        replaceChildren(...nodes){ this.children = []; this.append(...nodes); this.replacements++; }
        setAttribute(name, value){ this.attributes[name] = String(value); }
        removeAttribute(name){ delete this.attributes[name]; }
        addEventListener(name, handler){ this.listeners[name] = handler; }
        fire(name, target = this){ this.listeners[name]?.({ target, preventDefault() {} }); }
        focus(){ document.activeElement = this; }
        closest(){ return this.tag === 'button' ? this : null; }
        querySelector(selector){
            const tag = selector.match(/^\w+/)[0];
            const id = selector.match(/data-id="([^"]+)"/)?.[1];
            const action = selector.match(/data-action="([^"]+)"/)?.[1];
            const all = this.children.flatMap(function walk(node){ return [node, ...node.children.flatMap(walk)]; });
            return all.find((node) => node.tag === tag
                && (id === undefined || String(node.dataset.id) === id)
                && (action === undefined || node.dataset.action === action)
                && (!selector.includes(':not(:disabled)') || !node.disabled)) ?? null;
        }
    }
    document.defaultView = { HTMLElement: Element };
    const template = readFileSync(new URL('../src/tools/url-inspector/index.njk', import.meta.url), 'utf8');
    const elements = new Map([...template.matchAll(/<([a-z]+)\b[^>]*\bid="(url-[^"]+)"/g)].map(([, tag, id]) => [id, new Element(tag)]));
    document.getElementById = (id) => elements.get(id) ?? null;
    document.createElement = (tag) => { document.created++; return new Element(tag); };
    document.createDocumentFragment = () => new Element('fragment');
    return document;
}

test('UI hides opaque path previews and preserves row DOM and focus when editing 2,000 parameters', async (t) => {
    const previous = globalThis.document;
    const document = createDocument();
    globalThis.document = document;
    t.after(() => { globalThis.document = previous; });
    await import('../src/tools/url-inspector/js/index.js');
    const get = (id) => document.getElementById('url-' + id);
    const input = (url) => { get('current').value = url; get('current').fire('input'); };
    const labels = () => get('path-segments').children.map((li) => li.children.at(-1).textContent);

    const checkCredentials = (editable) => {
        for(const name of ['username', 'password', 'port', 'show-password']){
            assert.equal(get(name).disabled, !editable, name);
        }
    };
    checkCredentials(false);
    for(const source of ['file:///a', 'file://server/a', 'mailto:hello@example.com', 'data:text/plain,hello', 'custom:///path']){
        input(source);
        checkCredentials(false);
        assert.equal(get('credentials-help').hidden, false);
    }
    input('file://example.com/path');
    get('protocol').value = 'https';
    checkCredentials(false);
    get('components-form').fire('submit');
    assert.equal(get('current').value, 'https://example.com/path');
    checkCredentials(true);
    assert.equal(get('credentials-help').hidden, true);
    get('username').value = 'user';
    get('password').value = 'secret';
    get('port').value = '8080';
    get('components-form').fire('submit');
    const authenticated = get('current').value;
    get('protocol').value = 'file';
    get('components-form').fire('submit');
    assert.equal(get('current').value, authenticated);
    assert.equal(get('component-error').hidden, false);
    assert.equal(get('password').value, 'secret');
    checkCredentials(true);
    for(const name of ['username', 'password', 'port']){ get(name).value = ''; }
    get('components-form').fire('submit');
    assert.equal(get('current').value, 'file://example.com/path');
    checkCredentials(false);
    input('custom:///path');
    get('hostname').value = 'host';
    checkCredentials(false);
    get('components-form').fire('submit');
    checkCredentials(true);
    get('hostname').value = '';
    get('components-form').fire('submit');
    checkCredentials(false);
    input('https://example.com/');
    checkCredentials(true);
    input('invalid');
    checkCredentials(false);
    get('reset').fire('click');
    checkCredentials(false); // The first valid URL saved as Original was file:.
    input('https://example.com/');
    get('store').fire('click');
    get('clear').fire('click');
    checkCredentials(false);
    get('reset').fire('click');
    checkCredentials(true);

    input('https://example.com/a%2Fb/c');
    assert.equal(get('path-preview').hidden, false);
    assert.deepEqual(labels(), ['Root /', 'a%2Fb', 'c']);
    for(const source of ['mailto:hello@example.com', 'data:text/plain,hello']){
        input(source);
        assert.equal(get('pathname').value, new URL(source).pathname);
        assert.equal(get('path-preview').hidden, true);
        assert.deepEqual(labels(), []);
        // Even a pending slash-prefixed draft must not turn an opaque URL into a hierarchy.
        get('pathname').value = '/draft/path';
        get('pathname').fire('input');
        assert.equal(get('path-preview').hidden, true);
    }
    input('not a url');
    assert.equal(get('path-preview').hidden, true);
    assert.equal(get('components').disabled, true);
    input('https://example.com/a//');
    assert.equal(get('path-preview').hidden, false);
    assert.deepEqual(labels(), ['Root /', 'a', '(empty)', 'Trailing /']);

    const count = 2000;
    input('https://example.com/?' + Array.from({ length: count }, (_, i) => `key${i}=value${i}`).join('&'));
    const rows = get('query-rows');
    assert.equal(rows.children.length, count);
    const nodes = [...rows.children];
    const field = nodes[1000].children[1].children[0];
    field.focus();
    field.selectionStart = 3;
    field.selectionEnd = 3;
    field.value = 'edited & value';
    const replacements = rows.replacements;
    const created = document.created;
    rows.fire('change', field);
    assert.equal(rows.replacements, replacements);
    assert.equal(document.created, created);
    assert.ok(nodes.every((node, index) => rows.children[index] === node));
    assert.equal(document.activeElement, field);
    assert.equal(field.selectionStart, 3);
    assert.equal(field.selectionEnd, 3);
    assert.equal(new URL(get('current').value).searchParams.get('key1000'), 'edited & value');

    const move = rows.children[1000].children[2].children[0].children[0];
    rows.fire('click', move);
    assert.equal([...new URL(get('current').value).searchParams.keys()][999], 'key1000');
    assert.equal(document.activeElement.dataset.action, 'up');
    assert.equal(String(document.activeElement.dataset.id), String(field.dataset.id));
    const remove = rows.children[999].children[3].children[0];
    rows.fire('click', remove);
    assert.equal(rows.children.length, count - 1);
    assert.equal(new URL(get('current').value).searchParams.has('key1000'), false);
    assert.ok(document.activeElement);
    get('add').fire('click');
    assert.equal(rows.children.length, count);
    assert.equal(new URL(get('current').value).searchParams.get(''), '');
    assert.equal(document.activeElement, rows.children.at(-1).children[0].children[0]);
});
