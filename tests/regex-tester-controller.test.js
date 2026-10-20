import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionController } from '../src/tools/regex-tester/js/controller.js';
import { createResult, LIMITS, normalizeTimeoutMs } from '../src/tools/regex-tester/js/result.js';

const sample = { engine: 'javascript', pattern: 'a', text: 'abc', flags: 'g', mode: 'auto' };
function fixture(t){
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const states = [];
    const adapters = [];
    const controller = createExecutionController({
        onState: (state) => states.push(state),
        createAdapter(){
            const adapter = {
                terminated: false,
                terminate(){ this.terminated = true; },
                execute(request, reply, reject){ Object.assign(this, { request, reply, reject }); }
            };
            adapters.push(adapter);
            return adapter;
        }
    });
    t.after(() => controller.dispose());
    return { controller, states, adapters, tick: (ms) => t.mock.timers.tick(ms), latest: () => states.at(-1) };
}

test('debounce coalesces input; editing cancels a Worker and ignores queued old results', (t) => {
    const f = fixture(t);
    f.controller.update(sample);
    f.tick(200);
    f.controller.update({ ...sample, pattern: 'b' });
    f.tick(299);
    assert.equal(f.adapters.length, 0);
    f.tick(1);
    const first = f.adapters[0];
    assert.equal(first.request.pattern, 'b');
    assert.equal(f.latest().status, 'running');
    f.controller.update({ ...sample, pattern: 'c' });
    assert.equal(first.terminated, true);
    first.reply(createResult(first.request));
    first.reject('late error');
    assert.equal(f.latest().status, 'scheduled');
    f.tick(300);
    const second = f.adapters[1];
    second.reply(createResult({ ...second.request, requestId: first.request.requestId }));
    assert.equal(f.latest().status, 'running', 'wrong request ID does not settle active request');
    second.reply(createResult(second.request));
    assert.equal(f.latest().status, 'success');
    assert.equal(f.latest().input.pattern, 'c');
    assert.equal(second.terminated, true);
});

test('Manual cancels pending Auto; Run executes immediately; composition defers Auto', (t) => {
    const f = fixture(t);
    f.controller.update(sample);
    f.controller.update({ ...sample, mode: 'manual' });
    f.tick(500);
    assert.equal(f.adapters.length, 0);
    assert.equal(f.latest().status, 'idle');
    f.controller.run({ ...sample, mode: 'manual' });
    assert.equal(f.adapters.length, 1);
    f.controller.update(sample, { composing: true });
    assert.equal(f.adapters[0].terminated, true);
    f.tick(500);
    assert.equal(f.adapters.length, 1);
    f.controller.update(sample);
    f.tick(300);
    assert.equal(f.adapters.length, 2);
});

test('timeout terminates Worker, switches to Manual and supports a fresh retry', (t) => {
    const f = fixture(t);
    f.controller.run(sample);
    const first = f.adapters[0];
    f.tick(1500);
    assert.equal(first.terminated, true);
    assert.equal(f.latest().status, 'timeout');
    assert.equal(f.latest().mode, 'manual');
    assert.equal(f.latest().result.error.code, 'timeout');
    first.reply(createResult(first.request));
    assert.equal(f.latest().status, 'timeout');
    f.controller.update({ ...sample, mode: f.latest().mode });
    f.tick(10000);
    assert.equal(f.adapters.length, 1, 'no automatic retry after timeout');
    f.controller.run({ ...sample, mode: 'manual' });
    f.adapters[1].reply(createResult(f.adapters[1].request));
    assert.equal(f.latest().status, 'success');
    f.tick(2000);
    assert.equal(f.latest().status, 'success', 'success clears timeout');
});

test('worker errors, startup failures, input limits, cancellation and disposal settle cleanly', (t) => {
    const f = fixture(t);
    f.controller.run(sample);
    f.adapters[0].reject('Cannot load worker.');
    assert.equal(f.latest().result.error.code, 'worker-error');
    assert.equal(f.adapters[0].terminated, true);
    f.controller.run({ ...sample, text: 'a'.repeat(1000001) });
    assert.equal(f.latest().status, 'input-limit');
    assert.equal(f.adapters.length, 1);
    f.controller.update(sample);
    f.controller.cancel();
    f.tick(1000);
    assert.equal(f.adapters.length, 1);
    f.controller.run(sample);
    f.controller.dispose();
    assert.equal(f.adapters[1].terminated, true);
    f.adapters[1].reply(createResult(f.adapters[1].request));
    const count = f.states.length;
    f.controller.update(sample);
    f.controller.run(sample);
    f.tick(5000);
    assert.equal(f.states.length, count);
    const errors = [];
    const broken = createExecutionController({ onState: (state) => errors.push(state), createAdapter(){ throw new Error('Unavailable'); } });
    broken.run(sample);
    assert.equal(errors.at(-1).result.error.code, 'worker-unavailable');
    broken.dispose();
});

test('timeout settings are bounded, snapped to steps and captured separately for each run', (t) => {
    assert.equal(normalizeTimeoutMs(-1), LIMITS.timeoutMinMs);
    assert.equal(normalizeTimeoutMs(Infinity), LIMITS.timeoutDefaultMs);
    assert.equal(normalizeTimeoutMs(NaN), LIMITS.timeoutDefaultMs);
    assert.equal(normalizeTimeoutMs(1234), 1200);
    const f = fixture(t);
    const snapshot = { ...sample, timeoutMs: 2200 };
    f.controller.run(snapshot);
    snapshot.timeoutMs = 500;
    f.tick(2199);
    assert.equal(f.latest().status, 'running', 'later changes do not alter an active deadline');
    f.tick(1);
    assert.equal(f.latest().status, 'timeout');
    assert.match(f.latest().result.error.message, /2200 ms/);
    assert.equal(f.adapters[0].terminated, true);
    for(const [requested, expected] of [[0, LIMITS.timeoutMinMs], [Infinity, LIMITS.timeoutDefaultMs], [100000, LIMITS.timeoutMaxMs]]){
        f.controller.run({ ...sample, timeoutMs: requested });
        assert.equal(f.adapters.at(-1).request.timeoutMs, expected);
        f.tick(expected - 1);
        assert.equal(f.latest().status, 'running');
        f.tick(1);
        assert.equal(f.latest().status, 'timeout');
        assert.equal(f.adapters.at(-1).terminated, true);
    }
});

test('empty pattern or text cancels work and never schedules or runs a Worker in either mode', (t) => {
    const f = fixture(t);
    for(const mode of ['auto', 'manual']){
        for(const empty of [{ pattern: '' }, { text: '' }, { pattern: '', text: '' }]){
            f.controller.update(sample);
            f.controller.update({ ...sample, ...empty, mode });
            f.tick(500);
            assert.equal(f.latest().status, 'idle');
            assert.equal(f.adapters.length, 0, 'clearing input cancels pending work');
            f.controller.run({ ...sample, ...empty, mode });
            assert.equal(f.latest().status, 'idle');
            assert.equal(f.adapters.length, 0, 'direct Run is guarded as well');
        }
    }
    f.controller.run(sample);
    const running = f.adapters[0];
    f.controller.update({ ...sample, text: '' });
    assert.equal(running.terminated, true);
    running.reply(createResult(running.request));
    assert.equal(f.latest().status, 'idle', 'late result cannot restore a cleared result');
    f.tick(2000);
    assert.equal(f.adapters.length, 1);
    f.controller.update({ ...sample, pattern: ' ', text: ' ' });
    f.tick(300);
    assert.equal(f.adapters.length, 2, 'whitespace is meaningful input and is not trimmed');
});
