import { Bytes } from '#utils/bytes.js';
import { digestBytes } from '#utils/crypto.js';
import { Parser } from "./parser.js";
import { RFC4253 } from "./rfc4253.js";

/**
 * `PubKey`クラスは、SPKI (Subject Public Key Info) データを解析し、OpenSSH互換の形式で公開鍵を生成するためのメソッドを提供する。
 * RSA、ECDSA、EdDSAといった様々な公開鍵アルゴリズムに対応しているほか、鍵のフィンガープリントを生成・取得するためのユーティリティも備えている。
 */
export class PubKey {
	/**
	 * 入力データや構造を解析・解釈、それらを利用可能な形式に変換したり、必要に応じて特定の情報を抽出したりする役割を担うパーサーインスタンスを表す。
     *
     * この変数は、一般的に字句解析、構文解析、あるいはデータ変換といった処理を担う。
     *
     * このパーサーインスタンスの具体的な動作や適用範囲は、コンテキストや実装によって異なる場合がある。
	 */
	#parser;

	/**
	 * 指定されたSPKI DERエンコード値を用いて、クラスのインスタンスを生成。
     *
     * @param {ArrayBuffer} spkiDer - DER形式でエンコードされたSPKI (Subject Public Key Info) データ
     * @return {void} このコンストラクタは値を返さない
	 */
	constructor(spkiDer){
		this.#parser = new Parser(spkiDer);
	}

	/**
	 * 指定されたSPKIバッファからRSA形式のOpenSSH公開鍵を生成する。
     *
     * @async
     * @return {Promise<{raw: Uint8Array, pubkey: string, fingerprint: string}>} 以下のプロパティを持つオブジェクトに解決されるPromiseを返す。
     * - `raw`: OpenSSH形式のRSA公開鍵
     * - `pubkey`: Base64エンコードされたOpenSSH形式のRSA公開鍵
     * - `fingerprint`: RSA公開鍵のフィンガープリント
	 */
	async rsa(){
		const rsa = this.#parser.rsaSpki();
		const blob = Bytes.concat(
			RFC4253.writeString(rsa.name),
			RFC4253.writeMpint(rsa.e),
			RFC4253.writeMpint(rsa.n)
		);

		return await this.#ret(blob);
	}

	/**
	 * 提供されたSPKI (Subject Public Key Information) バッファからOpenSSH形式のECDSA公開鍵を生成する。
     *
     * @async
     * @return {Promise<{raw: Uint8Array, pubkey: string, fingerprint: string}>} 以下のプロパティを持つオブジェクトに解決されるPromiseを返す。
     * - `raw`: OpenSSH形式のECDSA公開鍵
     * - `pubkey`: Base64エンコードされたOpenSSH形式のECDSA公開鍵
     * - `fingerprint`: ECDSA公開鍵のフィンガープリント
	 */
	async ecdsa(){
		const ecdsa = this.#parser.ecdsaSpki();
		const blob = Bytes.concat(
            // string (ex. "ecdsa-sha2-nistp256")
			RFC4253.writeString(`ecdsa-sha2-${ecdsa.curveName}`),
            // string "nistp256"
			RFC4253.writeString(ecdsa.curveName),
            // string Q (0x04 || X || Y)
			RFC4253.writeStringBytes(ecdsa.Q),
		);

		return await this.#ret(blob);
	}

	/**
	 * EdDSA公開鍵のブロブを生成する。
     *
     * このメソッドは解析された鍵タイプと公開鍵データからEdDSA鍵ブロブを構築する。
     * 各要素をRFC4253形式に従って処理し、生成されたブロブを返す。
     *
     * @async
     * @return {Promise<Uint8Array>} EdDSA鍵ブロブを表す Uint8Array に解決されるPromise
	 */
	async eddsa(){
		const eddsa = this.#parser.eddsaSpki(); // eddsaSpki() = { keyType: "ssh-ed25519" or "ssh-ed448", pub: Uint8Array }
		const blob = Bytes.concat(
			RFC4253.writeString(eddsa.keyType),
			RFC4253.writeStringBytes(eddsa.pub)
		);

		return await this.#ret(blob);
	}

	/**
	 * 指定されたデータのハッシュを計算しBase64エンコード形式に変換、フィンガープリント文字列を生成する。
     *
     * @async
     * @static
     * @param {ArrayBuffer} blob - ハッシュ化対象のデータ
     * @param {string} [algo='SHA-256'] - 使用するハッシュアルゴリズム
     * @return {Promise<string>} 末尾の等号 '=' が削除されたフィンガープリント文字列に解決されるPromise
	 */
	async #makeFingerprint(blob, algo = 'SHA-256'){
		const digest = await digestBytes(blob, algo);

		return Bytes.toBase64(digest)
			// OpenSSH風に末尾の=を削る
			.replace(/=+$/, '');
	}

	/**
	 * 指定blobを処理しBase64エンコードされた公開鍵や、そのバイナリデータから導出されたフィンガープリントを含むメタデータを生成する。
     *
     * @async
     * @param {Uint8Array} blob 処理対象となる Uint8Array blob
     * @return {Promise<{raw: Uint8Array, pubkey: string, fingerprint: string}>} 処理結果を格納したオブジェクトに解決されるPromise
	 */
	async #ret(blob){
		return {
			raw: blob,
			pubkey: Bytes.toBase64(blob),
			fingerprint: await this.#makeFingerprint(blob)
		};
	}
}
