import { Bytes } from '#utils/bytes.js';
import { digestBytes } from '#utils/crypto.js';

export const ALLOWED_EXTENSIONS = ['js', 'css'];
export const ALGORITHMS = ['SHA-256', 'SHA-384', 'SHA-512'];

export function getExtension(target){
    const extension = (name) => {
        const last = String(name).split('/').pop();

        return last.includes('.') ? last.split('.').pop().toLowerCase() : '';
    };

    if(target instanceof URL){
        const last = target.pathname.split('/').pop();
        if(last?.includes('.')) {
            return extension(last);
        }

        return extension(target.searchParams.get('file') || target.searchParams.get('filename') || '');
    }

    return extension(target ?? '');
}

export function validateURL(value){
    try{
        const url = new URL(value);
        const extension = getExtension(url);

        if(!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !ALLOWED_EXTENSIONS.includes(extension)){
            return { isValid: false };
        }

        return { isValid: true, extension, url: url.href };
    } catch(e){
        return { isValid: false };
    }
}

export function validateFile(file){
    const extension = getExtension(file?.name);

    return { isValid: (Boolean(file?.name) && ALLOWED_EXTENSIONS.includes(extension)), extension };
}

/**
 * 読み取った同じレスポンスをハッシュ化する。事前のHEADリクエストは不要。
 *
 * @param {string} url
 * @param {function} fetcher
 */
export async function fetchContent(url, fetcher = globalThis.fetch){
    if(!validateURL(url).isValid){
        throw new Error('Enter an HTTP or HTTPS URL ending in .js or .css.');
    }

    let response;

    try{
        response = await fetcher(url, {
            mode: 'cors',
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        });
    } catch(e){
        throw new Error('The resource could not be fetched. Check the URL, connection, and CORS settings, or select a local file.');
    }

    if(!response.ok){
        throw new Error(`The resource returned HTTP ${response.status}. Check the URL or select a local file.`);
    }

    return response.arrayBuffer();
}

export function arrayBufferToBase64(buffer){
    return Bytes.toBase64(buffer);
}

export async function sriFromArrayBuffer(buffer, algorithm, crypto = globalThis.crypto){
    if(!ALGORITHMS.includes(algorithm)){
        throw new Error('Choose SHA-256, SHA-384, or SHA-512.');
    }
    if(typeof crypto?.subtle?.digest !== 'function'){
        throw new Error('Web Crypto is unavailable. Use a supported browser over HTTPS or localhost.');
    }

    const digest = await digestBytes(buffer, algorithm, crypto);

    return algorithm.toLowerCase().replace('-', '') + '-' + arrayBufferToBase64(digest);
}

function escapeAttribute(value) {
    return String(value).replace(/[&"'<>]/g, (character) => ({
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
        '<': '&lt;',
        '>': '&gt;'
    })[character]);
}

export function makeHtmlTag(source, sri, extension){
    if(!ALLOWED_EXTENSIONS.includes(extension)){
        throw new Error('Unsupported resource type.');
    }

    const escapedSource = escapeAttribute(source);
    const attributes = `integrity="${escapeAttribute(sri)}" crossorigin="anonymous"`;

    return (extension === 'js') ?
        `<script src="${escapedSource}" ${attributes}></script>` :
        `<link rel="stylesheet" href="${escapedSource}" ${attributes}>`;
}
