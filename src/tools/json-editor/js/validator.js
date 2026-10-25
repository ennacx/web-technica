export function validateJson(source, onParsed){
    /*
     * 解析値は読み取り専用の構造表示にのみ利用できる。ソースやJSON出力の再生成には使わない。
     * 数値の丸め、重複するキー、エスケープされた文字列によって、元のソースが書き換えられてはならない。
     */

    if(/^[\x20\t\r\n]*$/.test(source)){
        return { state: 'empty', message: '' };
    }

    try{
        const parsed = JSON.parse(source);
        onParsed?.(parsed);

        return { state: 'valid', message: '' };
    } catch(e){
        if(!(e instanceof SyntaxError)){
            throw e;
        }

        return { state: 'invalid', message: e.message };
    }
}
