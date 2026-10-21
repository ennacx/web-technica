import { Bytes } from '#utils/bytes.js';

/**
 * Keygen-specific PEM and PPK text formatting helpers.
 */
export class Helper {
	/**
	 * Formats a given string by wrapping it to the specified width.
	 * Breaks the string into lines not exceeding the provided width, appending a newline character
	 * at the end of each line, except for the last one. Trims any trailing whitespace characters
	 * from the resulting string.
	 *
	 * @param {string} str - The input string to be wrapped.
	 * @param {number} [width=64] - The maximum width of a line before wrapping. Defaults to 64 if not provided.
	 * @returns {string} The string formatted with line breaks.
	 */
	static stringWrap(str, width = 64){
		return str.replace(new RegExp(`(.{1,${width}})`, "g"), (match, grp1) => (grp1) ? `${grp1}\n` : "").trimEnd();
	}

	/**
	 * Combines an array of strings into a single string, with elements separated by a specified separator.
	 * Optionally filters out empty lines before combining.
	 *
	 * @param {string[]} array - The array of strings to be concatenated.
	 * @param {Object} [opt] - Optional settings for concatenation.
	 * @param {string} [opt.separator="\n"] - The string used to separate the array elements.
	 * @param {boolean} [opt.ignoreEmptyLines=true] - A flag indicating whether empty strings should be ignored.
	 * @return {string} - The concatenated string with specified separator and optional filtering applied.
	 */
	static implode(array, opt = {separator: "\n", ignoreEmptyLines: true}){
		if(opt.ignoreEmptyLines){
			array = array.filter((e) => (e !== ''));
		}

		return array.filter((e) => (typeof e === 'string' || e instanceof String)).join(opt.separator ?? "\n");
	}

	/**
	 * Converts a buffer into a PEM (Privacy Enhanced Mail) formatted string with appropriate label and wrapping.
	 *
	 * @param {Uint8Array|ArrayBuffer} buffer - The data buffer to be converted to PEM format.
	 * @param {string} label - The primary label to be used in the PEM header and footer.
	 * @param {number} [wrapWidth=64] - The line width to wrap the base64-encoded content. Defaults to 64 if not provided.
	 * @param {string} [addLabel=""] - An additional prefix to append to the label string. Defaults to an empty string.
	 * @return {string} The PEM formatted string representation of the input buffer.
	 */
	static toPEM(buffer, label, wrapWidth = 64, addLabel = ''){
		const base64 = this.stringWrap(Bytes.toBase64(buffer), wrapWidth);

		if(addLabel !== ''){
			label = `${addLabel} ${label}`;
		}

		return this.implode([
			`-----BEGIN ${label}-----`,
			base64,
			`-----END ${label}-----`
		]) + '\n';
	}
}
