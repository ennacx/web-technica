/**
 * テキストデータのダウンロード
 *
 * @param {string} text - ダウンロードするテキスト。
 * @param {string} filename - ダウンロードするファイル名。
 * @param {Document} [document=globalThis.document] - ダウンロードを実行するドキュメント。
 * @param {string} [type='text/plain;charset=utf-8'] - ダウンロードするファイルのMIMEタイプ。
 */
export function downloadText(text, filename, document = globalThis.document, type = 'text/plain;charset=utf-8') {
    const window = document.defaultView;
    const anchor = document.createElement('a');

    let url;

    try{
        url = window.URL.createObjectURL(new window.Blob([text], { type }));
        anchor.href = url;
        anchor.download = filename;
        document.body.append(anchor);
        anchor.click();
    } finally{
        anchor.remove();

        // Blob URLの破棄を遅延し、ダウンロード開始前の失効を避ける。
        if(url){
            window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        }
    }
}
