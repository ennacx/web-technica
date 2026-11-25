/**
 * JPEGセグメント解析を担当するライブラリ
 */

/**
 * 入力の先頭を0とする半開区間。
 * 長さは `end - offset`。
 *
 * @typedef {object} JpegByteRange
 * @property {number} offset - 範囲の開始位置（バイト）。
 * @property {number} end - 範囲の直後の位置（バイト）。
 */

/**
 * JPEGマーカーまたはEOI後の付加データの識別情報。
 *
 * @typedef {object} JpegSegmentInfo
 * @property {string} name - マーカーの表示名。EOI後のデータは `Trailing bytes`。
 * @property {number} [marker] - マーカーの第2バイト。SOIとEOI後のデータでは省略する。
 * @property {number} [payload] - 長さフィールド直後の位置。長さ付きセグメントにだけ設定する。
 * @property {string} kind - ペイロードの分類名。分類のないマーカーでは空文字列、EOI後のデータでは `Data after EOI`。
 */

/**
 * JPEGマーカーの範囲、またはEOI後の付加データの範囲。
 *
 * @typedef {JpegByteRange & JpegSegmentInfo} JpegSegment
 */

/**
 * JPEG解析結果
 *
 * @typedef {object} JpegInspection
 * @property {JpegSegment[]} segments - ファイル順のマーカーと、存在する場合はEOI後の範囲。
 * @property {JpegByteRange[]} scans - スキャン順の圧縮データ範囲。SOSヘッダを除き、バイトスタッフィングとリスタートマーカーを含む。
 * @property {number} width - 最後に解析したフレームの幅（ピクセル）。
 * @property {number} height - 最後に解析したフレームの高さ（ピクセル）。DNLを解析した場合はその値。
 * @property {string[]} restrictions - 共通の削除処理を妨げる構造上の理由。削除モードごとの可否は後段で判定する。
 */

/** エラーメッセージなどに表示する入力サイズの上限（MiB）。 */
export const MAX_FILE_MEGABYTE = 32;
/** `parseJpeg()` が受け付ける入力サイズの上限（バイト）。 */
export const MAX_FILE_BYTES = MAX_FILE_MEGABYTE * 1024 * 1024;

/** SOIとEOIを含むマーカーの処理件数の上限。EOI後の付加データは件数に含めない。 */
const MAX_SEGMENTS  = 2048;

/**
 * フレーム開始（SOF）マーカーの第2バイト。`0xC0` はベースラインDCT、`0xC2` はプログレッシブDCT。
 *
 * @type {Set<number>}
 * @see https://www.itu.int/rec/T-REC-T.81/en ITU-T T.81 Annex B.1.1 表 B.1
 */
const FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/**
 * APP番号・SOF番号から名前を組み立てるもの以外の既知マーカー。キーはマーカーの第2バイト。
 *
 * @type {Map<number, string>}
 * @see https://www.itu.int/rec/T-REC-T.81/en ITU-T T.81 Annex B.1.1 表 B.1
 */
const MARKERS = new Map([
    [0xc4, 'DHT'], [0xcc, 'DAC'], [0xd8, 'SOI'], [0xd9, 'EOI'], [0xda, 'SOS'],
    [0xdb, 'DQT'], [0xdc, 'DNL'], [0xdd, 'DRI'], [0xde, 'DHP'], [0xdf, 'EXP'], [0xfe, 'COM']
]);

/**
 * `parseJpeg()` が書き込み制限の判定に使う非APPマーカーの許可リスト。
 * SOIとスキャン内のリスタートマーカーは別の解析経路で扱う。
 *
 * @type {Set<number>}
 */
const WRITABLE_MARKERS = new Set([0xc0, 0xc2, 0xc4, 0xd9, 0xda, 0xdb, 0xdd, 0xfe]);

/**
 * バイト列の先頭をASCII識別子と照合する。
 *
 * @param {Uint8Array} data - 照合するバイト列。
 * @param {string} prefix - NULを含められるASCII識別子。
 * @returns {boolean} 先頭のバイト列が識別子と一致する場合は `true`。
 */
function startsWith(data, prefix){
    return [...prefix].every((char, index) => (data[index] === char.charCodeAt(0)));
}

/**
 * APP0〜15 は 0xe0〜0xef。
 * APP番号とペイロード先頭の識別子を組み合わせる。
 *
 * @see ITU-T T.86 Annex A: https://www.itu.int/epublications/publication/itu-t-t-86-v2-2024-02-information-technology-digital-compression-and-coding-of-continuous-tone-still-images-appn-markers
 * @see JFIF / JFXX: https://www.itu.int/rec/T-REC-T.871/en
 * @see XMP / Extended XMP（Part 3）: https://developer.adobe.com/xmp/docs/xmp-specifications/
 *
 * @param {number} marker - マーカーの第2バイト。
 * @param {Uint8Array} data - マーカーと長さフィールドを除いたペイロード。
 * @returns {string} ペイロードの分類名。識別できないAPPは `Unknown APP payload`、分類対象外の非APPは空文字列。
 */
function identify(marker, data){
    if(marker === 0xfe) {
        return 'Comment';
    }
    if(marker === 0xe0 && startsWith(data, 'JFIF\0')){
        return 'JFIF';
    }
    if(marker === 0xe0 && startsWith(data, 'JFXX\0')){
        return 'JFIF extension';
    }
    if(marker === 0xe1 && startsWith(data, 'Exif\0\0')){
        return 'Exif';
    }
    if(marker === 0xe1 && startsWith(data, 'http://ns.adobe.com/xap/1.0/\0')){
        return 'XMP';
    }
    if(marker === 0xe1 && startsWith(data, 'http://ns.adobe.com/xmp/extension/\0')){
        return 'Extended XMP';
    }
    if(marker === 0xe2 && startsWith(data, 'ICC_PROFILE\0')){
        return 'ICC profile';
    }
    if(marker === 0xe2 && startsWith(data, 'MPF\0')){
        return 'MPF';
    }
    if(marker === 0xe6 && startsWith(data, 'HDRGM\0')){
        return 'HDR gain map';
    }
    if(marker === 0xeb){
        return 'APP11 / possible JUMBF';
    }
    if(marker === 0xed && startsWith(data, 'Photoshop 3.0\0')){
        return 'Photoshop / IPTC';
    }
    if(marker === 0xee && startsWith(data, 'Adobe')){
        return 'Adobe';
    }
    if(marker >= 0xe0 && marker <= 0xef){
        return 'Unknown APP payload';
    }

    return '';
}

/**
 * APPとSOFは番号付きの名前を組み立て、その他の既知マーカーは `MARKERS` から表示名を取得する。
 *
 * @param {number} marker - マーカーの第2バイト。
 * @returns {string} 定義済みのマーカー名。未登録の場合は `FF` に続けて第2バイトを16進表記する。
 */
function markerName(marker){
    if(marker >= 0xe0 && marker <= 0xef){
        return `APP${marker - 0xe0}`;
    }
    if(FRAME_MARKERS.has(marker)){
        return `SOF${marker - 0xc0}`;
    }

    return MARKERS.get(marker) ?? `FF${marker.toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * バイトスタッフィング (FF 00) と、リスタートマーカー (RST0〜7) を含む圧縮データを読み進める。
 *
 * @param {Uint8Array} bytes - JPEG全体のバイト列。
 * @param {number} start - SOSヘッダ直後の位置。
 * @returns {number} 次のマーカーに先行する最初のFFの位置。走査中にマーカー境界がなければ入力の長さ。
 * @throws {Error} FFの連続に続けて00が現れた場合。
 */
function scanEnd(bytes, start){
    let position = start;

    while(position < bytes.length){
        if(bytes[position++] !== 0xff){
            continue;
        }

        const markerStart = position - 1;

        while(bytes[position] === 0xff){
            position++;
        }

        if(bytes[position] === 0 && position !== markerStart + 1){
            throw new Error('Invalid byte stuffing in JPEG scan.');
        }

        const marker = bytes[position++];

        if(marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
            continue;
        }

        return markerStart;
    }

    return bytes.length;
}

/**
 * 入力を変更せずにJPEGのマーカーと圧縮スキャンの境界を解析する。
 * EOI後のデータや未対応のAPPペイロードなど、閲覧できても削除を制限する構造は `restrictions` に記録する。
 * ここでは画素の復号や圧縮データの完全性検査は行わない。
 *
 * @param {Uint8Array} bytes - SOIから始まるJPEG。オフセットの基準はこのビューの先頭。
 * @returns {JpegInspection} 解析結果と、メタデータ削除の判定に使う構造上の制限。
 * @throws {Error} 入力サイズやマーカー数が上限を超えた場合、SOI・フレーム・スキャン・EOIなどの必須構造が欠けている場合、またはマーカーやスキャンの構造を解析できない場合。
 */
export function parseJpeg(bytes){
    if(bytes.length > MAX_FILE_BYTES){
        throw new Error(`Choose a JPEG of ${MAX_FILE_MEGABYTE} MiB or less.`);
    }

    if(bytes[0] !== 0xff || bytes[1] !== 0xd8){
        throw new Error('The file does not start with a JPEG SOI marker.');
    }

    const segments     = [{ name: 'SOI', offset: 0, end: 2, kind: '' }];
    const restrictions = new Set();
    const scans        = [];
    const view         = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    /**
     * 直近のSOFから取得した幅・高さ（ピクセル）と、SOSの検証に使う成分ID。
     * SOFで高さが0の場合はDNLから高さを補う。最初のSOFまでは `undefined`。
     *
     * @type {{ width: number, height: number, ids: Set<number> } | undefined}
     */
    let frame;
    let position = 2;

    while(position < bytes.length){
        if(segments.length >= MAX_SEGMENTS){
            throw new Error('Too many JPEG segments.');
        }

        const offset = position;

        if(bytes[position++] !== 0xff){
            throw new Error(`Expected a JPEG marker at byte ${offset}.`);
        }

        while(bytes[position] === 0xff){
            position++;
        }

        const marker = bytes[position++];
        const name   = markerName(marker);

        if(marker === 0xd9){
            if(!frame || !scans.length){
                throw new Error('JPEG frame or scan is missing.');
            }

            if(!frame.height && !restrictions.has('DNL marker')){
                throw new Error('JPEG frame height is missing.');
            }

            segments.push({ name, marker, offset, end: position, kind: '' });

            if(position !== bytes.length){
                segments.push({ name: 'Trailing bytes', offset: position, end: bytes.length, kind: 'Data after EOI' });
                restrictions.add('data after EOI');
            }

            return {
                segments,
                scans,
                width: frame.width,
                height: frame.height,
                restrictions: [...restrictions]
            };
        }

        if(!marker || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)){
            throw new Error(`Unexpected JPEG marker at byte ${offset}.`);
        }
        if(marker === 0x01){
            throw new Error('The JPEG TEM marker is unsupported.');
        }
        if(position + 2 > bytes.length){
            throw new Error('Truncated JPEG segment length.');
        }

        const length  = view.getUint16(position);
        const payload = position + 2;
        const end     = position + length;

        if(length < 2 || end > bytes.length){
            throw new Error(`Invalid ${name} length at byte ${offset}.`);
        }

        const kind = identify(marker, bytes.subarray(payload, end));

        segments.push({ name, marker, offset, payload, end, kind });

        if(marker >= 0xe0 && marker <= 0xef){
            if(['MPF', 'APP11 / possible JUMBF', 'HDR gain map', 'Unknown APP payload'].includes(kind)){
                restrictions.add(`${name} (${kind})`);
            }
        } else if(!WRITABLE_MARKERS.has(marker)){
            restrictions.add(`${name} marker`);
        }

        if(FRAME_MARKERS.has(marker)){
            const components = bytes[payload + 5];

            if(length < 8 || !components || length !== 8 + 3 * components){
                throw new Error('Invalid JPEG frame header.');
            }

            const width  = view.getUint16(payload + 3);
            const height = view.getUint16(payload + 1);

            if(!width){
                throw new Error('Invalid JPEG frame width.');
            }

            if(frame){
                restrictions.add('multiple frames');
            }

            const ids = new Set();

            for(let i = 0; i < components; i++){
                ids.add(bytes[payload + 6 + i * 3]);
            }

            if(ids.size !== components){
                throw new Error('Duplicate JPEG frame component.');
            }

            frame = { width, height, ids };

            if(!height){
                restrictions.add('deferred frame height');
            }

            if(bytes[payload] !== 8){
                restrictions.add('sample precision other than 8 bits');
            }
        }

        if(marker === 0xdc){
            if(length !== 4 || !frame || !scans.length || frame.height){
                throw new Error('Invalid JPEG DNL segment.');
            }

            frame.height = view.getUint16(payload);

            if(!frame.height){
                throw new Error('Invalid JPEG DNL height.');
            }
        }

        position = end;

        if(marker === 0xda){
            const components = bytes[payload];

            if(!frame || !components || components > 4 || length !== components * 2 + 6){
                throw new Error('Invalid JPEG scan header.');
            }

            const ids = new Set();

            for(let i = 0; i < components; i++){
                const id = bytes[payload + 1 + i * 2];

                if(!frame.ids.has(id) || ids.has(id)){
                    throw new Error('Invalid JPEG scan component.');
                }

                ids.add(id);
            }

            position = scanEnd(bytes, end);

            if(position === end){
                throw new Error('JPEG scan has no entropy data.');
            }

            scans.push({ offset: end, end: position });
        }
    }

    throw new Error('JPEG EOI marker is missing.');
}
