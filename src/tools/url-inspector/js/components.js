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
 * URL APIの相対解決を使い、階層パスを持つURLかどうかを判定する。
 *
 * @param {URL} url - URL
 * @return {boolean}
 */
export function hasHierarchicalPath(url){
    try{
        // 相対解決は階層構造を持つベースURLに対してのみサポートされる
        new URL('.', url);

        return true;
    } catch(e){
        return false;
    }
}

/**
 * デコード前に分割し、%2Fと空セグメントを保持する。
 * スラッシュから始まらないパスにはRootを追加しない。
 *
 * @param {string} pathname - パス名
 * @return {string[]}
 */
export function pathSegments(pathname){
    if(!pathname.startsWith('/')){
        return [];
    } else if(pathname === '/'){
        return ['/'];
    }

    const segments = pathname.split('/');
    segments.shift();

    return ['/', ...segments];
}

/**
 * クレデンシャル情報を保持することができるURLかどうかを判定する。
 *
 * @param {URL} url - URL
 * @return {boolean}
 */
export function canHaveCredentials(url){
    return (url.protocol !== 'file:' && url.host !== '');
}
