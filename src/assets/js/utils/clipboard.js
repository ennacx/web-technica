/**
 * コピー成功時にのみ解決する。呼び出し元のDocumentを使う。
 *
 * @param {string} text - コピーするテキスト
 * @param {Document} [document=globalThis.document] - コピー操作を行うDocument
 */
export async function copyText(text, document = globalThis.document) {
    const window = document.defaultView;
    if(window.navigator.clipboard && window.isSecureContext){
        await window.navigator.clipboard.writeText(text);

        return;
    }

    const focused = document.activeElement;
    const textarea = document.createElement('textarea');

    textarea.className = 'visually-hidden';
    textarea.value = text;
    textarea.readOnly = true;
    document.body.append(textarea);

    try{
        textarea.focus();
        textarea.select();

        if(typeof document.execCommand !== 'function' || !document.execCommand('copy')){
            throw new Error('Copy unavailable');
        }
    } finally{
        textarea.remove();
        focused?.focus({ preventScroll: true });
    }
}
