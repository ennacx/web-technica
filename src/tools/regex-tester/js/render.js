import { getById, create } from '#utils/dom.js';
import { LIMITS } from './result.js';

export function createRenderer(root){
    const get = (name) => getById(`regex-${name}`, root);
    const make = (tag, { text, className } = {}) => {
        const node = create(tag, root);

        if(text !== undefined){
            node.textContent = text;
        }

        if(className){
            node.className = className;
        }

        return node;
    };

    let hasResult = false;

    function showView(){
        get('matches').hidden = (!hasResult);
        get('results-empty').hidden = (hasResult);
    }

    function syncHighlight(){
        const input = get('text');
        const highlight = get('highlight');

        // 背景 (Backdrop) のViewportからネイティブのスクロールバーを除外する
        // コンテンツのメトリクス (フォント、パディング、行の高さ、タブ) はCSSにおいてtextareaと共有される
        highlight.style.width = `${input.clientWidth}px`;
        highlight.style.height = `${input.clientHeight}px`;
        highlight.scrollTop = input.scrollTop;
        highlight.scrollLeft = input.scrollLeft;
    }

    function value(text, range){
        if(range.start === null){
            return '(not matched)';
        }

        if(range.start === range.end){
            return '(empty)';
        }

        const end = Math.min(range.end, range.start + LIMITS.displayedValueLength);

        return text.slice(range.start, end) + ((end < range.end) ? '…' : '');
    }

    function offset(range){
        return (range.start === null) ? '—' : `[${range.start}, ${range.end})`;
    }

    function renderMatches(result, text){
        const fragment = root.createDocumentFragment();

        let omittedGroups = false;

        for(const [i, match] of result.matches.slice(0, LIMITS.displayedMatches).entries()){
            const card = make('details', { text: undefined, className: 'regex-match'});
            const summary = make('summary');
            const position = make('span', { text: offset(match), className: 'field-help' });

            card.open = (i === 0);
            position.title = 'UTF-16 offsets, end exclusive';

            summary.append(`Match ${i + 1}`, make('code', { text: value(text, match), className: undefined }), position);
            card.append(summary);

            const captures = [
                ...match.groups.map((group) => ({ ...group, label: `Group ${group.index}` })),
                ...match.namedGroups.map((group) => ({ ...group, label: `Named · ${group.name}` }))
            ];

            if(captures.length){
                const list = make('dl');

                for(const group of captures.slice(0, LIMITS.displayedGroups)){
                    list.append(
                        make('dt', { text: group.label, className: undefined }),
                        make('dd', { text: `${value(text, group)}  ${offset(group)}`, className: undefined })
                    );
                }

                card.append(list);
            }

            if(captures.length > LIMITS.displayedGroups){
                omittedGroups = true;

                card.append(make('p', {
                    text: `Showing the first ${LIMITS.displayedGroups} capture entries.`,
                    className: 'field-help regex-render-note'
                }));
            }

            fragment.append(card);
        }

        get('matches').replaceChildren(fragment);

        return omittedGroups;
    }

    function renderHighlight(result, text){
        const fragment = root.createDocumentFragment();
        const end = Math.min(text.length, LIMITS.highlightedLength);

        let cursor = 0;

        for(const match of result.matches){
            if(match.start > end || (match.start === end && end < text.length)){
                break;
            }

            fragment.append(root.createTextNode(text.slice(cursor, match.start)));

            const mark = make('mark', {
                text: text.slice(match.start, Math.min(match.end, end)),
                className: undefined
            });

            mark.title = `Match at ${offset(match)} (UTF-16)`;

            if(match.start === match.end){
                mark.className = 'regex-zero-width';
                mark.setAttribute('aria-label', `Empty match at offset ${match.start}`);
            }

            fragment.append(mark);

            cursor = Math.min(match.end, end);

            if(match.end > end){
                break;
            }
        }

        // 背景のスクロール範囲がずれないようソース全体を保持
        // 適用範囲はハイライトのみであり、上限を超えた部分のテキストも引き続き編集可能
        fragment.append(root.createTextNode(text.slice(cursor)));

        // <pre>要素では textareaと同様、末尾の改行のために空の行ボックスが必要
        if(text.endsWith('\n')){
            fragment.append(root.createTextNode('\u200b'));
        }

        get('highlight').replaceChildren(fragment);

        syncHighlight();
    }

    return {
        syncHighlight,
        render(state){
            const { status, result, input } = state;
            const statusNode = get('status');

            statusNode.dataset.state = status;

            get('results-scroll').setAttribute('aria-busy', String(status === 'running'));
            hasResult = (status === 'success');

            if(!hasResult){
                get('matches').replaceChildren();
                get('highlight').replaceChildren();

                const label = (status === 'running') ?
                    'Running…' :
                    ((status === 'scheduled') ?
                        'Waiting…' :
                        ((status === 'idle') ? 'Not run' : 'Error')
                    );

                get('match-count').textContent = label;
                get('results-empty').textContent = (result?.error) ? 'No results. Check the status above.' : 'No results yet.';
                const missingInputMessage = (input?.pattern === '' && input?.text === '') ?
                    'Enter a pattern and test text.' :
                    (input?.pattern === '') ? 'Enter a pattern.' :
                    (input?.text === '') ? 'Enter test text.' : null;

                statusNode.textContent =
                    result?.error?.message ??
                    missingInputMessage ??
                    ((status === 'scheduled') ?
                        'Waiting for input to settle…' :
                        ((status === 'running') ?
                            'Running in a worker…' :
                            'Not run · Choose Run or switch to Auto.'
                        )
                    );
            } else{
                const groupsOmitted = renderMatches(result, input.text);

                renderHighlight(result, input.text);

                const count = result.matches.length;

                get('match-count').textContent = (result.truncated) ?
                    `${count}+ matches` :
                    `${count} match${(count > 1) ? 'es' : ''}`;

                if(result.truncated && count === 0){
                    get('match-count').textContent = 'Limit reached';
                }

                const notes = [];

                if(result.truncated){
                    const isCaptureLimit = (result.truncationReason === 'capture-limit');

                    notes.push(`Execution stopped at the ${(isCaptureLimit) ? 'capture' : 'match'} limit; more results may exist.`);
                }
                if(count > LIMITS.displayedMatches){
                    notes.push(`Match list shows the first ${LIMITS.displayedMatches}.`);
                }
                if(groupsOmitted){
                    notes.push('Some capture entries are omitted.');
                }
                if(input.text.length > LIMITS.highlightedLength){
                    notes.push(`Highlights are limited to the first ${LIMITS.highlightedLength.toLocaleString('en')} UTF-16 code units; test text is kept in full.`);
                }

                if(notes.length){
                    statusNode.dataset.state = 'limited';
                }

                statusNode.textContent = (count === 0 && !result.truncated) ?
                    'No matches' :
                    [
                        ((result.truncated) ? `${count} matches collected` : `${count} matches`),
                        `${result.elapsedMs.toFixed(1)} ms`,
                        `UTF-16 offsets, end exclusive.${(notes.length) ? ` ${notes.join(' ')}` : ''}`
                    ].join(' · ');

                if(count === 0){
                    get('matches').append(make('p', {
                        text: (result.truncated) ? 'Capture limit reached before a match could be displayed.' : 'No matches found.',
                        className: 'regex-empty'
                    }));
                }
            }

            showView();
        }
    };
}
