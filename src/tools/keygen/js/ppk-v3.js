import { randomBytes } from '#utils/crypto.js';
import { Bytes } from '#utils/bytes.js';
import { lineCount } from '#utils/text.js';
import argon2 from "argon2-browser/dist/argon2-bundled.min.js";
import { aesCbcEncryptRawNoPadding } from './aes.js';
import { Helper } from "./helper.js";
import { RFC4253 } from "./rfc4253.js";

/**
 * PPKv3クラス
 *
 * このクラスは、RSAおよびECDSA形式のPuTTY秘密鍵 (`.ppk`) ファイルを「PuTTY-User-Key-File-3」形式で生成する機能を提供する。
 * また、オプションとして暗号化やパスフレーズに基づいた鍵の導出を行うことも可能。
 */
export class PPKv3 {
	/**
	 * 指定されたパラメータに基づいて、フォーマット済みの暗号鍵バンドルを生成する。
     *
     * @param {string} algorithmName - 使用する暗号アルゴリズムの名称
     * @param {Uint8Array} privPlain - プレーンテキスト形式の生の秘密鍵データ
     * @param {string} comment - 出力に含める任意のコメントまたはメタデータ
     * @param {Uint8Array} pubBlob - バイナリブロブ形式の公開鍵データ
     * @param {string} [encryption="none"] - 秘密鍵の暗号化に使用する方式 (例: "none"、"aes256-cbc" など)
     * @param {string} [passphrase=""] - 暗号化が有効な場合に、鍵の導出に使用するパスフレーズ
     * @return {Promise<string>} フォーマット済みの鍵バンドル (文字列) を解決するPromise
	 */
	static async generate(algorithmName, privPlain, comment, pubBlob, encryption = 'none', passphrase = ''){
		// ランダムパディング込みの秘密鍵
		const privPadded = this.#addRandomPadding(privPlain, 16);

		// Base64用に暗号化or平文
		let privOut;
		// Key-Derivation系ヘッダ用
		let kdLines = '';
		// computeMacに渡すキー
		let macKey;

		// パスフレーズ指定無し
		if(encryption === 'none' || !passphrase){
			// 平文のまま保存
			privOut = privPadded;
			// computeMac側で0x00鍵にフォールバックするために`null`を指定
			macKey = null;
		}
		// パスフレーズ指定あり (AES-256-CBC)
		else if(encryption === 'aes256-cbc'){
			const d = await this.#argon2KeyDerivation(passphrase, privPadded);
			privOut = d.privOut;
			macKey  = d.macKey;
			kdLines = d.kdLines;
		}
		// その他
		else{
			throw new Error(`Unsupported encryption: ${encryption}`);
		}

		const pubB64  = Bytes.toBase64(pubBlob);
		const privB64 = Bytes.toBase64(privOut);
		const macHex  = await this.#computeMac(
			algorithmName,
			encryption,
			comment,
			pubBlob,
			privPadded,
			macKey
		);

		return this.#output(algorithmName, encryption, comment, pubB64, privB64, macHex, kdLines);
	}

	/**
	 * Argon2id鍵導出関数を使用して、指定されたパスフレーズから暗号鍵を導出する。
     *
     * @async
     * @param {string} passphrase - 鍵導出に使用するパスフレーズ
     * @returns {Promise<Object>} 導出された鍵および使用されたパラメータを含むオブジェクト
     * - `salt` {Uint8Array}: 導出に使用された、ランダムに生成されたソルト
     * - `mem` {number}: 導出に使用されたメモリサイズ (KiB)
     * - `pass` {number}: 導出に使用された反復回数
     * - `parallel` {number}: 導出に使用された並列スレッド数
     * - `cipher` {Uint8Array}: AES-256暗号化のために導出された暗号鍵
     * - `iv` {Uint8Array}: AES-CBCのために導出された初期化ベクトル (IV)
     * - `mk` {Uint8Array}: HMAC-SHA-256のために導出された鍵
     * @throws {Error} `argon2-browser`ライブラリが読み込まれていない場合、または必要な機能が欠けている場合にエラーをスローする。
	 */
	static async #deriveKeys(passphrase){
		if(!argon2 || typeof argon2.hash !== 'function'){
			throw new Error('argon2-browser is required for deriveKeys');
		}

		const passBytes = Bytes.toUtf8(passphrase);

		// PuTTYっぽいデフォルト値 (サンプルでもよく使用される値)
		const memory      = 8192; // KiB
		const passes      = 13;
		const parallelism = 1;
		const salt        = randomBytes(16);

		// argon2でハッシュ化
		const out = await argon2.hash({
			pass: passBytes,
			salt,
			time: passes,
			mem: memory,
			parallelism,
			hashLen: 80,
			type: argon2.ArgonType.Argon2id,
			raw: true
		}); // Uint8Array(80)

		const hash      = out.hash;
		const cipherKey = hash.slice(0, 32);  // AES-256
		const iv        = hash.slice(32, 48); // AES-CBC IV
		const macKey    = hash.slice(48, 80); // HMAC-SHA-256 key

		return {
			salt: salt,
			mem: memory,
			pass: passes,
			parallel: parallelism,
			cipher: cipherKey,
			iv: iv,
			mk: macKey
		};
	}

	/**
	 * Argon2idアルゴリズムを用いて鍵導出を行い、提供された秘密鍵を、PKCS#7パディングを使用しないAES-CBC方式で暗号化する。
     *
     * @async
     * @param {string} passphrase - 暗号化鍵の導出に使用するパスフレーズ
     * @param {Uint8Array} paddedPrivkey - 鍵導出後に暗号化される、パディング済みの秘密鍵
     * @returns {Promise<Object>} 暗号化された秘密鍵 (`privOut`)、MAC鍵 (`macKey`)、
     *                            および生成された鍵導出メタデータ (`kdLines`) を含むオブジェクトに解決されるPromiseを返す。
     *
     * @throws {Error} 鍵導出または暗号化のプロセスが失敗した場合にエラーをスローする
     *
     * @description この関数は、提供されたパスフレーズからArgon2idを用いて暗号化鍵およびMAC鍵を導出する。
     *              次に、導出された暗号化鍵と初期化ベクトル (IV) を使用し、AES-CBC方式で秘密鍵を暗号化する。
     *              WebCryptoにおけるパディングの仕様上の競合を回避するため、本関数ではパディングを行わないAES-CBC暗号化を独自に実装している。
     *              また、Argon2idの設定に関するメタデータも生成され、結果とともに返す。
	 */
	static async #argon2KeyDerivation(passphrase, paddedPrivkey){
		// Argon2で鍵導出
		const ar2 = await this.#deriveKeys(passphrase);

		// PPKのパディングは適用済み。AES-CBCではPKCS#7を追加しない。
		const privOut = aesCbcEncryptRawNoPadding(ar2.cipher, ar2.iv, paddedPrivkey);
		const macKey  = ar2.mk;

		// Key-Derivationヘッダの作成
		const kdLines = Helper.implode([
			`Key-Derivation: Argon2id`,
			`Argon2-Memory: ${ar2.mem}`,
			`Argon2-Passes: ${ar2.pass}`,
			`Argon2-Parallelism: ${ar2.parallel}`,
			`Argon2-Salt: ${Bytes.toHex(ar2.salt)}`
		]);

		return { privOut, macKey, kdLines };
	};

	/**
	 * 指定されたブロックサイズに合わせて、データにランダムなパディングを追加する。
     *
     * この関数は、必要に応じてランダムに生成されたパディングバイトを付加することで、
     * 結果として返されるデータの長さが指定されたブロックサイズの倍数になるようにする。
     * 入力データの長さがすでにブロックサイズの倍数である場合、パディングは追加されず、元のデータがそのまま返される。
     * パディングバイトは、暗号学的に安全な乱数生成器を使用して生成される。
     *
     * @param {Uint8Array} plain - パディングを追加する対象の入力データ
     * @param {number} [blockSize=16] - データの長さを合わせるためのブロックサイズ。デフォルトは16バイト。
     * @returns {Uint8Array} ランダムなパディングが追加され、長さがブロックサイズの倍数となったデータ。
	 */
	static #addRandomPadding(plain, blockSize = 16){
		const len = plain.length;
		const rem = len % blockSize;
		const padLen = (blockSize - rem) % blockSize; // 0～15

		// すでに`blockSize`の倍数ならパディング無しでOK
		if(padLen === 0){
			return plain;
		}

		const pad = randomBytes(padLen);

		return Bytes.concat(plain, pad);
	};

	/**
	 * 提供された入力の整合性を検証するためのMAC (メッセージ認証コード) を計算する。
     *
     * @async
     * @param {string} algorithmName - 計算に使用するアルゴリズム名
     * @param {string} encryption - 使用するセキュリティメカニズムを示す暗号化タイプ
     * @param {string} comment - 計算に含める任意のコメント文字列
     * @param {Uint8Array} pubBlob - 計算に使用する公開鍵blob
     * @param {Uint8Array} privBlob - 計算に使用する秘密鍵blob
     * @param {Uint8Array|null} [enc=null] - HMACに使用する任意の暗号化キー。指定されない場合は、デフォルトのキーが使用される。
     * @returns {Promise<string>} 計算されたMACの16進数文字列形式に解決される。
	 */
	static async #computeMac(algorithmName, encryption, comment, pubBlob, privBlob, enc = null){
		// MACは常に「平文＋パディング側」を入力にする！
		const macInput = Bytes.concat(
			RFC4253.writeString(algorithmName),
			RFC4253.writeString(encryption),
			RFC4253.writeString(comment),
			RFC4253.writeStringBytes(pubBlob),
			RFC4253.writeStringBytes(privBlob)
		);

		// Encryption:none の場合は`enc = null`で0x00鍵にフォールバック
		/*
		 * FIXME:
		 *  PPKv3のMACは「鍵の秘密性」ではなく「改ざん検出」用途なので、PuTTY側もHMACのkey=""とkey="\x00"を区別していない。
		 *  ただし空の配列だとWebCryptoの規約違反なので0番目に\x00を入れて違反を回避。
		 */
		const keyData = (enc instanceof Uint8Array && enc.length > 0) ? enc : new Uint8Array([0]);
		const key  = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const sign = await crypto.subtle.sign('HMAC', key, macInput);
		const mac  = new Uint8Array(sign);

		return Bytes.toHex(mac);
	}

	/**
	 * 指定されたパラメータに基づいて、フォーマット済みの文字列を構築する。
     *
     * @param {string} algorithmName - 使用されたアルゴリズムの名称
     * @param {string} encryption - 暗号化方式または暗号化の状態
     * @param {string} comment - 鍵ファイルに関連する説明コメント
     * @param {string} pubB64 - Base64エンコードされた公開鍵
     * @param {string} privB64 - Base64エンコードされた秘密鍵
     * @param {string} macHex - 検証用のMAC (メッセージ認証コード。16進数表記)
     * @param {string} kdLines - 鍵導出 (Key Derivation) に関連する追加行 (存在する場合)
     * @return {string} PuTTY鍵ファイルデータを表す、フォーマット済みの文字列。
	 */
	static #output(algorithmName, encryption, comment, pubB64, privB64, macHex, kdLines) {
		const pubLines     = Helper.stringWrap(pubB64);
		const privLines    = Helper.stringWrap(privB64);
		const pubLineCount = lineCount(pubLines);
		const prvLineCount = lineCount(privLines);

		// FIXME: 順番重要
		return Helper.implode([
			`PuTTY-User-Key-File-3: ${algorithmName}`,
			`Encryption: ${encryption}`,
			`Comment: ${comment}`,
			`Public-Lines: ${pubLineCount}`,
			`${pubLines}`,
			kdLines,
			`Private-Lines: ${prvLineCount}`,
			`${privLines}`,
			`Private-MAC: ${macHex}`
		]);
	}
}
