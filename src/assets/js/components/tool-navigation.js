import { querySel, querySelAll } from '../utils/dom.js';

// 通常のリンクと併せて開閉ボタンを使用することで、Tabキーによるナビゲーションが通常通り機能するようにします。
for(const navigation of querySelAll('[data-tool-navigation]', document)){
    const categories = [...querySelAll('.site-nav-category', navigation)];
    const mobileMenu = querySel('[data-mobile-tool-navigation]', navigation);

    function closeMobileMenu(){
        for(const details of querySelAll('details', mobileMenu)){
            details.open = false;
        }
        mobileMenu.open = false;
    }

    mobileMenu.addEventListener('keydown', (event) => {
        if(event.key === 'Escape'){
            const details = event.target.closest('details[open]');

            if(details && mobileMenu.contains(details)){
                if(details === mobileMenu){
                    closeMobileMenu();
                } else{
                    details.open = false;
                }

                querySel('summary', details).focus();

                event.preventDefault();
            }
        }
    });

    mobileMenu.addEventListener('focusout', (event) => {
        if(!mobileMenu.contains(event.relatedTarget)){
            closeMobileMenu();
        }
    });

    mobileMenu.addEventListener('click', (event) => {
        if(event.target.closest('a')){
            closeMobileMenu();
        }
    });

    /*
     * モバイルとデスクトップのレイアウトを切り替え時に情報をリセット
     */
    const mobileLayout = window.matchMedia('(max-width: 767.98px)');
    mobileLayout.addEventListener('change', () => {
        closeMobileMenu();
        closeAll();
    });

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
        if(!mobileMenu.contains(event.target)){
            closeMobileMenu();
        }

        if(!navigation.contains(event.target)){
            closeAll();
        }
    });
}
