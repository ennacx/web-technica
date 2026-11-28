/** アスペクト比 */
const ASPECT_RATIOS = Object.freeze([
    [1, 1],
    [5, 4],
    [4, 3],
    [7, 5],
    [3, 2],
    [16, 10],
    [5, 3],
    [16, 9],
    [2, 1],
    [21, 9],
    [3, 1],
]);

/**
 * 向きを保ちながら、許容誤差内で最も近い既知のアスペクト比を選ぶ。
 *
 * @param {number} width - 幅
 * @param {number} height - 高さ
 * @param {number} [tolerance=0.01] - 許容範囲 (0.00~1.00)
 * @returns {{width: number, height: number, exact: boolean, error: number}|null} 最も近い既知比率と相対誤差。候補外・不正な寸法はnull。
 */
export function getAspectRatio(width, height, tolerance = 0.01){
    if(
        !Number.isFinite(width) || width <= 0
        || !Number.isFinite(height) || height <= 0
        || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1
    ){
        return null;
    }

    const landscape = (width >= height);
    const ratio     = Math.max(width, height) / Math.min(width, height);

    let nearest  = null;
    let minError = Infinity;

    for(const [w, h] of ASPECT_RATIOS){
        const target = w / h;
        const error = Math.abs(ratio / target - 1);

        // より近似したアスペクト比を選出
        if(error < minError){
            nearest  = [w, h];
            minError = error;
        }
    }

    if(!nearest || minError > tolerance){
        return null;
    }

    const [w, h] = nearest;

    return {
        width:  (landscape) ? w : h,
        height: (landscape) ? h : w,
        exact:  (minError === 0),
        error:  minError,
    };
}

/**
 * 保存寸法からOrientation適用後の表示寸法を返す。5〜8で幅と高さを交換する。
 * (1~4は回転要素を含まないOrientationであるため)
 *
 * @param {number} width - 幅
 * @param {number} height - 高さ
 * @param {number} [orientation=1] - Exif の Orientation
 * @returns {{width: number, height: number}}
 */
export function getDisplayDimensions(width, height, orientation = 1){
    return (Number.isInteger(orientation) && orientation >= 5 && orientation <= 8)
        ? { width: height, height: width }
        : { width, height };
}

/**
 * 既知比率は必要に応じて近似記号を付け、候補外は整数寸法を約分する。
 *
 * @param {number} width - 正の整数の幅。
 * @param {number} height - 正の整数の高さ。
 * @returns {string} 幅:高さ。不正な寸法はUnknown。
 */
export function formatAspectRatio(width, height){
    if(!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0){
        return 'Unknown';
    }

    const ratio = getAspectRatio(width, height);

    if(ratio){
        return `${(ratio.exact) ? '' : '≈ '}${ratio.width}:${ratio.height}`;
    }

    let a = width;
    let b = height;

    while(b){
        [a, b] = [b, a % b];
    }

    return `${width / a}:${height / a}`;
}

