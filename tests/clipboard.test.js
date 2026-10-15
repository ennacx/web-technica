import test from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from '../src/assets/js/utils/clipboard.js';

test('uses the supplied document clipboard and propagates rejected permissions', async () => {
    const values = [];
    const document = { defaultView: { isSecureContext: true, navigator: {
        clipboard: { writeText: async (value) => { values.push(value); } }
    } } };
    await copyText('value', document);
    assert.deepEqual(values, ['value']);
    document.defaultView.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
    await assert.rejects(copyText('value', document), /Denied/);
});

test('fallback cleans up and restores focus on success, false return and exceptions', async () => {
    for (const outcome of [true, false, new Error('Denied')]) {
        let removed = false;
        let focused = false;
        const textarea = { focus() {}, select() {}, remove() { removed = true; } };
        const document = {
            defaultView: { navigator: {}, isSecureContext: false },
            activeElement: { focus() { focused = true; } },
            createElement: () => textarea,
            body: { append(element) { assert.equal(element, textarea); } },
            execCommand(command) {
                assert.equal(command, 'copy');
                if (outcome instanceof Error) throw outcome;
                return outcome;
            }
        };
        if (outcome === true) await copyText('value', document);
        else await assert.rejects(copyText('value', document));
        assert.equal(textarea.value, 'value');
        assert.equal(removed, true);
        assert.equal(focused, true);
    }
});
