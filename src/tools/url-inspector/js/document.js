import { canHaveCredentials, canChangeProtocol } from './components.js';

export const componentNames = ['protocol', 'hostname', 'port', 'username', 'password', 'pathname', 'hash'];

/**
 * URL Inspectorのドキュメントクラス。
 *
 * テキストのURLが正本であり、解析済みデータが入力内容を上書きすることをしない。
 */
export class UrlInspectorDocument {
    currentUrl = '';
    originalUrl = null;
    lastValidUrl = null;
    valid = false;
    rows = [];
    nextRowId = 1;

    setCurrent(text, rows = null){
        this.currentUrl = text;

        try{
            const parsed = new URL(text);

            this.lastValidUrl = parsed;
            this.valid = true;
            this.rows = rows ?? [...parsed.searchParams].map(([key, value]) => ({ id: this.nextRowId++, key, value }));

            if(this.originalUrl === null){
                this.originalUrl = text;
            }
        } catch(e){
            this.valid = false;
        }
    }

    storeOriginal(){
        if(this.valid){
            this.originalUrl = this.currentUrl;
        }
    }

    reset(){
        if(this.originalUrl !== null){
            this.setCurrent(this.originalUrl);
        }
    }

    /**
     * 変更されたドラフトのみをアトミックに適用する。
     * 拒否されたセッターについては、ドラフトはそのまま維持される。
     *
     * @param {Object} drafts - 変更されたドラフト
     * @throws {Error} - 現在のURLが有効でない場合にエラーをスローする
     */
    applyComponents(drafts){
        if(!this.valid){
            throw new Error('Enter a valid Current URL first.');
        }

        const next = new URL(this.currentUrl);

        // 明示的な削除を先に行い、`file:` への切り替えやホスト名が空になるのと同じトランザクション内で認証情報とポートをクリアする。
        for(const name of ['username', 'password', 'port']){
            if(drafts[name] === ''){
                next[name] = '';
            }
        }

        for(const name of componentNames){
            const value = drafts[name];

            if(value === next[name]){
                continue;
            }

            let expected;

            try{
                if(['username', 'password', 'port'].includes(name) && !canHaveCredentials(next)){
                    throw new Error();
                }

                // プロトコル
                if(name === 'protocol'){
                    expected = value.toLowerCase().replace(/:$/, '') + ':';
                    if(!canChangeProtocol(next, expected)){
                        throw new Error();
                    }
                }
                // ポート
                else if(name === 'port'){
                    if(value !== '' && (!/^\d+$/.test(value) || Number(value) > 65535)){
                        throw new Error();
                    }

                    const probe = new URL(`${next.protocol}//example.invalid${(value) ? `:${value}` : ''}/`);

                    expected = probe.port;
                }
                // ホスト名
                else if(name === 'hostname'){
                    if(value === ''){
                        expected = '';
                    } else{
                        const probe = new URL(`${next.protocol}//${value}/`);

                        // ホスト名フィールドに他のURL構成要素を含めてはならない
                        if(probe.port || probe.username || probe.password || probe.pathname !== '/' || probe.search || probe.hash || /[\s/?#@\\]/.test(value)){
                            throw new Error();
                        }

                        expected = probe.hostname;
                    }
                }
                // URLパス
                else if(name === 'pathname' && !next.href.startsWith(`${next.protocol}//`)){
                    // URL setterは、不透明なパス (e.g., mailto:, data:, etc...）を編集できない。
                    throw new Error();
                }
                // その他
                else{
                    const probe = new URL('https://example.invalid/');

                    probe[name] = value;
                    expected = probe[name];
                }

                next[name] = value;

                if(next[name] !== expected){
                    throw new Error();
                }
            } catch(e){
                const label = (name === 'hash') ? 'Fragment' : name[0].toUpperCase() + name.slice(1);

                const error = new Error(`${label} could not be applied to this URL. Check the value and scheme. For structural changes, edit Current URL directly.`);
                error.component = name;

                throw error;
            }
        }

        this.setCurrent(next.href);
    }

    updateQuery(rows){
        if(!this.valid){
            return;
        }

        const next = new URL(this.currentUrl);
        const params = new URLSearchParams();

        for(const { key, value } of rows){
            params.append(key, value);
        }

        next.search = params.toString();

        this.setCurrent(next.href, rows);
    }

    addRow(){
        if(!this.valid){
            return null;
        }

        const row = { id: this.nextRowId++, key: '', value: '' };

        this.updateQuery([...this.rows, row]);

        return row.id;
    }

    editRow(id, name, value){
        if(name !== 'key' && name !== 'value'){
            return;
        }

        this.updateQuery(this.rows.map((row) => (row.id === id) ? { ...row, [name]: value } : row));
    }

    deleteRow(id){
        this.updateQuery(this.rows.filter((row) => (row.id !== id)));
    }

    moveRow(id, direction){
        if(direction !== -1 && direction !== 1){
            return;
        }

        const rows = [...this.rows];
        const index = rows.findIndex((row) => (row.id === id));
        const target = index + direction;

        if(index < 0 || target < 0 || target >= rows.length){
            return;
        }

        [rows[index], rows[target]] = [rows[target], rows[index]];

        this.updateQuery(rows);
    }
}
