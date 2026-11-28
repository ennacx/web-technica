/**
 * IDからDOM要素を取得する。
 *
 * @param {string} id - DOMのID
 * @param {Document} [root=globalThis.document] - 操作を行うDocument
 * @param [expectedType=root.defaultView?.HTMLElement ?? globalThis.HTMLElement] expectedType
 * @return {HTMLElement&expectedType}
 */
export function getById(id, root = globalThis.document, expectedType = root.defaultView?.HTMLElement ?? globalThis.HTMLElement) {
    const elem = root?.getElementById(id);

    if(!expectedType || !(elem instanceof expectedType)){
        throw new TypeError(
            `Expected #${id} to be ${expectedType?.name ?? 'HTMLElement'}`
        );
    }

    return elem;
}

/**
 * CSSセレクターでDOM要素を取得する。
 *
 * @param {string} selector
 * @param {Element|Document} [root=globalThis.document] - 操作を行うDocument
 * @returns {Element|null}
 */
export function querySel(selector, root = globalThis.document) {
    return root.querySelector(selector);
}

/**
 * CSSセレクターで複数のDOM要素を取得する。
 *
 * @param {string} selector
 * @param {Element|Document} [root=globalThis.document] - 操作を行うDocument
 * @returns {NodeListOf<Element>}
 */
export function querySelAll(selector, root = globalThis.document) {
    return root.querySelectorAll(selector);
}

/**
 * HTML要素を生成し、指定されたテキストを設定する。
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag - HTMLタグ名
 * @param {string|null} [value=null] - HTMLとして解釈しないテキスト
 * @param {Document} [root=globalThis.document] - 要素を生成するDocument
 * @returns {HTMLElementTagNameMap[K]}
 */
export function createElem(tag, value = null, root = globalThis.document) {
    const item = root.createElement(tag);

    if(value){
        item.textContent = value;
    }

    return item;
}
