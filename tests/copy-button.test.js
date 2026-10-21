import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCopyButton, createCopyFeedback } from '../src/assets/js/components/copy-button.js';

function fixture(){
    const copied = [];
    const icons = { '[data-icon-copy]': { hidden: false }, '[data-icon-check]': { hidden: true } };
    const button = {
        disabled: false,
        ownerDocument: { defaultView: {
            isSecureContext: true,
            navigator: { clipboard: { async writeText(text){ copied.push(text); } } }
        } },
        querySelector: (selector) => icons[selector],
        addEventListener(name, handler){ this[name] = handler; },
        removeEventListener(name, handler){ if(this[name] === handler) delete this[name]; }
    };
    return { button, copied, icons };
}

test('copy buttons snapshot text, skip disabled/empty inputs and can be unbound', async () => {
    const { button, copied } = fixture();
    let text = '😀<script>literal text</script>';
    const events = [];
    const unbind = bindCopyButton(button, {
        read: () => text,
        onSuccess: (value) => events.push(value)
    });
    button.disabled = true;
    await button.click();
    assert.deepEqual(copied, []);
    button.disabled = false;
    text = '';
    await button.click();
    text = null;
    await button.click();
    assert.deepEqual(copied, []);
    text = '😀<script>literal text</script>';
    await button.click();
    assert.deepEqual(copied, [text]);
    assert.deepEqual(events, [text]);
    unbind();
    assert.equal(button.click, undefined);
});

test('object snapshots suppress stale success and failure while always restoring busy state', async () => {
    for(const fails of [false, true]){
        const { button } = fixture();
        let resolveCopy, rejectCopy;
        button.ownerDocument.defaultView.navigator.clipboard.writeText = (text) => {
            assert.equal(text, 'old key');
            return new Promise((resolve, reject) => { resolveCopy = resolve; rejectCopy = reject; });
        };
        let current = { key: 'old key' };
        const events = [];
        bindCopyButton(button, {
            read: () => current,
            getText: (snapshot) => snapshot.key,
            onStart(){ button.disabled = true; events.push('start'); },
            onSuccess(){ events.push('success'); },
            onError(){ events.push('error'); },
            onSettled(){ button.disabled = false; events.push('settled'); }
        });
        const pending = button.click();
        assert.equal(button.disabled, true);
        current = { key: 'new key' };
        if(fails) rejectCopy(new Error('Denied')); else resolveCopy();
        await pending;
        assert.equal(button.disabled, false);
        assert.deepEqual(events, ['start', 'settled']);
    }
});

test('custom revisions invalidate same-text snapshots and current failures permit retry', async () => {
    const { button } = fixture();
    let revision = 0;
    let finish;
    button.ownerDocument.defaultView.navigator.clipboard.writeText = () => new Promise((resolve) => { finish = resolve; });
    const events = [];
    bindCopyButton(button, {
        read: () => ({ text: '/a/g', revision }),
        getText: (snapshot) => snapshot.text,
        isCurrent: (snapshot) => snapshot.revision === revision,
        onSuccess(){ events.push('success'); },
        onError(error){ events.push(error.message); }
    });
    const pending = button.click();
    revision++;
    finish();
    await pending;
    assert.deepEqual(events, []);
    button.ownerDocument.defaultView.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
    await button.click();
    assert.deepEqual(events, ['Denied']);
    button.ownerDocument.defaultView.navigator.clipboard.writeText = async () => {};
    await button.click();
    assert.deepEqual(events, ['Denied', 'success']);
});

test('copy icon timers are per button, restart on repeat, and reset cancels pending feedback', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const feedback = createCopyFeedback(globalThis);
    const a = fixture(), b = fixture();
    const checked = (f) => f.icons['[data-icon-check]'].hidden === false;
    feedback.show(a.button);
    t.mock.timers.tick(1000);
    feedback.show(b.button);
    feedback.show(a.button);
    t.mock.timers.tick(1000);
    assert.equal(checked(a), true, 'old timer must not reset a repeated copy');
    feedback.reset(b.button);
    assert.equal(checked(b), false);
    t.mock.timers.tick(1000);
    assert.equal(checked(a), false);
    assert.equal(a.icons['[data-icon-copy]'].hidden, false);
    assert.equal(checked(b), false);
});
