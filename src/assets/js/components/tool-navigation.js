import { querySel, querySelAll } from '../utils/dom.js';

// Use disclosure buttons with ordinary links so Tab retains normal navigation.
for(const navigation of querySelAll('[data-tool-navigation]', document)){
    const categories = [...querySelAll('.site-nav-category', navigation)];

    function setExpanded(category, expanded){
        querySel('button', category).setAttribute('aria-expanded', String(expanded));
        querySel('ul', category).hidden = !expanded;
    }

    function closeAll(except){
        for(const category of categories){
            if(category !== except){
                setExpanded(category, false);
            }
        }
    }

    for(const category of categories){
        /** @var {HTMLElement} button */
        const button = querySel('button', category);
        const links = [...querySelAll('ul a', category)];

        function open(){
            closeAll(category);
            setExpanded(category, true);
        }

        button.addEventListener('click', () => {
            const expanded = button.getAttribute('aria-expanded') === 'true';
            closeAll();
            setExpanded(category, !expanded);
        });

        category.addEventListener('pointerenter', (event) => {
            if(event.pointerType === 'mouse'){
                open();
            }
        });

        category.addEventListener('pointerleave', (event) => {
            if(event.pointerType === 'mouse' && !category.contains(document.activeElement)){
                setExpanded(category, false);
            }
        });

        category.addEventListener('focusout', (event) => {
            if(!category.contains(event.relatedTarget)){
                setExpanded(category, false);
            }
        });

        category.addEventListener('keydown', (event) => {
            if(event.key === 'Escape'){
                setExpanded(category, false);

                button.focus();
                event.preventDefault();
            } else if(event.target === button && ['ArrowDown', 'ArrowUp'].includes(event.key)){
                open();

                ((event.key === 'ArrowDown') ? links[0] : links.at(-1))?.focus();
                event.preventDefault();
            }
        });
    }

    document.addEventListener('pointerdown', (event) => {
        if(!navigation.contains(event.target)){
            closeAll();
        }
    });
}
