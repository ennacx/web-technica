import { randomUint32 as cryptoRandomUint32 } from '#utils/crypto.js';

// アルファベット大文字一覧
const ALPHA_U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// アルファベット小文字一覧
const ALPHA_L = 'abcdefghijklmnopqrstuvwxyz';
// 数字一覧
const NUMERIC = '1234567890';
// 記号一覧
const SYMBOL  = '!"#$%&\'()+*-^@=~|[]{}`:;,.<>/?\\_';
const SYMBOL_ZEN  = "！”＃＄％＆’（）＋＊－＾＠＝～｜「」｛｝｀：；，．＜＞／？￥＿";
// 16進数一覧
const HEXADECIMAL = '1234567890abcdef';
// 紛らわしい文字種一覧
const MISLEAD_SYMBOLS = '0OcoIl1vyQq9';

// 単一文字列選出用の文字列生成個数 (この中からランダムで一つ選んで返却する)
const PWD_GENERATE_COUNT = 10;

// 生成文字列長 最小値/最大値
const PWD_LEN_MIN = 4;
const PWD_LEN_MAX = 256;

// 複数文字列の生成個数 最小値/最大値
const PWD_BULK_MIN = 1;
const PWD_BULK_MAX = 10000;

/**
 * Configuration object representing the options for generating or validating passwords.
 *
 * @var {Object} OPTION
 * @property {number} OPTION.length - Specifies the minimum length of the password.
 * @property {string} OPTION.use_type - Indicates the usage type for the password generation. Default is 'default'.
 * @property {boolean} OPTION.alpha_u - Determines if uppercase alphabetical characters are allowed.
 * @property {boolean} OPTION.alpha_l - Determines if lowercase alphabetical characters are allowed.
 * @property {boolean} OPTION.numeric - Indicates whether numeric characters are included.
 * @property {boolean} OPTION.symbol - Specifies if symbols will be included in the password.
 * @property {boolean} OPTION.hex - Denotes whether the password should use hexadecimal characters.
 * @property {boolean} OPTION.uuid - Indicates if the output should follow a UUID structure.
 * @property {boolean} OPTION.unique - Enforces all characters in the password to be unique.
 * @property {boolean} OPTION.mislead - Allows misleading characters (e.g., 'O' vs '0') if set to true.
 * @property {string} OPTION.algorithm - Defines the algorithm to use for password operations. Default is 'crypt'.
 * @property {string} OPTION.ignore_symbols - A string containing characters to exclude from use as symbols.
 * @property {boolean} OPTION.validate - Determines if validation is required for the generated password.
 */
const OPTION = {
    length: PWD_LEN_MIN,

    use_type: 'default',

    alpha_u: true,
    alpha_l: true,
    numeric: true,
    symbol: false,
    hex: false,
    uuid: false,

    unique: false,
    mislead: false,

    algorithm: 'crypt',

    ignore_symbols: '',

    validate: false
};

/**
 * Represents the result of a password generation process.
 *
 * @var {Object} RESULT
 * @property {string} RESULT.password                The generated password string.
 * @property {number|undefined} RESULT.length        The length of the generated password.
 * @property {number|undefined} RESULT.entropy       The entropy of the generated password, indicating its randomness and strength.
 * @property {number|undefined} RESULT.charset_size  The size of the character set used for generating the password.
 * @property {string|undefined} RESULT.algorithm     The algorithm used for password generation.
 * @property {number|undefined} RESULT.generate_time The time taken to generate the password, typically in milliseconds.
 */
const RESULT = {
    password: '',
    length: undefined,
    entropy: undefined,
    charset_size: undefined,
    algorithm: undefined,
    generate_time: undefined
};

// Preserve the original entropy thresholds; presentation uses English text, not emoji.
const ENTROPY_STRENGTH = {
    levels: [
        { threshold: 60, bar_class: 'danger', label: 'Very weak' },
        { threshold: 90, bar_class: 'warning', label: 'Weak' },
        { threshold: 128, bar_class: 'success', label: 'Moderate' },
        { threshold: Infinity, bar_class: 'primary', label: 'Strong' }
    ],
    getBarClass(value) {
        return this.levels.find(level => value < level.threshold)?.bar_class ?? 'danger';
    },
    getLabel(value) {
        return this.levels.find(level => value < level.threshold)?.label ?? 'Unknown';
    }
};

/**
 * 指定された上界 `n` (1 <= n <= 2^32) の一様インデックスを返す (棄却サンプリング)
 *
 * @param {number} n
 * @returns {number} 0..n-1
 */
function cryptoRandomIndex(n){
    if(!Number.isInteger(n)){
        throw new Error('cryptoRandomIndex: invalid range');
    }
    if(n <= 0 || n > 0xFFFFFFFF){
        throw new Error('Argument `n` is out of range');
    }

    const range = 0x100000000; // 2^32
    const limit = Math.floor(range / n) * n; // accept値

    while(true){
        const r = cryptoRandomUint32();
        if(r < limit){
            return r % n;
        }
    }
}

/**
 * Removes duplicate values from an array and returns a new array with unique values.
 *
 * @param {Array} array - The array to process and filter for unique values.
 * @return {Array} A new array containing only unique values from the input array.
 */
function arrayUnique(array){
    return [...new Set(array)];
}

/**
 * Shuffles the elements of an array in random order.
 * Optionally, uses a cryptographically secure random number generator for randomness.
 *
 * @param {Array} array The array to shuffle.
 * @param {boolean} [crypt=true] Whether to use a cryptographically secure random number generator. Defaults to true.
 * @return {Array} A new array containing the shuffled elements of the input array.
 */
function arrayShuffle(array, crypt = true){
    const cloneArray = [...array];
    for(let i = cloneArray.length - 1; i > 0; i--){
        const index = crypt ? cryptoRandomIndex(i + 1) : Math.floor(Math.random() * (i + 1));
        [cloneArray[i], cloneArray[index]] = [cloneArray[index], cloneArray[i]];
    }

    return cloneArray;
}

/**
 * Calculates the entropy based on the length of the input and the number of possible characters.
 *
 * @param {number} length - The length of the input for which entropy is being calculated.
 * @param {number} useCharacterCount - The number of possible unique characters used.
 * @param {boolean} [unique=false] - Whether to calculate entropy for unique characters. Defaults to false.
 * @return {number} The calculated entropy value, rounded to two decimal places.
 */
function calcEntropy(length, useCharacterCount, unique = false){
    const entropy = (unique) ?
        Array.from({ length }, (_, index) => Math.log2(useCharacterCount - index)).reduce((sum, value) => sum + value, 0) :
        length * Math.log2(useCharacterCount);

    return Number(entropy.toFixed(2));
}

/**
 * 設定のバリデーション
 *
 * @param {OPTION} opt
 */
function validation(opt){
    opt.validate = false;

    if(!['default', 'hex', 'uuid'].includes(opt.use_type)){
        return 'Choose a valid output format.';
    }
    if(!['crypt', 'math'].includes(opt.algorithm)){
        return 'Choose a valid randomness source.';
    }
    if(!Number.isInteger(opt.length) || opt.length < PWD_LEN_MIN || opt.length > PWD_LEN_MAX){
        return `Length must be a whole number between ${PWD_LEN_MIN} and ${PWD_LEN_MAX}.`;
    }
    if(opt.uuid !== (opt.use_type === 'uuid') || opt.hex !== (opt.use_type === 'hex')){
        return 'Choose a valid output format.';
    }
    if(opt.algorithm === 'crypt' && typeof globalThis.crypto?.getRandomValues !== 'function'){
        return 'Web Crypto is unavailable. Use a supported browser, or explicitly select Math for non-sensitive strings.';
    }
    if(opt.uuid){
        if(opt.algorithm !== 'crypt' || typeof globalThis.crypto?.randomUUID !== 'function'){
            return 'UUID generation requires Web Crypto randomUUID. Use HTTPS or localhost in a supported browser.';
        }
    } else{
        const characters = getUseCharacters(opt);

        if(characters.length === 0){
            return 'Select at least one character type and leave at least one character available.';
        }
        if(opt.unique && opt.length > characters.length){
            return `Without repeated characters, the maximum length for these options is ${characters.length}.`;
        }
    }

    opt.validate = true;

    return null;
}

/**
 * 紛らわしい文字種のフィルタリング
 *
 * @param {OPTION} opt
 * @returns {string}
 */
function filterMisleadSymbols(opt){
    let misleadSymbols = '';

    if(opt.mislead){
        if(opt.use_type === 'default'){
            if(opt.alpha_u){
                misleadSymbols += MISLEAD_SYMBOLS.replace(/[^A-Z]/g, '');
            }
            if(opt.alpha_l){
                misleadSymbols += MISLEAD_SYMBOLS.replace(/[^a-z]/g, '');
            }
            if(opt.numeric){
                misleadSymbols += MISLEAD_SYMBOLS.replace(/[^0-9]/g, '');
            }
        } else if(opt.use_type === 'hex'){
            if(opt.hex){
                misleadSymbols += MISLEAD_SYMBOLS.replace(/[^0-9a-fA-F]/g, '');
            }
        } else if(opt.use_type === 'uuid'){
            if(opt.uuid){
                misleadSymbols += MISLEAD_SYMBOLS.replace(/[^0-9a-fA-F]/g, '');
            }
        }
    }

    return misleadSymbols;
}

/**
 * 使用可能文字種の配列を生成
 *
 * @param {OPTION} opt
 * @returns {string[]}
 */
function getUseCharacters(opt){
    let useChars = '';

    if(opt.use_type === 'default'){
        if(opt.alpha_u){
            useChars += ALPHA_U;
        }
        if(opt.alpha_l){
            useChars += ALPHA_L;
        }
        if(opt.numeric){
            useChars += NUMERIC;
        }
        if(opt.symbol){
            let temp = SYMBOL;

            if(opt.ignore_symbols !== ''){
                for(let ignore_symbol of opt.ignore_symbols){
                    temp = temp.replace(ignore_symbol, '');
                }
            }

            useChars += temp;
        }
    } else if(opt.use_type === 'hex' || opt.use_type === 'uuid'){
        if(opt.hex || opt.uuid){
            useChars += HEXADECIMAL;
        }
    }

    for(let misleadSymbol of filterMisleadSymbols(opt)){
        useChars = useChars.replace(misleadSymbol, '');
    }

    return [...new Set(useChars)];
}

function filterUseCharacters(opt){
    return arrayShuffle(getUseCharacters(opt), (opt.algorithm === 'crypt'));
}

/**
 * Generates a password string based on the specified algorithm and parameters.
 *
 * @param {string} algo - The algorithm to use for password generation. Valid options are 'crypt' or 'math'.
 * @param {number} len - The desired length of the password.
 * @param {string[]|string} useChars - A string containing the characters that can be used in the password.
 * @param {boolean} isUnique - Whether the password should contain unique characters only (true) or allow duplicates (false).
 * @return {string} The generated password based on the given parameters.
 * @throws {Error} If an unsupported algorithm is specified.
 */
function generate(algo, len, useChars, isUnique){
    if(!['crypt', 'math'].includes(algo)){
        throw new Error(`'${algo}' algorithm is not supported`);
    }

    const chars = [...useChars];

    if(!Number.isInteger(len) || len < 1 || chars.length === 0 || (isUnique && len > new Set(chars).size)){
        throw new Error('No valid character set for the requested length.');
    }

    const password = [];
    for(let index = 0; index < len; index++){
        const selected = (algo === 'crypt') ? cryptoRandomIndex(chars.length) : Math.floor(Math.random() * chars.length);

        password.push(chars[selected]);

        if(isUnique){
            chars.splice(selected, 1);
        }
    }

    return password.join('');
}

/**
 * 単一の文字列生成
 *
 * @param {OPTION} opt
 * @returns {RESULT|null}
 */
function passwordGenerate(opt){
    if(!opt.validate){
        return null;
    }

    const temp = bulkPasswordGenerate(opt, PWD_GENERATE_COUNT);

    return (temp !== null) ?
        temp[(opt.algorithm === 'crypt') ? cryptoRandomIndex(temp.length) : Math.floor(Math.random() * temp.length)] :
        null;
}

/**
 * 複数の文字列生成
 *
 * @param {OPTION} opt
 * @param {Number} count
 * @returns {RESULT[]|null}
 */
function bulkPasswordGenerate(opt, count){
    if(!opt.validate || !Number.isInteger(count) || count < 1){
        return null;
    }

    // 生成数調整
    if(count < PWD_BULK_MIN){
        count = PWD_BULK_MIN;
    } else if(count > PWD_BULK_MAX){
        count = PWD_BULK_MAX;
    }

    let useChars = filterUseCharacters(opt);
    let entropy = undefined;

    const passwordResults = [];
    for(let i = 0; i < count; i++){
        // 文字種配列の順番を20%の確率で入れ替え
        if((opt.algorithm === 'crypt' ? cryptoRandomIndex(5) : Math.floor(Math.random() * 5)) === 0){
            useChars = arrayShuffle(useChars, opt.algorithm === 'crypt');
        }

        // エントロピーの算出
        if(entropy === undefined){
            entropy = calcEntropy(opt.length, useChars.length, opt.unique);
        }

        const stTime = performance.now();
        const password = generate(opt.algorithm, opt.length, useChars, opt.unique);
        const edTime = performance.now();

        const result = structuredClone(RESULT);
        result.password = password;
        result.length = opt.length;
        result.entropy = entropy;
        result.charset_size = useChars.length;
        result.algorithm = opt.algorithm;
        result.generate_time = edTime - stTime;

        passwordResults.push(result);
    }

    return passwordResults;
}

/**
 * 単一のUUID生成
 *
 * @returns {RESULT}
 */
function uuidGenerate(){
    const stTime = performance.now();
    const password = crypto.randomUUID();
    const edTime = performance.now();

    const result = structuredClone(RESULT);
    result.password = password;
    result.length = 36;
    result.entropy = 122;
    result.charset_size = 16;
    result.algorithm = 'crypt';
    result.generate_time = edTime - stTime;

    return result;
}

/**
 * 複数のUUID生成
 *
 * @param {Number} count
 * @returns {string[]}
 */
function bulkUuidGenerate(count){
    if(!Number.isInteger(count) || count < PWD_BULK_MIN){
        return null;
    }

    count = Math.min(count, PWD_BULK_MAX);

    const uuids = [];
    for(let i = 0; i < count; i++){
        uuids.push(uuidGenerate());
    }

    return uuids;
}

export {
    OPTION, SYMBOL, SYMBOL_ZEN, MISLEAD_SYMBOLS,
    PWD_LEN_MIN, PWD_LEN_MAX, PWD_BULK_MIN, PWD_BULK_MAX,
    ENTROPY_STRENGTH, validation, getUseCharacters, filterUseCharacters,
    cryptoRandomIndex, arrayShuffle, calcEntropy,
    passwordGenerate, bulkPasswordGenerate, uuidGenerate, bulkUuidGenerate
};
