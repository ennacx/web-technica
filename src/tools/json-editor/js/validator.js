export function validateJson(source){
    /*
     * 構文チェックのみを行うこと。解析された値は破棄され、出力として使用してはならない。
     * 数値の丸め、重複するキー、エスケープされた文字列によって、元のソースが書き換えられてはならない。
     */

    if(/^[\x20\t\r\n]*$/.test(source)){
        return { state: 'empty', message: '' };
    }

    try{
        JSON.parse(source);

        return { state: 'valid', message: '' };
    } catch(e){
        if(!(e instanceof SyntaxError)){
            throw e;
        }

        return { state: 'invalid', message: e.message };
    }
}
