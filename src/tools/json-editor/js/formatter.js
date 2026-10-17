import { validateJson } from './validator.js';

/**
 * 既存の行のインデントを再調整する。
 * 構文解析は行わず改行の挿入やインラインの空白の変更もしない。未完成のJSONであっても、文字列の内容は保護する。
 *
 * @param {string} source - JSONソース
 * @param {number} previousWidth
 * @param {number} nextWidth
 * @returns {string}
 */
export function changeJsonIndent(source, previousWidth, nextWidth){
    if(![2, 4, 8].includes(previousWidth) || ![2, 4, 8].includes(nextWidth)){
        throw new RangeError('Choose 2, 4, or 8 spaces.');
    }

    const parts = source.split(/(\r\n|\r|\n)/);
    const lines = [];

    let inString = false;
    let escaped = false;

    for(let idx = 0; idx < parts.length; idx += 2){
        const line = parts[idx];
        const prefix = line.match(/^[\t ]*/)[0];

        if(!inString){
            let columns = 0;

            for(const char of prefix){
                columns += (char === '\t') ?
                    previousWidth - (columns % previousWidth) :
                    1;
            }

            lines.push({
                index: idx,
                prefix,
                columns,
                hasContent: (prefix.length < line.length)
            });
        }

        for(const char of line){
            if(inString){
                if(escaped){
                    escaped = false;
                } else if(char === '\\'){
                    escaped = true;
                } else if(char === '"'){
                    inString = false;
                }
            } else if(char === '"'){
                inString = true;
            }
        }

        if(idx + 1 < parts.length){
            escaped = false;
        }
    }

    /*
     * テキストエリアのJSONは規定のスペースとは異なる場合がある。
     * その場合、既存のインデントのうち、最小の正の値を単位として使用する。 (タブについては、以前の設定に従う)
     * その単位内に収まる余分な位置合わせ用のスペースはそのまま維持される。
     */
    let width = Infinity;

    for(const line of lines){
        if(line.hasContent && line.columns > 0){
            width = Math.min(width, line.columns);
        }
    }

    if(!Number.isFinite(width) || lines.some((line) => line.prefix.includes('\t'))){
        width = previousWidth;
    }

    for(const { index: idx, prefix, columns } of lines){
        const spaces = (Math.floor(columns / width) * nextWidth) + (columns % width);

        parts[idx] = ' '.repeat(spaces) + parts[idx].slice(prefix.length);
    }

    return parts.join('');
}

/**
 * JSONをPretty化する。
 *
 * @param {string} source - JSONソース
 * @param {number} [indent=2] - indent
 * @returns {string}
 */
export function prettyPrintJson(source, indent = 2){
    /*
     * 空白以外のすべてのトークンを、重複するキーやNumberの精度や範囲外の数値を含め、そのまま保持する。
     * パースされたJavaScript値がシリアライズされることはない。
     */

    if(![2, 4, 8].includes(indent)){
        throw new RangeError('Choose 2, 4, or 8 spaces.');
    }

    const tokens = jsonTokens(source);
    const output = [];

    // ネスト階層
    let depth = 0;

    const newline = () => output.push('\n', ' '.repeat(depth * indent));

    for(let index = 0; index < tokens.length; index++){
        const token = tokens[index];

        if(token === '{' || token === '['){
            depth++;

            output.push(token);

            if(tokens[index + 1] !== ((token === '{') ? '}' : ']')){
                newline();
            }
        } else if(token === '}' || token === ']'){
            depth--;

            if(tokens[index - 1] !== ((token === '}') ? '{' : '[')){
                newline();
            }

            output.push(token);
        } else if(token === ','){
            output.push(token);

            newline();
        } else if(token === ':'){
            output.push(': ');
        } else{
            output.push(token);
        }
    }

    return output.join('');
}

/**
 * JSONをMinify化する。
 *
 * @param {string} source - JSONソース
 * @returns {string}
 */
export function minifyJson(source){
    return jsonTokens(source).join('');
}

/**
 * @param {string} source - JSONソース
 * @returns {RegExpMatchArray}
 */
function jsonTokens(source){
    const validation = validateJson(source);

    if(validation.state !== 'valid'){
        throw new SyntaxError(validation.message || 'Enter JSON to format.');
    }

    // 空白を除去する前に検証を行うことで、無効な断片が有効なJSONの一部として統合されてしまう事態を防ぐ。
    // 文字列トークンおよび数値トークンは、ソースコード上の表記がそのまま保持される。
    return source.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\x20\t\r\n{}\[\],:]+/g);
}
