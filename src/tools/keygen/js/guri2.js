import { digestBytes, randomUint8 } from '#utils/crypto.js';
import { getById } from '#utils/dom.js';
import { Bytes } from '#utils/bytes.js';

/* PuTTYgen に存在したギミック。サンプル数をエントロピービット数とは呼ばない。 */

export function initializePointerCollector(document, onReady, onError){
    const get = (id) => getById(id, document);
    const zone = get('guri2-zone');
    const progress = get('guri2-progress');
    const status = get('guri2-status');
    const output = get('guri2-out');

    const pool = new Uint8Array(1024);
    const target = 128;

    let count = 0;
    let started = false;
    let enabled = false;
    let complete = false;
    let revision = 0;
    let selectionIndex = -1;

    function reset(active = enabled){
        revision++;
        enabled = active;
        pool.fill(0);
        count = 0;
        started = complete = false;
        selectionIndex = -1;

        progress.value = 0;
        zone.textContent = 'Click, tap, or press Space to start';
        zone.disabled = !active;
        output.textContent = '';
        status.textContent = `Samples: 0 / ${target}`;
    }

    async function sample(x, y){
        if(!enabled || complete || zone.disabled){
            return;
        }

        if(!started){
            started = true;
            zone.textContent = 'Move, click, tap, or press Space here';

            return;
        }

        const generation = revision;
        const time = document.defaultView.performance.now();
        const random = randomUint8();

        pool[(count * 2) % pool.length]     ^= (x ^ (x >>> 3) ^ (y << 1) ^ (y >>> 2)) & 255;
        pool[(count * 2 + 1) % pool.length] ^= ((time * 1000) ^ (random << 5)) & 255;

        progress.value = ++count;
        status.textContent = `Samples: ${count} / ${target}`;

        if(count === target){
            complete = true;

            try{
                const digest = await digestBytes(pool.slice(0, 256));

                if(generation !== revision){
                    return;
                }

                selectionIndex = digest.reduce((value, byte) => value ^ byte, 0);
                output.textContent = Bytes.toHex(digest);
                status.textContent = 'Sampling complete. Generating key pair…';
                zone.textContent = 'Sampling complete';

                onReady();
            } catch(e){
                if(generation === revision){
                    reset();

                    onError('Pointer sampling failed. Reset and try again.');
                }
            }
        }
    }

    const add = (event) => {
        sample(event.clientX | 0, event.clientY | 0)
            .catch(() => onError('Pointer sampling failed. Reset and try again.'));
    };

    zone.addEventListener('pointerdown', add);
    zone.addEventListener('pointermove', (event) => {
        if(started){
            add(event);
        }
    });

    // ネイティブbuttonのEnter/Space操作もサンプルを追加できる
    zone.addEventListener('click', (event) => {
        if(event.detail === 0){
            add(event);
        }
    });

    reset(false);

    return {
        reset,
        get selectionIndex(){
            return selectionIndex;
        }
    };
}
