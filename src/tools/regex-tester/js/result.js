// TODO: 制限値 (暫定) 実際のブラウザ環境でのReDoSおよびレンダリングに関する測定結果に基づき調整を行う
export const LIMITS = Object.freeze({
    // 実行前の入力待ち時間 (ms)
    debounceMs: 300,

    // 実行開始後のプロセスのデフォルト制限時間 (ms)
    timeoutDefaultMs: 1500,
    // 実行開始後のプロセスの最小制限時間 (ms)
    timeoutMinMs: 500,
    // 実行開始後のプロセスの最大制限時間 (ms)
    timeoutMaxMs: 10_000,
    // 実行開始後のプロセスの制限時間ステップ値 (ms)
    timeoutStepMs: 100,

    patternLength: 10_000,
    textLength: 1_000_000,
    matches: 1000,
    captureRanges: 10_000,
    displayedMatches: 100,
    displayedGroups: 100,
    highlightedLength: 100_000,
    displayedValueLength: 1000
});

/**
 * タイムアウト時間範囲内になるよう調整された値を返却する。
 *
 * @param {number} value - タイムアウト時間 (ms)
 * @return {number} - 範囲内になるよう調整されたタイムアウト時間
 */
export function normalizeTimeoutMs(value){
    const duration = (Number.isFinite(value)) ? value : LIMITS.timeoutDefaultMs;
    const bounded = Math.max(LIMITS.timeoutMinMs, Math.min(LIMITS.timeoutMaxMs, duration));

    return LIMITS.timeoutMinMs + Math.round((bounded - LIMITS.timeoutMinMs) / LIMITS.timeoutStepMs) * LIMITS.timeoutStepMs;
}

/**
 * 正規表現エンジンに依存せず、Structured cloneが可能な結果を返す。
 * オフセットはすべて0から始まるUTF-16形式であり、終了位置は範囲に含まない (end-exclusive) 。
 * これには全体のマッチ範囲外にあるキャプチャ (Lookarounds) も含まれる。
 * マッチしなかったキャプチャの開始・終了位置はnullとなり、空のキャプチャの場合は開始位置と終了位置が等しくなる。
 * キャプチャグループには番号が割り当てられ、名前付きグループ (namedGroups) は個別の名前付き範囲として扱われるため、正規表現パーサーを別途用意する必要は無い。
 * また、テキストはリクエスト時のスナップショットから切り出される形となり、Workerからのレスポンス内でデータが複製されることも無い。
 */
export function createResult(request, fields = {}){
    return {
        requestId: request.requestId,
        engine: request.engine,
        offsetUnit: 'utf-16',
        status: 'success',
        matches: [],
        truncated: false,
        truncationReason: null,
        elapsedMs: 0,
        error: null,
        ...fields
    };
}

export function failure(request, status, code, message){
    return createResult(request, {
        status,
        error: {
            code,
            message,
            position: null
        }
    });
}

export function validateInput(request){
    if(typeof request.pattern !== 'string' || typeof request.text !== 'string' || typeof request.flags !== 'string'){
        return failure(request, 'runtime-error', 'invalid-input', 'Pattern, flags, and test text must be strings.');
    }

    if(request.pattern.length > LIMITS.patternLength || request.text.length > LIMITS.textLength){
        return failure(request, 'input-limit', 'input-limit', `Input too large. Use at most ${LIMITS.patternLength.toLocaleString('en')} pattern and ${LIMITS.textLength.toLocaleString('en')} test-text UTF-16 code units.`);
    }

    return null;
}
