import { copyText } from '../utils/clipboard.js';

/**
 * コピー操作をスナップショットに関連付ける。
 * その際、古いコンテンツに関するフィードバックは無視する。
 *
 * `read()`は文字列またはツールが所有するスナップショットを返す。
 * null は利用不可であることを意味する。
 *
 * 各ツールは、自身の利用可否、リビジョン確認、およびステータス・メッセージを保持する。
 */
export function bindCopyButton(button, {
    read,
    getText = (snapshot) => snapshot,
    isCurrent = (snapshot) => snapshot === read(),
    onStart,
    onSuccess,
    onError,
    onSettled,
    document = button.ownerDocument
}){
    const copy = async () => {
        if(button.disabled){
            return;
        }

        const snapshot = read();
        if(snapshot == null){
            return;
        }

        const text = getText(snapshot);
        if(!text){
            return;
        }

        onStart?.(snapshot);

        try{
            await copyText(text, document);

            if(isCurrent(snapshot)){
                onSuccess?.(snapshot);
            }
        } catch(e){
            if(isCurrent(snapshot)){
                onError?.(e, snapshot);
            }
        } finally{
            onSettled?.(snapshot);
        }
    };

    button.addEventListener('click', copy);

    return () => button.removeEventListener('click', copy);
}

/**
 * 一時的なコピーチェック用アイコン。
 * ボタン1つにつきタイマーが1つ割り当てられ、そのインスタンスが所有する。
 *
 * @param window
 * @return {{reset: reset, show(*): void}}
 */
export function createCopyFeedback(window){
    const timers = new Map();

    function reset(button){
        window.clearTimeout(timers.get(button));
        timers.delete(button);

        button.querySelector('[data-icon-copy]').hidden = false;
        button.querySelector('[data-icon-check]').hidden = true;
    }

    return {
        reset,
        show(button){
            reset(button);

            button.querySelector('[data-icon-copy]').hidden = true;
            button.querySelector('[data-icon-check]').hidden = false;

            timers.set(button, window.setTimeout(() => reset(button), 2000));
        }
    };
}
