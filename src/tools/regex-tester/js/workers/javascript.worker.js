import { executeJavaScript } from '../engines/javascript.js';

self.addEventListener('message', (event) => {
    self.postMessage(executeJavaScript(event.data));
});
