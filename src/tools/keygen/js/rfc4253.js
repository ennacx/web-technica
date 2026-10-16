import { Bytes } from '#utils/bytes.js';

/**
 * RFC 4253で規定されたデータ形式や操作を扱うためのユーティリティ関数群。
 * 特にSSHバイナリパケットプロトコルに焦点を当てている。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc4253
 */
export class RFC4253 {
	/**
	 * バイト配列をUint8Arrayにエンコードし、その際に先頭に32ビット符号なし整数として配列の長さを付加する。
     *
     * @param {Uint8Array} array - エンコード対象のバイト配列
     * @returns {Uint8Array} 32ビット符号なし整数で表された長さと、それに続く入力配列のデータを含む、新しいUint8Array。
	 */
	static writer(array){
		const out = new Uint8Array(4 + array.length);
		const view = new DataView(out.buffer);

		view.setUint32(0, array.length);
		out.set(array, 4);

		return out;
	}

	/**
	 * 32ビット符号なし整数をビッグエンディアンのバイト順で4バイトのUint8Arrayにエンコードする。
     *
     * @param {number} value - エンコード対象の32ビット符号なし整数
     * @returns {Uint8Array} 入力値をビッグエンディアン形式で格納したUint8Array
	 */
	static writeUint32(value){
		const buf = new Uint8Array(4);
		const view = new DataView(buf.buffer);

		view.setUint32(0, value >>> 0, false); // big endian

		return buf;
	}

	/**
	 * 指定された文字列をUint8Array形式にエンコードする。
     * その際、文字列のバイト長を表す4バイトの符号なし整数を先頭に付加する。
     *
     * @param {string} str - エンコード対象の文字列
     * @returns {Uint8Array} 文字列のバイト長 (4バイトの符号なし整数) と、それに続くUTF-8エンコードされた文字列データを含むバイト配列。
	 */
	static writeString(str){
		const utf8Str = Bytes.toUtf8(str);

		return this.writer(utf8Str);
	}

	/**
	 * 指定された入力をUint8Arrayに変換し、その長さを計算した上で、新しいUint8Arrayを返す。
     * この新しいUint8Arrayは、最初の4バイトに入力データの長さが格納され、残りのバイトに入力データ本体が格納される構成となっている。
     *
     * @param {ArrayBuffer | Uint8Array} bytes - Uint8Arrayに変換する入力データ。Uint8Arrayではない場合は内部でUint8Arrayでラップする。
     * @returns {Uint8Array} 最初の4バイトに入力データの長さがエンコードされ、その後にデータ本体が続く新しいUint8Array。
	 */
	static writeStringBytes(bytes){
		const b = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);

		return this.writer(b);
	}

	/**
	 * バイト配列を mpint (多倍長整数) 形式に変換する。
     *
     * 最初のバイトの最上位ビットが1である場合、符号を維持するために0x00というバイトを先頭に追加する。
     * また、バイト配列の長さをビッグエンディアン形式の4バイト符号なし整数として、出力の先頭に付加する。
     *
     * @param {Uint8Array} bytes - mpint形式に変換する入力バイト配列
     * @returns {Uint8Array} 長さ情報と調整済みのバイト配列を含む、mpint形式の新しいUint8Array。
	 */
	static writeMpint(bytes){
		// mpintは先頭bitが1なら 0x00 を前置して符号を守る
		let b = bytes;
		if(b.length > 0 && (b[0] & 0x80)){
			const tmp = new Uint8Array(b.length + 1);
			tmp.set(b, 1);
			b = tmp;
		}

		return this.writeStringBytes(b);
	}
}