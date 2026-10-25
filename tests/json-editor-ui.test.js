import './helpers/register-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from './helpers/json-editor-dom.js';

// Exercise notification handlers and focus without claiming browser layout coverage.

test('JSON action strip can be dismissed in Edit and View without changing text or selection', async (t) => {
    const previous = globalThis.document;
    const document = createDocument();
    globalThis.document = document;
    t.after(() => { globalThis.document = previous; });
    await import('../src/tools/json-editor/js/index.js');
    const get = (id) => document.getElementById('json-' + id);
    assert.equal(get('action-notice').hidden, true);

    get('sample').fire('click');
    assert.equal(get('action-notice').hidden, false);
    assert.match(get('action-status').textContent, /Sample loaded/);
    const viewText = get('code').textContent;
    get('action-dismiss').fire('click');
    assert.equal(get('action-notice').hidden, true);
    assert.equal(get('action-status').textContent, '');
    assert.equal(get('code').textContent, viewText);
    assert.equal(document.activeElement, get('code'));
    assert.deepEqual(get('code').focusOptions, { preventScroll: true });

    get('pretty').fire('click');
    assert.equal(get('action-notice').hidden, false);
    get('edit').fire('click');
    assert.equal(get('action-notice').hidden, true);
    get('input').value = '{"key":1}';
    get('input').fire('input');
    get('validate').fire('click'); // Complete validation without leaving a pending timer.
    get('input').setSelectionRange(2, 5);
    await get('copy').fire('click');
    assert.equal(get('action-notice').hidden, false);
    assert.match(get('action-status').textContent, /copied/);
    get('action-dismiss').fire('click');
    assert.equal(get('input').value, '{"key":1}');
    assert.equal(get('input').selectionStart, 2);
    assert.equal(get('input').selectionEnd, 5);
    assert.equal(document.activeElement, get('input'));
    assert.deepEqual(get('input').focusOptions, { preventScroll: true });

    document.defaultView.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
    await get('copy').fire('click');
    assert.equal(get('action-notice').hidden, false);
    assert.match(get('action-status').textContent, /Could not copy/);
    get('input').fire('input');
    assert.equal(get('action-notice').hidden, true);
    get('validate').fire('click');
    get('indent').value = '4';
    get('indent').fire('change');
    assert.equal(get('action-notice').hidden, false);
    assert.match(get('action-status').textContent, /indentation adjusted to 4 spaces/);
    get('action-dismiss').fire('click');
    assert.equal(get('action-notice').hidden, true);
});
