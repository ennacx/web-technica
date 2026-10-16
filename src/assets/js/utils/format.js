/**
 * 数値をフォーマットする。
 *
 * @param {number} num
 * @param {string} locale
 * @param {number} digit
 * @return {string}
 */
export function numberFormat(num, locale = 'en-US', digit = 2){
    return num.toLocaleString(locale, {
        minimumFractionDigits: digit,
        maximumFractionDigits: digit
    });
}
