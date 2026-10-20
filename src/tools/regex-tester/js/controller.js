import { createEngineAdapter } from './engine-adapter.js';
import { LIMITS, failure, validateInput, normalizeTimeoutMs } from './result.js';

export function createExecutionController({
    onState,
    createAdapter = createEngineAdapter,
    debounceMs = LIMITS.debounceMs,
    timeoutMs = LIMITS.timeoutDefaultMs
}){
    let sequence = 0;
    let debounce = null;
    let timeout = null;
    let active = null;
    let input = null;
    let mode = 'auto';
    let disposed = false;

    function stop(){
        clearTimeout(debounce);
        clearTimeout(timeout);

        debounce = timeout = null;
        active?.adapter.terminate();

        active = null;
    }

    function emit(status, result = null){
        onState({ status, result, input, mode, requestId: sequence });
    }

    function invalidate(snapshot){
        ++sequence; // Invalidate before terminating, including any queued responses.

        stop();

        input = { engine: 'javascript', ...snapshot,
            timeoutMs: normalizeTimeoutMs(snapshot.timeoutMs ?? timeoutMs) };
        mode = (input.mode === 'manual') ? 'manual' : 'auto';
    }

    function execute(id){
        if(disposed || id !== sequence){
            return;
        }

        debounce = null;

        if(input.pattern === '' || input.text === ''){
            emit('idle');
            return;
        }

        const request = { ...input, requestId: id };
        const invalid = validateInput(request);

        if(invalid){
            emit(invalid.status, invalid);

            return;
        }

        function finish(result){
            if(disposed || id !== sequence || active?.id !== id){
                return;
            }

            stop();

            emit(result.status, result);
        }

        try{
            const adapter = createAdapter(request.engine);

            active = { id, adapter };

            emit('running');

            timeout = setTimeout(() => {
                if(id !== sequence || disposed || active?.id !== id){
                    return;
                }

                mode = 'manual';

                // finish terminates the running Worker; a timer alone cannot stop RegExp.
                finish(failure(request, 'timeout', 'timeout', `Execution exceeded ${request.timeoutMs} ms. Switched to Manual; edit the pattern or text before retrying.`));
            }, request.timeoutMs);

            adapter.execute(
                request,
                (result) => {
                    if(result?.requestId !== id || result?.engine !== request.engine){
                        return;
                    }

                    finish(result);
                },
                (message) => finish(failure(request, 'runtime-error', 'worker-error', message))
            );
        } catch(e){
            stop();

            emit('runtime-error', failure(request, 'runtime-error', 'worker-unavailable', 'Could not start the regex worker. Use a browser supporting module Workers and RegExp match indices.'));
        }
    }

    return {
        update(snapshot, { composing = false } = {}){
            if(disposed){
                return;
            }

            invalidate(snapshot);

            if(mode === 'manual' || composing || input.pattern === '' || input.text === ''){
                emit('idle');

                return;
            }

            emit('scheduled');

            const id = sequence;

            debounce = setTimeout(() => execute(id), debounceMs);
        },
        run(snapshot){
            if(disposed){
                return;
            }

            invalidate(snapshot);
            execute(sequence);
        },
        cancel(){
            if(!disposed){
                ++sequence;

                stop();
                emit('idle');
            }
        },
        dispose(){
            ++sequence;

            stop();

            disposed = true;
        }
    };
}
