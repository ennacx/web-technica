export function randomBytes(length = 16, crypto = globalThis.crypto){
    if(!crypto || typeof crypto?.getRandomValues !== 'function'){
        throw new Error('WebCrypto is not available.');
    }

    return crypto.getRandomValues(new Uint8Array(length));
}

export function randomUint8(crypto = globalThis.crypto){
    if(!crypto || typeof crypto?.getRandomValues !== 'function'){
        throw new Error('WebCrypto is not available.');
    }

    return crypto.getRandomValues(new Uint8Array(1))[0];
}

export function randomUint32(crypto = globalThis.crypto){
    if(!crypto || typeof crypto?.getRandomValues !== 'function'){
        throw new Error('WebCrypto is not available.');
    }

    return crypto.getRandomValues(new Uint32Array(1))[0];
}

export async function digestBytes(buffer, algorithm = 'SHA-256', crypto = globalThis.crypto){
    if(!crypto || typeof crypto?.subtle?.digest !== 'function'){
        throw new Error('WebCrypto is not available.');
    }

    return new Uint8Array(await crypto.subtle.digest(algorithm, buffer));
}
