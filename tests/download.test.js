import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadText } from '../src/assets/js/utils/download.js';

test('download removes the anchor and revokes its Blob URL after click, including on failure', () => {
    for (const fail of [false, true]) {
        const events = [];
        const anchor = { click() { events.push('click'); if (fail) throw new Error('blocked'); }, remove() { events.push('remove'); } };
        let blob;
        const document = {
            defaultView: { Blob, URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL(url) { assert.equal(url, 'blob:test'); events.push('revoke'); } }, setTimeout(callback, delay) { assert.equal(delay, 1000); events.push('schedule'); callback(); } },
            createElement: () => anchor, body: { append() {} }
        };
        if (fail) assert.throws(() => downloadText('content', 'keys.pem', document), /blocked/);
        else downloadText('content', 'keys.pem', document);
        assert.deepEqual(events, ['click', 'remove', 'schedule', 'revoke']);
        assert.equal(anchor.download, 'keys.pem');
        assert.equal(anchor.href, 'blob:test');
        assert.equal(blob.type, 'text/plain;charset=utf-8');
    }
});
