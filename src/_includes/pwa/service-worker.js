const CACHE_PREFIX = __CACHE_PREFIX__;
const CACHE_NAME = __CACHE_NAME__;
const PRECACHE_URLS = __PRECACHE_URLS__;
const SCOPE = new URL('./', self.location.href);
const STATIC_URLS = new Set(PRECACHE_URLS.map((url) => new URL(url, SCOPE).href));

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        try{
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
        } catch(e){
            await caches.delete(CACHE_NAME);

            throw e;
        }
    })());

    /*
     * Important
     *
     * 現在のバージョンは、そのタブがすべて閉じられるまで保持すること。
     * アクティブなツールを再読み込みしたり、そのHTMLを別のバージョンのモジュールと混在させたりしてはならない。
     */
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)));
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // SRIリソースのダウンロード、外部サービス、送信を傍受しないこと。
    if(
        request.method !== 'GET'
        || url.origin !== SCOPE.origin
        || !url.pathname.startsWith(SCOPE.pathname)
        || request.cache === 'no-store'
        || request.headers.has('range')
    ){
        return;
    }

    const navigation = request.mode === 'navigate';
    if(!navigation && url.search){
        return;
    }

    const canonical = new URL(url.pathname, SCOPE.origin);
    if(navigation){
        canonical.pathname = canonical.pathname.replace(/\/index\.html$/, '/');

        if(!STATIC_URLS.has(canonical.href) && STATIC_URLS.has(canonical.href + '/')){
            canonical.pathname += '/';
        }
    }

    if(STATIC_URLS.has(canonical.href)){
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);

            return await cache.match(canonical.href) ?? fetch(request);
        })());
    }
    else if(navigation){
        event.respondWith((async () => {
            try{
                return await fetch(request);
            } catch{
                const cache = await caches.open(CACHE_NAME);
                const offline = await cache.match(new URL('offline.html', SCOPE).href);

                return new Response(await offline.text(), {
                    status: 503,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }
        })());
    }
});
