import test from 'node:test';
import assert from 'node:assert/strict';
import { sortJsonKeys } from '../src/tools/json-editor/js/key-sorter.js';
import { JsonEditorDocument } from '../src/tools/json-editor/js/document.js';

test('natural sort orders numeric keys and digit segments in both directions', () => {
    const source = '{"110":0,"20":0,"3":0,"100":0,"1":0,"10":0,"2":0}';
    assert.equal(sortJsonKeys(source), '{"1":0,"2":0,"3":0,"10":0,"20":0,"100":0,"110":0}');
    assert.equal(sortJsonKeys(source, 'desc'), '{"110":0,"100":0,"20":0,"10":0,"3":0,"2":0,"1":0}');
    assert.equal(sortJsonKeys('{"item10":0,"item2":0,"item1":0}'), '{"item1":0,"item2":0,"item10":0}');
});

test('sort descends through objects and arrays while retaining array element order', () => {
    const source = '{"z":{"b":2,"a":1},"a":[{"d":4,"c":3},[9,8,{"f":6,"e":5}],2,1]}';
    const expected = '{"a":[{"c":3,"d":4},[9,8,{"e":5,"f":6}],2,1],"z":{"a":1,"b":2}}';
    assert.equal(sortJsonKeys(source), expected);
    assert.equal(sortJsonKeys(expected), expected);
    assert.equal(sortJsonKeys('[{"a":1,"b":2},3,2,1]', 'desc'), '[{"b":2,"a":1},3,2,1]');
});

test('decoded keys and collator-equivalent keys use stable order even descending', () => {
    const source = '{"b":0,"\\u0061":1,"a":2,"a":3}';
    assert.equal(sortJsonKeys(source), '{"\\u0061":1,"a":2,"a":3,"b":0}');
    assert.equal(sortJsonKeys(source, 'desc'), source);
    assert.equal(sortJsonKeys('{"item02":1,"item2":2,"item10":3}'), '{"item02":1,"item2":2,"item10":3}');
    assert.equal(sortJsonKeys('{"item02":1,"item2":2,"item10":3}', 'desc'), '{"item10":3,"item02":1,"item2":2}');
    assert.equal(sortJsonKeys('{"\\u0062":1,"a":2}'), '{"a":2,"\\u0062":1}');
});

test('sorting preserves key/value lexemes, whitespace slots and empty containers', () => {
    const source = ' \r\n{\r\n  "z" : 9007199254740993,\r\n  "a": [1.0000000000000000001, 1E+400, -0, " a  \\u0061 \\\" \\\\ ", {}, [ ]],\r\n  "__proto__": null\r\n}\t';
    const sorted = sortJsonKeys(source);
    assert.ok(sorted.includes('"z" : 9007199254740993'));
    assert.ok(sorted.includes('"a": [1.0000000000000000001, 1E+400, -0, " a  \\u0061 \\\" \\\\ ", {}, [ ]]'));
    assert.ok(sorted.includes('"__proto__": null'));
    assert.equal(sorted.match(/\r\n/g).length, source.match(/\r\n/g).length);
    assert.ok(sorted.startsWith(' \r\n{\r\n  '));
    assert.ok(sorted.endsWith('\r\n}\t'));
    assert.equal(sortJsonKeys(' { "z" : 1,  "a": 2 } '), ' { "a": 2,  "z" : 1 } ');
    for(const value of ['{}', '{  }', '[ ]', '123', '"[{}]"', 'null', 'true', 'false']){
        assert.equal(sortJsonKeys(` \n${value}\t`), ` \n${value}\t`);
    }
});

test('sort rejects malformed JSON and handles deep containers without recursive traversal', () => {
    for(const source of ['', '{', '{"x":1,}', '[1,]', '{"x":NaN}']){
        assert.throws(() => sortJsonKeys(source), SyntaxError);
    }
    assert.throws(() => sortJsonKeys('{}', 'other'), RangeError);
    const depth = 3000;
    const source = '['.repeat(depth) + '{"b":1,"a":2}' + ']'.repeat(depth);
    assert.equal(sortJsonKeys(source), '['.repeat(depth) + '{"a":2,"b":1}' + ']'.repeat(depth));
});

test('View sorting composes with formats and survives errors without changing source or Edit direction', () => {
    const document = new JsonEditorDocument();
    const source = '{ "z": 1, "a": {"x10":10,"x2":2} }';
    document.setSource(source);
    document.mode = 'view';
    document.setViewSort('asc');
    assert.equal(document.view.dirty, true);
    document.setViewFormat('minify');
    assert.equal(document.text, '{"a":{"x2":2,"x10":10},"z":1}');
    assert.equal(document.source, source);
    document.setViewFormat('pretty');
    document.setIndent(4);
    assert.match(document.text, /^\{\n {4}"a": \{\n {8}"x2"/);
    document.mode = 'edit';
    assert.equal(document.sort, null);
    assert.equal(document.text, source);
    document.sortKeys('desc');
    assert.equal(document.sort, 'desc');
    assert.equal(document.view.sort, 'asc');
    document.setSource('{"unfinished":');
    document.mode = 'view';
    assert.equal(document.text, '{"unfinished":');
    assert.equal(document.setViewSort('desc'), false);
    assert.equal(document.sortKeys('desc'), false);
    assert.equal(document.view.sort, 'asc');
    document.mode = 'edit';
    document.setSource('{"b":2,"a":1}');
    document.mode = 'view';
    assert.equal(document.sort, 'asc');
    assert.equal(document.text, '{\n    "a": 1,\n    "b": 2\n}');
    document.setViewSort(null);
    assert.equal(document.text, '{\n    "b": 2,\n    "a": 1\n}');
});
