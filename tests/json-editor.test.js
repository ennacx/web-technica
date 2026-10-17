import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJson } from '../src/tools/json-editor/js/validator.js';
import { prettyPrintJson, changeJsonIndent } from '../src/tools/json-editor/js/formatter.js';
import { JsonEditorDocument } from '../src/tools/json-editor/js/document.js';

test('View transformations and output stay separate from Edit source across mode switches', () => {
    const document = new JsonEditorDocument();
    const source = '{ "a" : [1,  2], "a": 9007199254740993 }';
    document.setSource(source);
    document.mode = 'view';
    document.setText(prettyPrintJson(document.text, document.indent));
    const formatted = document.text;
    assert.notEqual(formatted, source);
    assert.equal(document.source, source);
    document.setText(changeJsonIndent(document.text, document.indent, 8));
    document.setIndent(8);
    const displayed = document.text;
    assert.match(displayed, /\n {8}"a"/);
    assert.equal(document.source, source);
    document.mode = 'edit';
    assert.equal(document.text, source);
    assert.equal(document.indent, 2);
    document.mode = 'view';
    assert.equal(document.text, displayed);
    assert.equal(document.indent, 8);
});

test('Edit transformations change source and refresh View, including incomplete edits', () => {
    const document = new JsonEditorDocument();
    document.setSource('{\n  "a" : [1,  2]\n}');
    document.setIndent(4);
    document.setText(changeJsonIndent(document.text, 2, document.indent));
    assert.equal(document.source, '{\n    "a" : [1,  2]\n}');
    document.mode = 'view';
    assert.equal(document.text, document.source);
    assert.equal(document.indent, 4);
    document.setText(prettyPrintJson(document.text, 8));
    document.mode = 'edit';
    document.setSource('{\n    "unfinished":');
    document.mode = 'view';
    assert.equal(document.text, '{\n    "unfinished":');
    assert.equal(validateJson(document.text).state, 'invalid');
    document.setText(changeJsonIndent(document.text, 4, 2));
    assert.equal(document.text, '{\n  "unfinished":');
    assert.equal(document.source, '{\n    "unfinished":');
    document.mode = 'edit';
    document.setSource(document.source);
    assert.equal(document.text, document.source);
});

test('indent changes keep manual line breaks, inline spacing and unfinished JSON', () => {
    const source = '{\r\n  "a" : [1,  2],\r\n\r\n  "b": {\r\n    "c": 1e400,\r\n  '; // incomplete, with a blank line and trailing whitespace
    const expected = '{\r\n    "a" : [1,  2],\r\n\r\n    "b": {\r\n        "c": 1e400,\r\n    ';
    assert.equal(changeJsonIndent(source, 2, 4), expected);
    assert.equal(changeJsonIndent(expected, 4, 2), source);
    assert.equal(changeJsonIndent('{ "x":  1 }', 2, 8), '{ "x":  1 }');
});

test('indent changes detect pasted indentation and preserve extra alignment spaces', () => {
    assert.equal(changeJsonIndent('{\n    "a": [\n        1, 2\n    ]\n}', 2, 8), '{\n        "a": [\n                1, 2\n        ]\n}');
    assert.equal(changeJsonIndent('{\n  "a": 1,\n     "b": 2\n}', 2, 4), '{\n    "a": 1,\n         "b": 2\n}');
    assert.equal(changeJsonIndent('{\n\t"a": [\n\t\t1\n\t]\n}', 4, 2), '{\n  "a": [\n    1\n  ]\n}');
});

test('indent changes protect escaped and unterminated strings, values and duplicate keys', () => {
    const source = '{\n  "a": "  \\u0061 \\\"",\n  "a": 9007199254740993,\n  "unfinished": "text\n    keep these spaces';
    const expected = '{\n    "a": "  \\u0061 \\\"",\n    "a": 9007199254740993,\n    "unfinished": "text\n    keep these spaces';
    assert.equal(changeJsonIndent(source, 2, 4), expected);
});

test('Pretty Print applies each supported indent to nested objects and arrays', () => {
    for(const width of [2, 4, 8]){
        const pad = ' '.repeat(width);
        const expected = `{\n${pad}"a": [\n${pad.repeat(2)}1,\n${pad.repeat(2)}{\n${pad.repeat(3)}"b": true\n${pad.repeat(2)}}\n${pad}],\n${pad}"empty": {}\n}`;
        const result = prettyPrintJson(' { "a" : [1,{"b":true}],"empty":{} }\r\n', width);
        assert.equal(result, expected);
        assert.equal(prettyPrintJson(result, width), result);
    }
});

test('Pretty Print keeps sensitive number/string spellings, key order and duplicate keys verbatim', () => {
    const source = '{"10":9007199254740993,"2":1.0000000000000000001,"exp":1E+400,"zero":-0,"a":"\\u0061","a":" , : { } [ ] \\\" \\\\ ","__proto__":null}';
    const expected = '{\n  "10": 9007199254740993,\n  "2": 1.0000000000000000001,\n  "exp": 1E+400,\n  "zero": -0,\n  "a": "\\u0061",\n  "a": " , : { } [ ] \\\" \\\\ ",\n  "__proto__": null\n}';
    assert.equal(prettyPrintJson(source), expected);
});

test('Pretty Print handles primitives and empty containers and refuses invalid input or indent', () => {
    for(const source of ['{}', '[]', '"text with spaces"', 'true', 'false', 'null', '-0', '1e400']){
        assert.equal(prettyPrintJson(`\n ${source}\t`), source);
    }
    assert.equal(prettyPrintJson('[{},[],{"a":[]}]'), '[\n  {},\n  [],\n  {\n    "a": []\n  }\n]');
    for(const source of ['', '{', '[1,]', '{"a":1,}']){
        assert.throws(() => prettyPrintJson(source), SyntaxError);
    }
    for(const width of [0, 3, 10, -2, 2.5, '2']){
        assert.throws(() => prettyPrintJson('{}', width), RangeError);
    }
});

test('JSON validation accepts all root types and legal JSON whitespace', () => {
    for(const source of ['{}', '[]', '"text"', 'true', 'false', 'null', '0', '-1.25e+3', ' \t\r\n{"nested":[{},[1,null]]}\n']){
        assert.equal(validateJson(source).state, 'valid', source);
    }
    for(const source of ['', ' \t\r\n']){
        assert.equal(validateJson(source).state, 'empty');
    }
});

test('JSON validation accepts loss-sensitive representations without returning converted values', () => {
    const source = '{"id":9007199254740993,"decimal":1.0000000000000000001,"exp":1e400,"negativeZero":-0,"escaped":"\\u0061","duplicate":1,"duplicate":2,"__proto__":{}}';
    assert.deepEqual(validateJson(source), { state: 'valid', message: '' });
});

test('JSON validation rejects incomplete input and non-JSON extensions with a diagnostic', () => {
    for(const source of ['{', '[1,', '"unfinished', '{"a":1,}', '[1,]', '{a:1}', '{"a":undefined}', '// comment\n{}', 'NaN', 'Infinity', '01', '+1', '1.', 'true false', '"\\x41"', '"line\nbreak"', '\u00a0{}', '\ufeff{}']){
        const result = validateJson(source);
        assert.equal(result.state, 'invalid', source);
        assert.equal(typeof result.message, 'string');
        assert.ok(result.message.length > 0, source);
    }
});
