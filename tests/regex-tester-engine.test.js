import test from 'node:test';
import assert from 'node:assert/strict';
import { executeJavaScript } from '../src/tools/regex-tester/js/engines/javascript.js';
import { LIMITS } from '../src/tools/regex-tester/js/result.js';

const execute = (pattern, text, flags = 'g') => executeJavaScript({ requestId: 7, engine: 'javascript', pattern, text, flags });

test('JS engine normalizes numbered and named captures into exact UTF-16 ranges', () => {
    const text = '😀日本 e\u0301\n東京';
    const result = execute('(?<city>日本|東京)', text, 'gu');
    assert.equal(result.status, 'success');
    assert.equal(result.requestId, 7);
    assert.equal(result.offsetUnit, 'utf-16');
    assert.deepEqual(result.matches.map((match) => [match.start, match.end]), [[2, 4], [8, 10]]);
    assert.deepEqual(result.matches[0].groups, [{ index: 1, start: 2, end: 4 }]);
    assert.deepEqual(result.matches[0].namedGroups, [{ name: 'city', start: 2, end: 4 }]);
    assert.equal(result.error, null);
    assert.equal(result.truncated, false);
});

test('captures distinguish unmatched, empty, repeated and lookaround ranges', () => {
    const [match] = execute('(?<missing>x)?(?<empty>)(a)(a)', 'aa').matches;
    assert.deepEqual(match.groups, [
        { index: 1, start: null, end: null }, { index: 2, start: 0, end: 0 },
        { index: 3, start: 0, end: 1 }, { index: 4, start: 1, end: 2 }
    ]);
    assert.deepEqual(match.namedGroups, [{ name: 'missing', start: null, end: null }, { name: 'empty', start: 0, end: 0 }]);
    const look = execute('(?<=(a))b(?=(c))', 'abc').matches[0];
    assert.deepEqual([look.start, look.end], [1, 2]);
    assert.deepEqual(look.groups, [{ index: 1, start: 0, end: 1 }, { index: 2, start: 2, end: 3 }]);
});

test('g controls global search; i, m, s and u retain native semantics', () => {
    assert.equal(execute('a', 'AaA', 'i').matches.length, 1);
    assert.equal(execute('a', 'AaA', 'gi').matches.length, 3);
    assert.equal(execute('^a$', 'x\na\nx', 'gm').matches.length, 1);
    assert.equal(execute('a.b', 'a\nb', 'gs').matches.length, 1);
    assert.equal(execute('.', '😀', 'gu').matches[0].end, 2);
    assert.equal(execute('.', '😀', 'g').matches.length, 2);
    assert.equal(execute('\\u{1F600}', '😀', 'gu').matches[0].end, 2);
});

test('empty and zero-width patterns terminate with Unicode-aware advancement', () => {
    assert.deepEqual(execute('', '😀', 'gu').matches.map((match) => match.start), [0, 2]);
    assert.deepEqual(execute('', '😀', 'g').matches.map((match) => match.start), [0, 1, 2]);
    assert.equal(execute('', '', '').matches.length, 1);
    assert.equal(execute('(?=a)', 'aa', 'g').matches.length, 2);
    assert.equal(execute('z', '', 'g').matches.length, 0);
});

test('syntax, invalid flags, input limits and unsupported engine are explicit error results', () => {
    for(const [pattern, flags] of [['(', 'g'], ['a', 'gg'], ['a', 'uv']]){
        const result = execute(pattern, '', flags);
        assert.equal(result.status, 'syntax-error');
        assert.equal(result.error.code, 'invalid-pattern-or-flags');
        assert.equal(result.error.position, null, 'do not invent a syntax offset');
        assert.deepEqual(result.matches, []);
    }
    assert.equal(execute('x'.repeat(LIMITS.patternLength + 1), '').status, 'input-limit');
    assert.equal(execute('x', 'x'.repeat(LIMITS.textLength + 1)).status, 'input-limit');
    assert.equal(executeJavaScript({ engine: 'python', pattern: '', text: '', flags: '' }).error.code, 'unsupported-engine');
});

test('execution limits distinguish exact count, extra matches and capture exhaustion', () => {
    const exact = execute('a', 'a'.repeat(LIMITS.matches));
    assert.equal(exact.matches.length, LIMITS.matches);
    assert.equal(exact.truncated, false);
    const extra = execute('a', 'a'.repeat(LIMITS.matches + 1));
    assert.equal(extra.matches.length, LIMITS.matches);
    assert.equal(extra.truncationReason, 'match-limit');
    const captures = execute('()'.repeat(1000), 'a'.repeat(20));
    assert.equal(captures.truncated, true);
    assert.equal(captures.truncationReason, 'capture-limit');
    assert.equal(captures.matches.length, 10);
});
