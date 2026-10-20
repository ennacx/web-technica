import { LIMITS, createResult, failure, validateInput } from '../result.js';

const supportsIndices = (() => {
    try{
        return new RegExp('', 'd').hasIndices;
    } catch(e){
        return false;
    }
})();

function range(offsets){
    return {
        start: offsets?.[0] ?? null,
        end: offsets?.[1] ?? null
    };
}

/**
 * ネイティブのRegExpマッチ結果を、共通の結果規約へと変換する純粋なアダプター。
 * ブラウザ上のWorker内でのみ呼び出される。Node環境のテストでは、これを直接実行する。
 *
 * @param request
 * @return {{requestId: *, engine: *, offsetUnit: string, status: string, matches: [], truncated: boolean, truncationReason: null, elapsedMs: number, error: null}}
 */
export function executeJavaScript(request){
    const invalid = validateInput(request);

    if(invalid){
        return invalid;
    }

    if(request.engine !== 'javascript'){
        return failure(request, 'runtime-error', 'unsupported-engine', 'This engine is not available.');
    }

    if(!supportsIndices){
        return failure(request, 'runtime-error', 'unsupported-feature', 'This browser does not support RegExp match indices. Use a newer browser.');
    }

    const started = performance.now();

    let expression;

    // Regexオプション `d` は、パターンを検索したり解析したりすることなく、正確なキャプチャオフセットを提供する。
    try{
        expression = new RegExp(request.pattern, (request.flags.includes('d')) ? request.flags : `${request.flags}d`);
    } catch(e){
        return failure(request, 'syntax-error', 'invalid-pattern-or-flags', e.message);
    }

    try{
        const result = createResult(request);

        // ネイティブの matchAll は Unicode を考慮したルールに基づいて空のマッチを前進させる。
        // また、その RegExp メソッドは、g フラグを強制することなく、単一マッチの場合にも対応する。

        const iterator = expression[Symbol.matchAll](request.text);

        let captures = 0;

        for(const match of iterator){
            if(result.matches.length === LIMITS.matches){
                result.truncated = true;
                result.truncationReason = 'match-limit';

                break;
            }

            const names = Object.entries(match.indices.groups ?? {});
            const count = match.length - 1 + names.length;

            if(captures + count > LIMITS.captureRanges){
                result.truncated = true;
                result.truncationReason = 'capture-limit';

                break;
            }

            captures += count;

            result.matches.push({
                ...range(match.indices[0]),
                groups: match.indices.slice(1).map((offsets, i) => ({ index: i + 1, ...range(offsets) })),
                namedGroups: names.map(([name, offsets]) => ({ name, ...range(offsets) }))
            });
        }

        result.elapsedMs = performance.now() - started;

        return result;
    } catch(e){
        return failure(request, 'runtime-error', 'execution-failed', e.message);
    }
}
