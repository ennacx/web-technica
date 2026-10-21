/**
 * 部分文字列を確保することなくLF区切りの行数をカウントする (末尾の空行も含む)。
 * 空のテキストは1行、CRLFは1行としてカウントし、CR単独は区切り文字とはみなさない。
 */
export function lineCount(text){
    let count = 1;

    for(let index = 0; index < text.length; index++){
        // 10 = LF
        if(text.charCodeAt(index) === 10){
            count++;
        }
    }

    return count;
}
