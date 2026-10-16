import { querySel } from '../utils/dom.js';

const settings = querySel('[data-pwa]');
const status = querySel('#pwa-update-status');

if(settings && 'serviceWorker' in navigator && window.isSecureContext){
    const workerURL = new URL(settings.dataset.pwa, location.href);
    const scope = new URL('./', workerURL);
    const cachePrefix = `web-technica:${encodeURIComponent(scope.pathname)}:`;

    async function initialize(){
        if(settings.dataset.enabled !== 'true'){
            const registration = await navigator.serviceWorker.getRegistration(scope.href);
            const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
            if(worker?.scriptURL === workerURL.href){
                await registration.unregister();
                await Promise.all((await caches.keys())
                    .filter((name) => name.startsWith(cachePrefix))
                    .map((name) => caches.delete(name)));
            }

            return;
        }

        const registration = await navigator.serviceWorker.register(workerURL.href, {
            scope: scope.href,
            updateViaCache: 'none'
        });

        function notifyUpdate(){
            if(registration.waiting && registration.active && status){
                status.textContent = 'An update is ready. Close all Web-Technica tabs and app windows, then reopen to apply it.';
                status.hidden = false;
            }
        }

        function watchInstalling(){
            registration.installing?.addEventListener('statechange', notifyUpdate);
            notifyUpdate();
        }

        registration.addEventListener('updatefound', watchInstalling);
        watchInstalling();
    }

    // Registration failure must not prevent use of any online tool.
    initialize().catch(() => {});
}
