import test from 'node:test';
import assert from 'node:assert/strict';
import { lineCount } from '../src/assets/js/utils/text.js';

test('line counts preserve empty/trailing LF, CRLF and UTF-16 text semantics', () => {
    for(const [text, expected] of [
        ['', 1], ['😀日本', 1], ['a\n', 2], ['\n\n', 3], ['a\r\nb\r\n', 3], ['a\rb', 1],
        ['a\u2028b\u2029c', 1], ['x\n'.repeat(100000), 100001]
    ]){
        assert.equal(lineCount(text), expected);
    }
});
