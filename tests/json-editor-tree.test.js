import './helpers/register-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonEditorDocument } from '../src/tools/json-editor/js/document.js';
import { createTreeRenderer, pointerChild, TREE_PAGE_SIZE } from '../src/tools/json-editor/js/tree-renderer.js';
import { createDocument } from './helpers/json-editor-dom.js';

function descendants(node, predicate){
    return node.children.flatMap((child) => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
const toggles = (node) => descendants(node, (child) => child.className === 'json-tree-toggle');
const rows = (node) => descendants(node, (child) => child.className === 'json-tree-row');

function setup(source){
    const document = createDocument();
    const panel = document.getElementById('json-tree-panel');
    const editor = new JsonEditorDocument();
    editor.setSource(source);
    const tree = createTreeRenderer(panel, document);
    tree.render(editor);
    return { document, panel, editor, tree };
}

test('Tree supports all root types and safe quoted keys and values', () => {
    for(const [source, expected] of [['{}', 'Object · 0 keys'], ['[]', 'Array · 0 items'], ['null', 'null'], ['false', 'false'], ['0', '0'], ['-0', '-0'], ['""', '""'], ['"日本語\\n\\t"', '"日本語\\n\\t"'], ['1e400', 'Number outside JavaScript range']]){
        const { panel } = setup(source);
        assert.equal(rows(panel).length, 1);
        assert.ok(panel.textContent.includes(expected), source);
        assert.equal(toggles(panel).length, 0);
    }
    const source = JSON.stringify({ '': '', 'a/~/"\n': '<script>alert(1)</script>', ['very long'.repeat(1000)]: '\\' });
    const { panel, editor } = setup(source);
    assert.ok(panel.textContent.includes('""'));
    assert.ok(panel.textContent.includes('<script>alert(1)</script>'));
    assert.equal(descendants(panel, (node) => node.tag === 'script').length, 0);
    assert.equal(editor.source, source);
    assert.equal(pointerChild('/a', '/~'), '/a/~1~0');
});

test('Tree lazily renders branches, retains DOM, and never reparses on toggles or mode changes', () => {
    const { panel, editor, tree } = setup('{"a":{"nested":[1,2]},"b":[false,null]}');
    assert.equal(rows(panel).length, 3);
    const [root, a, b] = toggles(panel);
    const first = panel.children[0];
    const parsed = editor.parsed;
    editor.validateSource = () => { throw new Error('Must use rendered revision and parsed snapshot'); };
    a.fire('click');
    assert.equal(rows(panel).length, 4);
    assert.equal(b.attributes['aria-expanded'], 'false');
    a.fire('click');
    a.fire('click');
    root.fire('click');
    root.fire('click');
    tree.render(editor);
    assert.equal(panel.children[0], first);
    assert.equal(editor.parsed, parsed);
    assert.equal(rows(panel).length, 4);
    assert.equal(a.tag, 'button');
    assert.equal(a.attributes['aria-expanded'], 'true');
    assert.ok(a.attributes['aria-controls']);
});

test('Tree restores escaped paths, discards removed paths, and hides stale valid output on errors', () => {
    const { panel, editor, tree } = setup('{"a/~":{"b":[1]},"gone":{"x":1}}');
    toggles(panel)[1].fire('click');
    toggles(panel)[2].fire('click');
    toggles(panel).at(-1).fire('click');
    const before = panel.children[0];
    editor.setSource('{"a/~":{"b":[2]}}');
    assert.equal(panel.children[0], before, 'editing does not render the hidden tree');
    tree.render(editor);
    assert.equal(rows(panel).length, 4);
    assert.ok(panel.textContent.includes('[0]2'));
    editor.setSource('{');
    tree.render(editor);
    assert.equal(rows(panel).length, 0);
    assert.match(panel.textContent, /Unable to display tree/);
    editor.setSource('{"a/~":{"b":[3]},"gone":{"x":1}}');
    tree.render(editor);
    assert.equal(toggles(panel).at(-1).attributes['aria-expanded'], 'false');
    editor.setSource(' \n');
    tree.render(editor);
    assert.match(panel.textContent, /Enter JSON/);
    tree.reset();
    editor.setSource('[{"a":1}]');
    tree.render(editor);
    assert.equal(rows(panel).length, 2);
});

test('large sibling lists are paged and deep unexpanded data is not rendered', () => {
    const { panel } = setup(JSON.stringify(Array.from({ length: 10000 }, (_, i) => i)));
    assert.equal(rows(panel).length, TREE_PAGE_SIZE + 1);
    const more = descendants(panel, (node) => node.tag === 'button' && node.textContent.startsWith('Show more'))[0];
    more.fire('click');
    assert.equal(rows(panel).length, 2 * TREE_PAGE_SIZE + 1);
    const deep = setup('['.repeat(5000) + '0' + ']'.repeat(5000));
    assert.equal(rows(deep.panel).length, 2);
});

test('document validation reuses source revision and Tree exports source independently of View settings', () => {
    const editor = new JsonEditorDocument();
    const source = '{ "x": 1, "a": 2 }';
    editor.setSource(source);
    const valid = editor.validateSource();
    const parsed = editor.parsed;
    const revision = editor.revision;
    editor.setSource(source);
    assert.equal(editor.revision, revision);
    assert.equal(editor.validateSource(), valid);
    assert.equal(editor.parsed, parsed);
    editor.mode = 'view';
    editor.setViewFormat('minify');
    editor.setViewSort('asc');
    const display = editor.text;
    editor.mode = 'tree';
    assert.equal(editor.text, source);
    assert.equal(editor.sortKeys('asc'), false);
    assert.equal(editor.setIndent(8), false);
    assert.throws(() => editor.setText('{}'), TypeError);
    editor.mode = 'view';
    assert.equal(editor.text, display);
    editor.setSource('null');
    assert.notEqual(editor.validateSource(), valid);
    assert.equal(editor.parsed, null);
});

test('UI switches Edit/View/Tree, preserves display settings and exports source in Tree', async (t) => {
    const previous = globalThis.document;
    const document = createDocument();
    globalThis.document = document;
    t.after(() => { globalThis.document = previous; });
    await import('../src/tools/json-editor/js/index.js?tree-test');
    const get = (name) => document.getElementById('json-' + name);
    get('input').value = '{ "a": {"b":1} }';
    get('input').fire('input');
    assert.equal(get('tree-panel').children.length, 0);
    get('view').fire('click');
    get('minify').fire('click');
    const view = get('code').textContent;
    get('tree').fire('click');
    assert.equal(get('tree-panel').hidden, false);
    assert.equal(get('input').hidden, true);
    assert.equal(get('display').hidden, true);
    assert.equal(get('tree').attributes['aria-pressed'], 'true');
    for(const name of ['pretty', 'minify', 'sort', 'indent']) assert.equal(get(name).disabled, true);
    let copied;
    document.defaultView.navigator.clipboard.writeText = async (text) => { copied = text; };
    await get('copy').fire('click');
    assert.equal(copied, get('input').value);
    get('action-dismiss').fire('click');
    assert.equal(document.activeElement, get('tree-panel'));
    const root = get('tree-panel').children[0];
    get('view').fire('click');
    assert.equal(get('code').textContent, view);
    get('tree').fire('click');
    assert.equal(get('tree-panel').children[0], root);
    get('edit').fire('click');
    get('input').value = '{';
    get('input').fire('input');
    get('tree').fire('click');
    assert.match(get('tree-panel').textContent, /Unable to display tree/);
    get('edit').fire('click');
    get('input').value = '[true]';
    get('input').fire('input');
    get('tree').fire('click');
    assert.match(get('tree-panel').textContent, /true/);
});
