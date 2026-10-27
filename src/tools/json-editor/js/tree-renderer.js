export const TREE_PAGE_SIZE = 200;

export function pointerChild(path, key){
    const formattedKey = String(key).replaceAll('~', '~0').replaceAll('/', '~1');

    return `${path}/${formattedKey}`;
}

const isContainer = (value) => (value !== null && typeof value === 'object');

/**
 * JSONをツリー展開する。
 * ここでは解析済みのソースのみが読み込まれ、このモジュールがJSONを解析・変更をしない。
 *
 * @param container
 * @param document
 * @return {{render: render, reset(): void}}
 */
export function createTreeRenderer(container, document){
    let renderedRevision = -1;
    let expanded = new Set(['']);
    let serial = 0;

    function element(tag, className, text){
        const node = document.createElement(tag);
        node.className = className;

        if(text !== undefined){
            node.textContent = text;
        }

        return node;
    }

    function retainPaths(root){
        expanded = new Set([...expanded].filter((path) => {
            let value = root;

            for(const part of ((path === '') ? [] : path.slice(1).split('/'))){
                const key = part.replaceAll('~1', '/').replaceAll('~0', '~');

                if(!isContainer(value) || !Object.hasOwn(value, key)){
                    return false;
                }

                value = value[key];
            }

            return isContainer(value);
        }));
    }

    function render(editor){
        if(renderedRevision === editor.revision){
            return;
        }

        const validation = editor.validateSource();

        container.replaceChildren();

        renderedRevision = editor.revision;

        if(validation.state !== 'valid'){
            container.append(element('p', 'json-tree-message', (validation.state === 'empty') ?
                'Enter JSON in Edit to explore its tree.' :
                'Unable to display tree. Please fix the JSON syntax errors in Edit.')
            );

            return;
        }

        const root = editor.parsed;

        retainPaths(root);

        const list = element('ul', 'json-tree-list');

        container.append(list);

        // A queue also restores deeply expanded paths without recursive calls.
        const queue = [];

        function addNode(parent, name, value, path){
            const item = element('li', 'json-tree-item');
            const row = element('div', 'json-tree-row');
            const label = element('span', 'json-token-key', name);

            item.append(row);
            parent.append(item);

            if(!isContainer(value)){
                row.append(label);

                const kind = (typeof value === 'string') ? 'string' : ((typeof value === 'number') ? 'number' : 'literal');
                const text = (typeof value === 'number' && !Number.isFinite(value)) ?
                    'Number outside JavaScript range' :
                    ((Object.is(value, -0)) ? '-0' : JSON.stringify(value));

                row.append(element('span', `json-token-${kind}`, text));

                return;
            }

            const array = (Array.isArray(value));
            const keys = (array) ? null : Object.keys(value);
            const count = (array) ? value.length : keys.length;

            const summaryValueLabel = (array) ? ((count === 1) ? 'item' : 'items') : ((count === 1) ? 'key' : 'keys');
            const summary = `${(array) ? 'Array' : 'Object'} · ${count.toLocaleString('en-US')} ${summaryValueLabel}`;

            if(!count){
                row.append(label, element('span', 'json-tree-summary', summary));

                return;
            }

            const toggle = element('button', 'json-tree-toggle');
            toggle.type = 'button';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 16 16');
            svg.setAttribute('aria-hidden', 'true');

            const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            chevron.setAttribute('d', 'm6 3 5 5-5 5');
            svg.append(chevron);
            toggle.append(svg, label, element('span', 'json-tree-summary', summary));
            row.append(toggle);

            const children = element('ul', 'json-tree-list');
            children.id = `json-tree-children-${++serial}`;
            toggle.setAttribute('aria-controls', children.id);
            item.append(children);

            let loaded = 0;
            let more;

            function loadPage(){
                if(more){
                    more.hidden = true;
                }

                const end = Math.min(count, loaded + TREE_PAGE_SIZE);

                for(; loaded < end; loaded++){
                    const key = (array) ? String(loaded) : keys[loaded];

                    addNode(children, (array) ? `[${key}]` : JSON.stringify(key), value[key], pointerChild(path, key));
                }

                if(loaded < count){
                    more = element('li', 'json-tree-more');

                    const button = element('button', 'button', `Show more (${(count - loaded).toLocaleString('en-US')} remaining)`);
                    button.type = 'button';
                    button.setAttribute('aria-label', `Show more children of ${name}`);
                    button.addEventListener('click', () => {
                        loadPage();
                        drain();

                        // 直前のボタンを非表示にした後も、表示されているコントロールにフォーカスを維持
                        if(loaded < count){
                            more.children[0].focus({ preventScroll: true });
                        } else{
                            toggle.focus({preventScroll: true});
                        }
                    });

                    more.append(button);
                    children.append(more);
                }
            }

            function sync(){
                const open = expanded.has(path);

                toggle.setAttribute('aria-expanded', String(open));

                children.hidden = (!open);

                if(open && !loaded){
                    loadPage();
                }
            }

            toggle.addEventListener('click', () => {
                if(expanded.has(path)){
                    expanded.delete(path);
                } else{
                    expanded.add(path);
                }

                sync();
                drain();
            });

            queue.push(sync);
        }

        function drain(){
            for(let index = 0; index < queue.length; index++){
                queue[index]();
            }

            queue.length = 0;
        }

        addNode(list, 'root', root, '');
        drain();
    }

    return {
        render,
        reset(){
            expanded = new Set(['']);
            renderedRevision = -1;
        }
    };
}
