/**
 * 固定の区切り記号を持つフィールドの変換を行う。
 *
 * @param {string} name - フィールド名
 * @param {string} value - フィールド値
 * @return {string}
 */
export function componentFieldValue(name, value){
    if(name === 'protocol'){
        return value.replace(/:$/, '');
    } else if(name === 'hash'){
        return value.replace(/^#/, '');
    }

    return value;
}

/**
 * 固定の区切り記号を持つURL-APIの変換を行う。
 *
 * @param {string} name - フィールド名
 * @param {string} value - フィールド値
 * @return {string}
 */
export function componentUrlValue(name, value){
    if(!value){
        return value;
    }

    if(name === 'protocol'){
        return `${value.replace(/:$/, '')}:`;
    } else if(name === 'hash'){
        return `#${value}`;
    }

    return value;
}

/**
 * デコード前に分割することで、`%2F`が元のセグメント内に維持されるようにする。
 *
 * @param {string} pathname
 * @return {string[]}
 */
export function pathSegments(pathname){
    if(pathname === '' || pathname === '/'){
        return ['/'];
    }

    const segments = pathname.split('/');
    if(pathname.startsWith('/')){
        segments.shift();
    }

    return ['/', ...segments];
}
