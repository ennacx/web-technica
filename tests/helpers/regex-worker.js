// Browser Worker API bridge for exercising the shipped module in a real Node isolate.
import { parentPort, workerData } from 'node:worker_threads';

globalThis.self = {
    addEventListener(name, callback){
        if(name === 'message'){
            parentPort.on('message', (data) => callback({ data }));
        }
    },
    postMessage: (data) => parentPort.postMessage(data)
};

await import(workerData.module);
