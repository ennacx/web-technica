import { KeyMaterial } from './key-material.js';
import { PubKey } from './pubkey.js';
import { PPKv3 } from './ppk-v3.js';
import { OpenSSH } from './openssh.js';
import { PKCS8withPBES2 } from './pkcs8-with-pbes2.js';
import { Helper } from './helper.js';
import { Bytes } from '#utils/bytes.js';
import { RFC4253 } from './rfc4253.js';
import { EdDSA_PRESET, PEM_LABEL } from './const.js';

export function validateKeyOptions(settings){
    const { algorithm = 'RSA', length = 2048, curve = 'Ed25519', passphrase = '', encryption = 'none', selectionIndex = -1 } = settings;

    if(!['RSA', 'EdDSA', 'ECDSA'].includes(algorithm)){
        throw new Error('Choose a supported key algorithm.');
    }
    if(algorithm === 'RSA' && ![2048, 3072, 4096].includes(length)) {
        throw new Error('Choose a supported RSA key size.');
    }
    if(algorithm === 'ECDSA' && !['P-256', 'P-384', 'P-521'].includes(curve)){
        throw new Error('Choose a supported ECDSA curve.');
    }
    if(algorithm === 'EdDSA' && !EdDSA_PRESET[curve]){
        throw new Error('Choose Ed25519 or Ed448.');
    }
    if(!['none', 'aes256ctr', 'cc20p1305', 'pkcs8'].includes(encryption)){
        throw new Error('Choose a supported private key format.');
    }
    if(typeof passphrase !== 'string' || (encryption !== 'none' && !passphrase)){
        throw new Error('Enter a non-empty passphrase.');
    }
    if(!Number.isInteger(selectionIndex) || selectionIndex < -1 || selectionIndex > 255){
        throw new Error('Pointer sampling is not ready.');
    }

    const comment = String(settings.comment ?? '').trim().replace(/ +/g, '-').replace(/[^ -~]/g, '');
    const options = { comment, selectionIndex };

    if(algorithm === 'RSA'){
        Object.assign(options, {len: length, prefix: 'ssh-rsa'});
    } else if (algorithm === 'ECDSA'){
        Object.assign(options, {
            len: Number(curve.slice(2)),
            nist: curve,
            prefix: 'ecdsa-sha2-nist' + curve.replace('-', '').toLowerCase()
        });
    } else if(algorithm === 'EdDSA'){
        Object.assign(options, EdDSA_PRESET[curve], {
            name: curve,
            prefix: `ssh-${EdDSA_PRESET[curve].name}`
        });
    }

    return {
        algorithm, options, encryption,
        passphrase: (encryption !== 'none') ? passphrase : ''
    };
}

/**
 * 鍵材料は呼び出し中だけ保持し、画面には必要な出力文字列だけ返す。
 *
 * @param {Object} settings - 鍵生成の設定オブジェクト
 * @param {function} onProgress - 進捗状況を通知するコールバック関数
 * @returns {Promise<Object>} - 鍵材料の生成結果
 */
export async function generateKeypair(settings, onProgress = () => {}){
    const { algorithm, options, encryption, passphrase } = validateKeyOptions(settings);

    if(typeof globalThis.crypto?.subtle?.generateKey !== 'function' || typeof globalThis.crypto?.getRandomValues !== 'function'){
        throw new Error('Web Crypto is unavailable. Use a supported browser over HTTPS or localhost.');
    }

    const count = options.selectionIndex < 0 ? 1 : 7;

    let done = 0;

    const candidates = await Promise.all(Array.from({ length: count }, async () => {
        const material = await KeyMaterial.getInstance(algorithm, options);
        onProgress(++done, count + 2);

        return material;
    }));
    const material = candidates[(options.selectionIndex < 0) ? 0 : options.selectionIndex % count];
    const publicKey = new PubKey(material.spki);
    const publicSSH = await publicKey[({ RSA: 'rsa', ECDSA: 'ecdsa', EdDSA: 'eddsa' })[algorithm]]();

    let privatePart;

    if(algorithm === 'RSA'){
        privatePart = material.rsaPrivatePartPPKv3();
    }
    else if(algorithm === 'ECDSA'){
        privatePart = material.ecdsaPrivatePart();
    }
    // PuTTYのEdDSA秘密部はlittle-endian固定長のシードをSSH stringに格納する。
    else if (algorithm === 'EdDSA'){
        privatePart = RFC4253.writeStringBytes(Bytes.fromBase64(material.jwk.d));
    }

    const ppk = await PPKv3.generate(
        options.prefix,
        privatePart,
        options.comment,
        publicSSH.raw,
        (passphrase) ? 'aes256-cbc' : 'none',
        passphrase
    );
    onProgress(++done, count + 2);

    let privatePEM;

    if(encryption === 'none'){
        privatePEM = Helper.toPEM(material.pkcs8, PEM_LABEL.privateKey, 64);
    }
    else if(encryption === 'pkcs8'){
        const { encrypted } = await new PKCS8withPBES2(passphrase).encrypt(material.pkcs8);

        privatePEM = Helper.toPEM(encrypted, PEM_LABEL.privateKey, 64, PEM_LABEL.encryptedAdd);
    } else{
        privatePEM = await OpenSSH.makeOpenSSHPrivateKeyV1(encryption, options.prefix, material, passphrase, options.comment);
    }

    onProgress(++done, count + 2);

    return {
        fingerprint: `${options.prefix} ${options.len} SHA256:${publicSSH.fingerprint}`,
        openssh: `${options.prefix} ${publicSSH.pubkey}${(options.comment) ? ` ${options.comment}` : ''}`,
        publicPEM: Helper.toPEM(material.spki, PEM_LABEL.publicKey, 64),
        privatePEM,
        ppk,
        filenameStem: `id_${(algorithm === 'EdDSA') ? options.name.toLowerCase() : algorithm.toLowerCase()}`,
        comment: options.comment
    };
}
