import test from 'node:test';
import assert from 'node:assert/strict';
import { planJsonInput } from '../src/tools/json-editor/js/input-assist.js';

function typeAt(marked, inserted, width = 2){
    const caret = marked.indexOf('|');
    const source = marked.replace('|', '');
    const edit = planJsonInput(source, caret, caret, inserted, width);
    if(!edit) return null;
    const result = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    return result.slice(0, edit.caret) + '|' + result.slice(edit.caret);
}

test('Enter inherits indentation and deepens after an opener using the selected width', () => {
    for(const width of [2, 4, 8]){
        const pad = ' '.repeat(width);
        assert.equal(typeAt('{|', '\n', width), `{\n${pad}|`);
        assert.equal(typeAt(`{\n${pad}"a": [|`, '\n', width), `{\n${pad}"a": [\n${pad.repeat(2)}|`);
        assert.equal(typeAt(`{\n${pad}"a": 1,|`, '\n', width), `{\n${pad}"a": 1,\n${pad}|`);
    }
    assert.equal(typeAt('{\n\t"x": 1,|', '\n', 4), '{\n\t"x": 1,\n    |');
});

test('Enter between matching brackets creates an inner line without duplicating the closer', () => {
    assert.equal(typeAt('{|}', '\n'), '{\n  |\n}');
    assert.equal(typeAt('{\n  "a": [| ]\n}', '\n'), '{\n  "a": [\n    |\n  ]\n}');
    assert.equal(typeAt('{\n  "a": 1|}', '\n'), '{\n  "a": 1\n|}');
});

test('closing brackets dedent whitespace-only line prefixes and do not double dedent', () => {
    assert.equal(typeAt('{\n  |', '}'), '{\n}|');
    assert.equal(typeAt('{\n  "a": [\n    1\n    |', ']'), '{\n  "a": [\n    1\n  ]|');
    assert.equal(typeAt('{\n|', '}'), null);
    assert.equal(typeAt('{\n  |', ']'), null);
    assert.equal(typeAt('{ "a": 1 |', '}'), null);
});

test('input assistance ignores strings, escapes, pasted chunks and unrelated keys', () => {
    assert.equal(typeAt('{\n  "a": "unterminated |', '}'), null);
    assert.equal(typeAt('{\n  "a": "escaped \\\" |', '\n'), null);
    assert.equal(typeAt('{\n  "a": "[",|', '\n'), '{\n  "a": "[",\n  |');
    assert.equal(typeAt('{\n  |', 'text'), null);
    assert.equal(typeAt('{\n  |', '}]'), null);
});

test('Enter replaces only the selected region and keeps surrounding source intact', () => {
    const source = '{replace}';
    const edit = planJsonInput(source, 1, 8, '\n', 4);
    assert.equal(source.slice(0, edit.start) + edit.text + source.slice(edit.end), '{\n    \n}');
    assert.equal(edit.caret, 6);
});
