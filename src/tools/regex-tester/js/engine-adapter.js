/**
 * エンジンアダターを生成する。
 *
 * 将来的なエンジンは、このAPIの背後で独自のWorkerを提供し、正規化された結果を返す。
 * エンジンのインポートはUIスレッドから除外すること。相対URLはルートおよびページに対して有効。
 *
 * @param {string} engine - エンジン名
 * @return {{execute(*, *, *): void, terminate(): void}}
 */
export function createEngineAdapter(engine){
    if(engine !== 'javascript'){
        throw new Error('This engine is not available.');
    }

    const worker = new Worker(
        new URL('./workers/javascript.worker.js', import.meta.url),
        {
            type: 'module'
        }
    );

    return {
        execute(request, onResult, onError){
            worker.onmessage = (event) => onResult(event.data);
            worker.onerror = (event) => {
                event.preventDefault();

                onError('The regex worker failed. Your browser may not support this engine.');
            };
            worker.onmessageerror = () => onError('The regex worker returned an unreadable result.');
            worker.postMessage(request);
        },
        terminate(){
            worker.terminate();
        }
    };
}
