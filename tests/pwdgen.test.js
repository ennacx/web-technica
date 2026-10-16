import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-utils.js';
const {
    OPTION, SYMBOL, MISLEAD_SYMBOLS, validation, getUseCharacters,
    cryptoRandomIndex, arrayShuffle, calcEntropy,
    passwordGenerate, bulkPasswordGenerate, uuidGenerate, bulkUuidGenerate
} = await import('../src/tools/pwdgen/js/pwdgen.js');

const options = overrides => ({ ...OPTION, length: 16, ...overrides });
const validated = overrides => {
    const result = options(overrides);
    assert.equal(validation(result), null);
    return result;
};

test('preserves selectable character types and the 4–256 length range', () => {
    for (const length of [4, 16, 256]) {
        for (const type of ['alpha_u', 'alpha_l', 'numeric', 'symbol']) {
            const config = validated({ alpha_u: false, alpha_l: false, numeric: false, symbol: false, [type]: true, length });
            const result = passwordGenerate(config);
            assert.equal(result.password.length, length);
            assert.ok([...result.password].every(character => getUseCharacters(config).includes(character)));
            assert.equal(result.algorithm, 'crypt');
            assert.ok(Number.isFinite(result.generate_time));
        }
    }
});

test('hexadecimal mode preserves its alphabet and length', () => {
    const result = passwordGenerate(validated({ use_type: 'hex', hex: true, length: 64 }));
    assert.match(result.password, /^[0-9a-f]{64}$/);
});

test('excludes ambiguous characters and chosen symbols', () => {
    const config = validated({ symbol: true, mislead: true, ignore_symbols: '!"&\\[]' });
    for (const result of bulkPasswordGenerate(config, 30)) {
        assert.ok([...result.password].every(character => !MISLEAD_SYMBOLS.includes(character)));
        assert.ok([...result.password].every(character => !config.ignore_symbols.includes(character)));
    }
});

test('unique mode never repeats characters, including a full alphabet', () => {
    const config = validated({ alpha_u: true, alpha_l: false, numeric: false, length: 26, unique: true });
    const result = passwordGenerate(config);
    assert.equal(result.password.length, 26);
    assert.equal(new Set(result.password).size, 26);
    assert.equal(result.entropy, calcEntropy(26, 26, true));
});

test('entropy reflects selection without replacement in unique mode', () => {
    assert.equal(calcEntropy(4, 4), 8);
    assert.equal(calcEntropy(4, 4, true), 4.58);
});

test('rejects invalid lengths and resets a stale validation flag', () => {
    for (const length of [NaN, Infinity, 0, 3, 257, 16.5]) {
        const config = options({ length, validate: true });
        assert.equal(typeof validation(config), 'string');
        assert.equal(config.validate, false);
        assert.equal(passwordGenerate(config), null);
    }
});

test('rejects an empty character pool or impossible unique length', () => {
    assert.equal(typeof validation(options({ alpha_u: false, alpha_l: false, numeric: false })), 'string');
    assert.equal(typeof validation(options({ alpha_u: false, alpha_l: false, numeric: false, symbol: true, ignore_symbols: SYMBOL })), 'string');
    assert.equal(typeof validation(options({ alpha_u: false, alpha_l: false, numeric: true, unique: true, length: 11 })), 'string');
    assert.equal(typeof validation(options({ use_type: 'hex', hex: true, unique: true, length: 17 })), 'string');
});

test('retains Math explicitly for non-sensitive strings without requiring crypto', () => {
    const original = crypto.getRandomValues;
    crypto.getRandomValues = () => { throw new Error('Blocked'); };
    try {
        const results = bulkPasswordGenerate(validated({ algorithm: 'math' }), 100);
        assert.equal(results.length, 100);
        assert.ok(results.every(result => result.password.length === 16 && result.algorithm === 'math'));
    } finally { crypto.getRandomValues = original; }
});

test('secure generation does not call Math.random', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Unexpected Math fallback'); };
    try {
        assert.equal(passwordGenerate(validated({ unique: true })).password.length, 16);
        assert.equal(bulkPasswordGenerate(validated(), 100).length, 100);
    } finally { Math.random = original; }
});

test('crypto rejection sampling discards biased values', () => {
    const original = crypto.getRandomValues;
    const values = [0xffffffff, 8];
    let calls = 0;
    crypto.getRandomValues = array => { array[0] = values[calls++]; return array; };
    try { assert.equal(cryptoRandomIndex(3), 2); assert.equal(calls, 2); }
    finally { crypto.getRandomValues = original; }
});

test('crypto failures propagate instead of silently downgrading', () => {
    const config = validated();
    const originalCrypto = crypto.getRandomValues;
    const originalMath = Math.random;
    crypto.getRandomValues = () => { throw new Error('Crypto blocked'); };
    Math.random = () => { throw new Error('Unexpected fallback'); };
    try {
        assert.throws(() => arrayShuffle(['a', 'b']), /Crypto blocked/);
        assert.throws(() => passwordGenerate(config), /Crypto blocked/);
    } finally { crypto.getRandomValues = originalCrypto; Math.random = originalMath; }
});

test('bulk generation preserves presets, supports one result, and caps at 10,000', () => {
    const config = validated({ length: 4 });
    for (const count of [1, 100, 1000, 10000]) assert.equal(bulkPasswordGenerate(config, count).length, count);
    assert.equal(bulkPasswordGenerate(config, 10001).length, 10000);
    for (const count of [0, NaN, 1.5]) assert.equal(bulkPasswordGenerate(config, count), null);
});

test('UUID generation produces version 4 identifiers with 122 random bits', () => {
    assert.equal(validation(options({ use_type: 'uuid', uuid: true, length: 36 })), null);
    const result = uuidGenerate();
    assert.match(result.password, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(result.length, 36);
    assert.equal(result.entropy, 122);
    assert.equal(bulkUuidGenerate(100).length, 100);
    assert.equal(bulkUuidGenerate(10001).length, 10000);
    assert.equal(bulkUuidGenerate(0), null);
});

test('missing randomUUID does not disable secure password generation', () => {
    const original = crypto.randomUUID;
    crypto.randomUUID = undefined;
    try {
        assert.equal(validation(options()), null);
        assert.equal(typeof validation(options({ use_type: 'uuid', uuid: true, length: 36 })), 'string');
    } finally { crypto.randomUUID = original; }
});
