import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServiceWorker } from '../scripts/build-pwa.mjs';

function fixture(t, prefix = '/web-technica/', runMode = 'build'){
    const directory = mkdtempSync(path.join(tmpdir(), 'web-technica-pwa-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const outputDirectory = path.join(directory, 'dist');
    const source = path.join(directory, 'source');
    mkdirSync(path.join(outputDirectory, 'pwdgen'), { recursive: true });
    mkdirSync(path.join(outputDirectory, 'assets'), { recursive: true });
    mkdirSync(source);
    const pages = ['index.html', 'pwdgen/index.html', 'offline.html'];
    for(const page of pages){
        writeFileSync(path.join(outputDirectory, page), `<h1>${page}</h1>`);
    }
    writeFileSync(path.join(outputDirectory, 'stale.html'), 'removed page');
    writeFileSync(path.join(source, 'app.js'), 'export const version = 1;');
    writeFileSync(path.join(source, 'app.js.map'), '{}');
    const options = {
        outputDirectory, pathPrefix: prefix, runMode,
        results: pages.map((page) => ({ outputPath: path.join(outputDirectory, page) })),
        passthrough: { [source]: 'assets' }
    };
    function build(){
        // Eleventy has completed passthrough copying before the after hook.
        for(const name of ['app.js', 'app.js.map']){
            writeFileSync(path.join(outputDirectory, 'assets', name), readFileSync(path.join(source, name)));
        }
        buildServiceWorker(options);
        return readFileSync(path.join(outputDirectory, 'sw.js'), 'utf8');
    }
    return { build, source, options };
}

function worker(code){
    const handlers = {};
    const stores = new Map();
    const origin = 'https://example.com';
    const scope = /const CACHE_PREFIX = "web-technica:([^"]+):"/.exec(code);
    const base = origin + (scope ? decodeURIComponent(scope[1]) : '/web-technica/');
    let online = true;
    let broken = false;
    let skipped = false;
    let claimed = false;
    let unregistered = false;
    const key = (request) => typeof request === 'string' ? new URL(request, base).href : request.url;
    const fetcher = async (request) => {
        if(!online) throw new TypeError('Offline');
        return new Response(key(request), { status: broken ? 404 : 200 });
    };
    const caches = {
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        open: async (name) => {
            if(!stores.has(name)) stores.set(name, new Map());
            const entries = stores.get(name);
            return {
                async addAll(requests){
                    const responses = await Promise.all(requests.map(fetcher));
                    if(responses.some((response) => !response.ok)) throw new Error('Precache failed');
                    requests.forEach((request, i) => entries.set(key(request), responses[i]));
                },
                async match(request){ return entries.get(key(request))?.clone(); }
            };
        }
    };
    const context = vm.createContext({
        URL, Set, Response, caches, fetch: fetcher,
        Request: class extends Request {
            constructor(url, options){ super(new URL(url, base), options); }
        },
        self: {
            location: { href: base + 'sw.js' },
            addEventListener(name, callback){ handlers[name] = callback; },
            skipWaiting(){ skipped = true; },
            clients: { async claim(){ claimed = true; } },
            registration: { async unregister(){ unregistered = true; } }
        }
    });
    vm.runInContext(code, context);
    return {
        stores,
        prefix: scope ? `web-technica:${scope[1]}:` : undefined,
        urls: scope ? vm.runInContext('[...STATIC_URLS]', context) : [],
        state: () => ({ skipped, claimed, unregistered }),
        online(value){ online = value; },
        broken(value){ broken = value; },
        async lifecycle(name){
            let result;
            handlers[name]({ waitUntil(promise){ result = promise; } });
            await result;
        },
        async request(url, options = {}){
            let result;
            handlers.fetch({
                request: { url: new URL(url, base).href, method: 'GET', mode: 'navigate',
                    cache: 'default', headers: new Headers(), ...options },
                respondWith(promise){ result = promise; }
            });
            return await result;
        }
    };
}

test('precache is scoped, excludes stale files/maps, and changes only when content changes', (t) => {
    for(const prefix of ['/', '/web-technica/']){
        const files = fixture(t, prefix);
        const first = files.build();
        assert.equal(files.build(), first);
        const sw = worker(first);
        assert.ok(sw.urls.includes(`https://example.com${prefix}`));
        assert.ok(sw.urls.includes(`https://example.com${prefix}pwdgen/`));
        assert.ok(sw.urls.every((url) => !url.endsWith('.map') && !url.endsWith('stale.html')));
        writeFileSync(path.join(files.source, 'app.js'), 'export const version = 2;');
        assert.notEqual(files.build(), first);
    }
});

test('exact-file passthrough destinations retain their filename while glob destinations append it', (t) => {
    const files = fixture(t);
    const filename = 'THIRD-PARTY-LICENSES.txt';
    const licenseSource = path.join(files.source, filename);
    const destination = `keygen/js/${filename}`;
    writeFileSync(licenseSource, 'Third-party licenses');
    mkdirSync(path.join(files.options.outputDirectory, 'keygen/js'), { recursive: true });
    writeFileSync(path.join(files.options.outputDirectory, destination), 'Third-party licenses');
    files.options.passthrough = {
        [licenseSource]: destination,
        [`${files.source.replaceAll('\\', '/')}/*.js`]: 'assets'
    };
    const sw = worker(files.build());
    assert.ok(sw.urls.includes(`https://example.com/web-technica/${destination}`));
    assert.ok(sw.urls.includes('https://example.com/web-technica/assets/app.js'));
    assert.ok(sw.urls.every((url) => !url.includes(`${filename}/${filename}`)));
});

test('cached pages/modules work offline; network requests and unknown routes remain distinct', async (t) => {
    const sw = worker(fixture(t).build());
    await sw.lifecycle('install');
    assert.deepEqual(sw.state(), { skipped: false, claimed: false, unregistered: false });
    sw.online(false);
    for(const route of ['', 'pwdgen/', 'pwdgen', 'pwdgen/index.html', 'pwdgen/?value=secret']){
        const response = await sw.request(route);
        assert.equal(response.status, 200);
        assert.ok(!(await response.text()).includes('secret'));
    }
    assert.equal((await sw.request('assets/app.js', { mode: 'cors' })).status, 200);
    assert.equal((await sw.request('unknown/')).status, 503);
    assert.equal(await sw.request('https://cdn.example.com/file.js', { mode: 'cors' }), undefined);
    assert.equal(await sw.request('/other-project/', { mode: 'cors' }), undefined);
    assert.equal(await sw.request('assets/app.js', { mode: 'cors', cache: 'no-store' }), undefined);
    assert.equal(await sw.request('assets/app.js?download=secret', { mode: 'cors' }), undefined);
    assert.equal(await sw.request('pwdgen/', { method: 'POST' }), undefined);
    assert.equal(await sw.request('assets/app.js', { mode: 'cors', headers: new Headers({ range: 'bytes=0-10' }) }), undefined);
    sw.online(true);
    sw.broken(true);
    assert.equal((await sw.request('missing/')).status, 404);
});

test('activation deletes only older caches belonging to this application scope', async (t) => {
    const sw = worker(fixture(t).build());
    sw.stores.set(sw.prefix + 'old', new Map());
    sw.stores.set('another-app', new Map());
    sw.stores.set('web-technica:%2Fanother-scope%2F:old', new Map());
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    assert.equal(sw.stores.has(sw.prefix + 'old'), false);
    assert.equal(sw.stores.has('another-app'), true);
    assert.equal(sw.stores.has('web-technica:%2Fanother-scope%2F:old'), true);
    assert.equal(sw.stores.size, 3);
});

test('failed installation discards its cache and preserves the previous working version', async (t) => {
    const sw = worker(fixture(t).build());
    sw.stores.set(sw.prefix + 'old', new Map());
    sw.broken(true);
    await assert.rejects(sw.lifecycle('install'), /Precache failed/);
    assert.deepEqual([...sw.stores.keys()], [sw.prefix + 'old']);
});

test('development worker retires a local production worker and its scoped caches', async (t) => {
    const sw = worker(fixture(t, '/web-technica/', 'serve').build());
    sw.stores.set('web-technica:%2Fweb-technica%2F:old', new Map());
    sw.stores.set('other-app', new Map());
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    assert.deepEqual(sw.state(), { skipped: true, claimed: true, unregistered: true });
    assert.deepEqual([...sw.stores.keys()], ['other-app']);
});

test('client registers the exact scope and announces both pending and already-started updates', async () => {
    const code = readFileSync('src/assets/js/components/pwa.js', 'utf8').replace(/^import[^\n]+\n/, '');
    const registration = new EventTarget();
    registration.active = { scriptURL: 'https://example.com/web-technica/sw.js' };
    registration.installing = new EventTarget();
    const status = { hidden: true, textContent: '' };
    let registered;
    vm.runInNewContext(code, {
        URL,
        querySel: (selector) => selector === '[data-pwa]' ?
            { dataset: { pwa: '/web-technica/sw.js', enabled: 'true' } } : status,
        location: { href: 'https://example.com/web-technica/pwdgen/' },
        window: { isSecureContext: true },
        navigator: { serviceWorker: {
            async register(url, options){ registered = { url, options }; return registration; }
        } }
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(registered.url, 'https://example.com/web-technica/sw.js');
    assert.equal(registered.options.scope, 'https://example.com/web-technica/');
    assert.equal(registered.options.updateViaCache, 'none');
    assert.equal(status.hidden, true);
    registration.waiting = {};
    registration.installing.dispatchEvent(new Event('statechange'));
    assert.equal(status.hidden, false);
    assert.match(status.textContent, /Close all Web-Technica tabs/);
    status.hidden = true;
    registration.dispatchEvent(new Event('updatefound'));
    assert.equal(status.hidden, false);
});
