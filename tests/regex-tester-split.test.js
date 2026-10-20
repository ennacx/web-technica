import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupSplitPane } from '../src/tools/regex-tester/js/split-pane.js';

test('input resizing grows the workspace without borrowing height from results', (t) => {
    const previousStyle = globalThis.getComputedStyle;
    const previousObserver = globalThis.ResizeObserver;
    const listeners = {};
    const attributes = {};
    const properties = {};
    let capture = null;
    let resized;
    const sizes = { '--input-min': 400, '--input-default': 480, '--input-max': 1600 };
    const workspace = {
        style: { setProperty(name, value){ properties[name] = value; } },
        dataset: {},
        firstElementChild: { getBoundingClientRect: () => ({ height: Number.parseFloat(properties['--input-height']) }) }
    };
    const splitter = {
        addEventListener(name, fn){ listeners[name] = fn; },
        setAttribute(name, value){ attributes[name] = value; },
        setPointerCapture(id){ capture = id; },
        hasPointerCapture(id){ return capture === id; },
        releasePointerCapture(){ capture = null; },
        focus(){}
    };
    const resetButton = { addEventListener(name, fn){ this[name] = fn; } };
    globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => `${sizes[name]}px` });
    globalThis.ResizeObserver = class { constructor(fn){ resized = fn; } observe(){} };
    t.after(() => { globalThis.getComputedStyle = previousStyle; globalThis.ResizeObserver = previousObserver; });
    setupSplitPane(workspace, splitter, resetButton);
    const height = () => Number.parseFloat(properties['--input-height']);
    const fire = (name, values = {}) => listeners[name]({ preventDefault(){}, isPrimary: true, button: 0, pointerId: 1, pageY: 400, ...values });
    assert.equal(height(), 480);
    fire('pointerdown');
    assert.equal(capture, 1);
    fire('pointermove', { pointerId: 2, pageY: 900 });
    assert.equal(height(), 480, 'ignore unrelated pointers');
    fire('pointermove', { pageY: 900, clientY: 500 });
    assert.equal(height(), 980, 'input can exceed the old total height even during page scrolling');
    assert.deepEqual(Object.keys(properties), ['--input-height'], 'results and overall height are never assigned');
    fire('pointermove', { pageY: -900 });
    assert.equal(height(), 400, 'preserve input minimum');
    fire('pointercancel');
    assert.equal(capture, null);
    assert.equal(workspace.dataset.resizing, undefined);
    fire('pointermove', { pageY: 900 });
    assert.equal(height(), 400, 'cancelled drag stops resizing');
    fire('keydown', { key: 'ArrowDown', shiftKey: true });
    assert.equal(height(), 450);
    fire('keydown', { key: 'End' });
    assert.equal(height(), 1600);
    fire('keydown', { key: 'Home' });
    assert.equal(height(), 400);
    for(const reset of [() => fire('dblclick'), () => fire('keydown', { key: 'Enter' }), () => resetButton.click()]){
        reset();
        assert.equal(height(), 480);
        fire('keydown', { key: 'Home' });
    }
    resetButton.click();
    sizes['--input-min'] = 480;
    sizes['--input-default'] = 560;
    resized();
    assert.equal(height(), 560, 'reset uses responsive defaults');
    fire('pointerdown', { pointerType: 'touch' });
    fire('pointermove', { pointerType: 'touch', pageY: -500 });
    assert.equal(height(), 480, 'mobile input minimum');
    fire('lostpointercapture');
    assert.equal(workspace.dataset.resizing, undefined);
    resized();
    assert.equal(height(), 480, 'user height survives workspace changes');
    assert.equal(attributes['aria-valuenow'], 480);
    const scss = readFileSync('src/tools/regex-tester/css/regex-tester.scss', 'utf8');
    for(const rule of scss.match(/\.regex-workspace \{([^}]+)\}/g)){
        assert.doesNotMatch(rule, /(?:^|\n)\s*(?:max-)?height\s*:/, 'workspace grows with children');
        assert.doesNotMatch(rule, /\dfr/, 'panels do not compete for fractional tracks');
    }
    assert.match(scss, /\.regex-results-pane \{\s*min-height: var\(--results-min\);\s*height: clamp/);
});
