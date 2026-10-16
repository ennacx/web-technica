// External
import { ed25519 } from '@noble/curves/ed25519.js';
import { ed448 } from '@noble/curves/ed448.js';
// Local
import { OID, EdDSA_PRESET } from "./const.js";
import { randomBytes } from '#utils/crypto.js';
import { Bytes } from '#utils/bytes.js';
import { RFC4253 } from "./rfc4253.js";
import { DerHelper } from "./der-helper.js";

/**
 * Ed25519およびEd448曲線をサポートする、Edwards曲線デジタル署名アルゴリズム (EdDSA) の暗号鍵ペア生成および取り扱いを行うためのクラス。
 *
 * このクラスのインスタンスは秘密鍵と公開鍵の両方を管理するほか、
 * システム間での相互運用性を確保するために SPKI、PKCS8、JWK といった表現形式にも対応している。
 */
export class EdDSA {
	/**
	 * 特定の曲線の名称 (e.g., "Ed25519", "Ed448")
	 *
	 * @type {string}
	 */
	curveName;

	/**
	 * テンプレートやデフォルト値として使用することを意図した予め定義された構成または設定のセット
	 *
	 * @type {Object}
	 */
	preset;

	/**
	 * 乱数生成やその他の決定論的な操作において使用されるシード値。
     * シードはこうした処理の起点となることで再現性を保証する。
	 *
	 * @type {Uint8Array}
	 */
	seed;

	/**
	 * 特定のコンテキストで使用されるキーの型 (e.g., "ssh-ed25519", "ssh-ed448")
	 *
	 * @type {string}
	 */
	keyType;

	/**
	 * 公開暗号鍵
	 *
	 * @type {Uint8Array}
	 */
	publicKey;

	/**
	 * 秘密鍵 (seed || publicKey)
	 *
	 * @type {Uint8Array}
	 */
	privateKey;

	/**
	 * Publicly accessible data blob (keyType || PublicKey)
	 *
	 * @type {Uint8Array}
	 */
	publicBlob;

	/**
     * 公開鍵を記述するための暗号技術における標準的なデータ構造である "Subject Public Key Info (SPKI)"
	 *
	 * @type {Uint8Array}
	 */
	spki;

	/**
	 * PKCS#8形式でエンコードされた秘密鍵
	 *
	 * @type {Uint8Array}
	 */
	pkcs8;

	/**
     * 署名、暗号化、鍵交換といった暗号鍵を表現するためのJSONデータ構造である "JSON Web Key (JWK)"
     *
     * @type {Object}
     * @property {string} kty - 鍵タイプ ("OKP" のみ)
     * @property {string} crv - e.g., "Ed25519"、"Ed448"
     * @property {string} x - Base64エンコードされた公開鍵
     * @property {string} d - (任意) Base64エンコードされたシード
	 */
	jwk;

	/**
	 * 指定された楕円曲線に対応するクラスのインスタンスを生成する。
     *
     * @param {string} curveName - 使用する楕円曲線プリセットの名前 (e.g., 'Ed25519', 'Ed448')
     * @throws {Error} 指定された曲線名が無効であるか、サポートされていない場合にスローする。
     * @return {Object} 初期化されたインスタンスを表すオブジェクト。
     *                  公開鍵・秘密鍵のデータ、鍵形式、およびその楕円曲線プリセットから導出されたその他の情報が含まれる。
	 */
	constructor(curveName){
		if(!EdDSA_PRESET[curveName]){
			throw new Error(`Invalid preset key: ${curveName}`);
		}

		this.curveName = curveName;
		this.preset    = EdDSA_PRESET[this.curveName];
		this.seed      = randomBytes(this.preset.seedLen);
		this.keyType   = `ssh-${this.preset.name}`;

		switch(this.curveName){
			case 'Ed25519':
				this.publicKey = ed25519.getPublicKey(this.seed);
				break;
			case 'Ed448':
				this.publicKey = ed448.getPublicKey(this.seed);
				break;
			default:
				throw new Error(`Invalid curve: ${this.curveName}`);
		}

		this.publicBlob = Bytes.concat(
			RFC4253.writeString(this.keyType),
			RFC4253.writeStringBytes(this.publicKey)
		);

		// privateKey= seed || pub
		this.privateKey = Bytes.concat(this.seed, this.publicKey);

		this.spki  = this.#toSpkiDer();
		this.pkcs8 = this.#toPkcs8Der(false);
		this.jwk   = this.#toJwk();
	}

	/**
	 * 指定された暗号曲線に対応する AlgorithmIdentifier を生成する。
     *
     * @param {string} crv - 曲線の識別子。"Ed25519" または "Ed448" のいずれかである必要がある。
     * @return {Uint8Array} 指定された曲線に対応する、DERエンコードされた AlgorithmIdentifier シーケンス。
     * @throws {Error} 指定された曲線が無効であるか、サポートされていない場合にスローする。
	 */
	#algoIdFor(crv){
		if(!OID[crv]){
			throw new Error(`Invalid curve: ${crv}. Must be Ed25519 or Ed448`);
		}

		const oid = OID[crv];

		// AlgorithmIdentifier ::= SEQUENCE { algorithm OBJECT IDENTIFIER, parameters ABSENT }
		return DerHelper.seq(DerHelper.oid(oid));
	}

	/**
	 * 関連付けられた公開鍵をSPKI (Subject Public Key Info) DER形式に変換する。
     *
     * @return {Uint8Array} SPKI DER形式でエンコードされたUint8Array
	 */
	#toSpkiDer(){
		const alg = this.#algoIdFor(this.curveName);
		const spk = DerHelper.bit(this.publicKey); // BIT STRING of raw public key

		return DerHelper.concatSequence(alg, spk);
	}

	/**
	 * 暗号鍵をPKCS#8 DERエンコード形式に変換する。
     * この形式は秘密鍵を表現する際によく用いられるもので、必要に応じて公開鍵を含めることも可能。
     *
     * @param {boolean} [includePublic=false] - DERエンコードされた出力に公開鍵を含めるかどうか。
     *                                          trueに設定した場合は公開鍵が利用可能である必要があり、利用できない場合はエラーがスローされる。
     * @return {Uint8Array} PKCS#8 DERエンコード形式。これには秘密鍵が含まれ、オプションで公開鍵を含めることも可能。
     * @throws {Error} `includePublic`がtrueであるにもかかわらず、公開鍵が設定されていない場合にスローされる。
	 */
	#toPkcs8Der(includePublic = false){
		const algo       = this.#algoIdFor(this.curveName);
		const verNum     = (includePublic) ? 0x01 : 0x00; // v1 or v0
		const version    = DerHelper.tlv(0x02, new Uint8Array([verNum]));
		const insidePriv = DerHelper.oct(this.seed);       // RFC8410: privateKey OCTET STRING contains the seed (inside)
		const priv       = DerHelper.oct(insidePriv); // OCTET STRING contains the seed (outside)

		const items = [
			version,
			algo,
			priv
		];

		if(includePublic){
			if(!this.publicKey){
				throw new Error('includePublic=true requires pub');
			}

			const pubBit = DerHelper.bit(this.publicKey); // BIT STRING (0x00 || pub)

			// Add to items
			items.push(DerHelper.ctxExplicit(1, pubBit)); // [1] EXPLICIT BIT STRING
		}

		return DerHelper.concatSequence(...items);
	}

	/**
	 * 現在のオブジェクトをJSON Web Key (JWK) 形式に変換する。
     *
     * @return {Object} オブジェクトのJWK表現。
     *                  鍵タイプ (kty)、曲線名 (crv)、公開鍵 (x) を含み、利用可能な場合は秘密鍵 (d) も含まれる。
	 */
	#toJwk(){
		const jwk = {
			kty: 'OKP',
			crv: this.curveName,
			x: Bytes.toBase64Url(this.publicKey)
		};

		if(this.seed){
			jwk.d = Bytes.toBase64Url(this.seed);
		}

		return jwk;
	}
}