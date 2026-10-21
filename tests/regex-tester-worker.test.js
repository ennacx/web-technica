import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createExecutionController } from '../src/tools/regex-tester/js/controller.js';

test('real Worker executes the shipped engine, ReDoS can be terminated, and retry succeeds', { timeout: 10000 }, async (t) => {
    const previous = globalThis.Worker;
    const workers = [];
    globalThis.Worker = class {
        constructor(url, options){
            assert.equal(options.type, 'module');
            assert.ok(url.href.endsWith('/regex-tester/js/workers/javascript.worker.js'));
            this.worker = new NodeWorker(new URL('./helpers/regex-worker.js', import.meta.url), { workerData: { module: url.href } });
            workers.push(this);
            this.worker.on('message', (data) => this.onmessage?.({ data }));
            this.worker.on('error', () => this.onerror?.({ preventDefault(){} }));
        }
        postMessage(data){ this.worker.postMessage(data); }
        terminate(){ this.terminated = true; void this.worker.terminate(); }
    };
    let resolve;
    const states = [];
    const controller = createExecutionController({ timeoutMs: 1500, onState(state){
        states.push(state);
        if(state.result){ resolve?.(state); }
    } });
    t.after(() => { controller.dispose(); workers.forEach((worker) => worker.terminate()); globalThis.Worker = previous; });
    async function run(pattern, text, flags = 'gu'){
        const promise = new Promise((done) => { resolve = done; });
        controller.run({ pattern, text, flags, engine: 'javascript', mode: 'manual' });
        return promise;
    }
    const first = await run('(?<value>日本)', '😀日本');
    assert.equal(first.status, 'success');
    assert.deepEqual(first.result.matches[0].namedGroups, [{ name: 'value', start: 2, end: 4 }]);
    const doomed = run('(a+)+$', 'a'.repeat(32) + '!');
    let mainThreadAlive = false;
    const pulse = setTimeout(() => { mainThreadAlive = true; }, 20);
    const timeout = await doomed;
    clearTimeout(pulse);
    assert.equal(timeout.status, 'timeout');
    assert.equal(mainThreadAlive, true);
    assert.equal(workers[1].terminated, true);
    const recovered = await run('a', 'abc');
    assert.equal(recovered.status, 'success');
    assert.equal(workers.length, 3);
    assert.equal(states.filter((state) => state.status === 'timeout').length, 1);
});
