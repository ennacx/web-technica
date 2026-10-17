import { validateJson } from './validator.js';

// ロケールを固定しUIロケールが異なっても同じ入力が常に一貫した順序で並ぶようにする
const collator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'variant'
});

export function sortJsonKeys(source, direction = 'asc'){
    if(!['asc', 'desc'].includes(direction)){
        throw new RangeError('Choose asc or desc.');
    }

    const validation = validateJson(source);

    if(validation.state !== 'valid'){
        throw new SyntaxError(validation.message || 'Enter JSON to sort.');
    }

    const stack = [];
    const containers = [];

    let root;

    const attach = (node) => {
        const parent = stack.at(-1);

        if(!parent){
            root = node;
        } else if(parent.kind === 'array'){
            parent.items.push(node);
        } else{
            parent.items.push({ key: parent.key, value: node });
            parent.key = null;
        }
    };

    // JSオブジェクトを構築するのではなく、ソース上のオフセットと生のトークンを保持する。
    // これにより重複するキーや数値キー、エスケープ、そして丸め処理なしの数値がそのまま維持される。
    const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\x20\t\r\n{}\[\],:]+/g;
    for(const match of source.matchAll(tokens)){
        const raw = match[0];
        const start = match.index;

        if(raw === '{' || raw === '['){
            const node = {
                kind: (raw === '{') ? 'object' : 'array',
                start,
                items: [],
                key: null
            };

            attach(node);

            stack.push(node);
        } else if(raw === '}' || raw === ']'){
            const node = stack.pop();

            node.end = start + 1;

            containers.push(node);
        } else if(raw !== ':' && raw !== ','){
            const parent = stack.at(-1);

            if(parent?.kind === 'object' && parent.key === null){
                parent.key = { start, decoded: JSON.parse(raw) };
            } else{
                attach({ start, end: start + raw.length, text: raw });
            }
        }
    }

    // Containers close in child-first order, avoiding recursive call limits.
    for(const node of containers){
        if(!node.items.length){
            node.text = source.slice(node.start, node.end);

            continue;
        }

        if(node.kind === 'array'){
            const output = [];

            let position = node.start;

            for(const item of node.items){
                output.push(source.slice(position, item.start), item.text);
                position = item.end;
            }

            output.push(source.slice(position, node.end));
            node.text = output.join('');
        } else{
            const sorted = node.items.map((item, index) => ({ ...item, index }));

            sorted.sort((left, right) => {
                const comparison = collator.compare(left.key.decoded, right.key.decoded);

                return ((direction === 'asc') ? comparison : -comparison) || left.index - right.index;
            });

            const output = [source.slice(node.start, node.items[0].key.start)];

            for(let index = 0; index < sorted.length; index++){
                const item = sorted[index];
                const slot = node.items[index];
                const next = node.items[index + 1]?.key.start ?? node.end;

                output.push(source.slice(item.key.start, item.value.start), item.value.text,
                    source.slice(slot.value.end, next));
            }

            node.text = output.join('');
        }
    }

    return source.slice(0, root.start) + root.text + source.slice(root.end);
}
