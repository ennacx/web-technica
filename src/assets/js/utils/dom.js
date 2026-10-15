export function getById(id, root = document, expectedType = HTMLElement) {
    const elem = root?.getElementById(id);

    if(!(elem instanceof expectedType)){
        throw new TypeError(
            `Expected #${id} to be ${expectedType.name}`
        );
    }

    return elem;
}

/**
 * CSSセレクターでDOM要素を取得する。
 *
 * @param {string} selector
 * @param {ParentNode} root
 * @returns {Element|null}
 */
export function querySel(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * CSSセレクターで複数のDOM要素を取得する。
 *
 * @param {string} selector
 * @param {ParentNode} root
 * @returns {NodeListOf<Element>}
 */
export function querySelAll(selector, root = document) {
    return root.querySelectorAll(selector);
}
