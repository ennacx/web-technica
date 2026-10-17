export function planJsonInput(source, start, end, inserted, width){
    if(![2, 4, 8].includes(width) || !['\n', '}', ']'].includes(inserted)){
        return null;
    }

    const columns = (text) => {
        let count = 0;
        for(const char of text){
            count += (char === '\t') ? width - count % width : 1;
        }

        return count;
    };

    const lineStart = (start !== 0) ? source.lastIndexOf('\n', start - 1) + 1 : 0;
    const before = source.slice(lineStart, start);
    const leading = before.match(/^[\t ]*/)[0];
    const indentation = columns(leading);
    const stack = [];

    let inString = false;
    let escaped = false;
    let currentLine = 0;

    for(let index = 0; index < start; index++){
        const char = source[index];

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
        } else if(char === '{' || char === '['){
            const prefix = source.slice(currentLine, index).match(/^[\t ]*/)[0];

            stack.push({
                close: (char === '{') ? '}' : ']',
                indent: columns(prefix)
            });
        } else if((char === '}' || char === ']') && stack.at(-1)?.close === char){
            stack.pop();
        }

        if(char === '\n'){
            currentLine = index + 1;
        }
    }

    if(inString){
        return null;
    }

    const opener = stack.at(-1);

    if(inserted !== '\n'){
        if(before !== leading || (opener && opener.close !== inserted)){
            return null;
        }

        const target = opener ? opener.indent : Math.max(0, indentation - width);

        if(target >= indentation){
            return null;
        }

        const text = ' '.repeat(target) + inserted;

        return {
            start: lineStart,
            end,
            text,
            caret: lineStart + text.length
        };
    }

    if(before === leading && /^[\t ]/.test(source.slice(end))){
        return null;
    }

    const after = source.slice(end);
    const nextWhitespace = after.match(/^[\t ]*/)[0];
    const nextChar = after[nextWhitespace.length];
    const afterOpener = /[{\[]\s*$/.test(before);
    const innerIndent = indentation + ((afterOpener) ? width : 0);

    if(opener && nextChar === opener.close){
        const closeIndent = ' '.repeat(opener.indent);
        const text = (afterOpener) ? `\n${' '.repeat(innerIndent)}\n${closeIndent}` : `\n${closeIndent}`;

        return {
            start,
            end: end + nextWhitespace.length,
            text,
            caret: start + ((afterOpener) ? 1 + innerIndent : text.length)
        };
    }

    const text = '\n' + ' '.repeat(innerIndent);

    return {
        start,
        end,
        text,
        caret: start + text.length
    };
}
