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

    let view = 'matches';
    let hasResult = false;

    function showView(){
        for(const name of ['matches', 'preview']){
            get(name).hidden = (!hasResult || view !== name);
            get(`${name}-tab`).setAttribute('aria-pressed', String(view === name));
        }

        get('results-empty').hidden = (hasResult);
    }

    for(const name of ['matches', 'preview']){
        get(`${name}-tab`).addEventListener('click', () => {
            view = name;

            showView();
        });
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
                text: (match.start === match.end) ? '│' : text.slice(match.start, Math.min(match.end, end)),
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

        fragment.append(root.createTextNode(text.slice(cursor, end)));

        const pre = make('pre');
        pre.append(fragment);

        const preview = get('preview');
        preview.replaceChildren(pre);

        if(end < text.length){
            preview.append(make('p', {
                text: `Highlight shows the first ${end.toLocaleString('en')} UTF-16 code units.`,
                className: 'field-help regex-render-note'
            }));
        }
    }

    return {
        render(state){
            const { status, result, input } = state;
            const statusNode = get('status');

            statusNode.dataset.state = status;

            get('results-scroll').setAttribute('aria-busy', String(status === 'running'));
            hasResult = (status === 'success');

            if(!hasResult){
                get('matches').replaceChildren();
                get('preview').replaceChildren();

                const label = (status === 'running') ?
                    'Running…' :
                    ((status === 'scheduled') ?
                        'Waiting…' :
                        ((status === 'idle') ? 'Not run' : 'Error')
                    );

                get('match-count').textContent = label;
                get('results-empty').textContent = (result?.error) ? 'No results. Check the status below.' : 'No results yet.';
                statusNode.textContent =
                    result?.error?.message ??
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
                    notes.push('Highlight text is shortened.');
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
