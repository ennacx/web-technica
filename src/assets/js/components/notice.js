/**
 * テキストのみのステータス/通知。
 * レイアウト、ライブリージョン (live-region) の役割、および文言は、HTMLやツール側で管理する。
 *
 * @param status
 * @param param1
 * @param param1.container
 * @param param1.dismiss
 * @param param1.focusTarget
 * @return {{clear: clear, show(*, *): void}}
 */
export function createNotice(status, { container, dismiss, focusTarget } = {}){
    function clear(){
        status.textContent = '';

        delete status.dataset.state;

        if(container){
            container.hidden = true;
        }
    }

    dismiss?.addEventListener('click', () => {
        const target = (typeof focusTarget === 'function') ? focusTarget() : focusTarget;
        target?.focus({ preventScroll: true });

        clear();
    });

    return {
        clear,
        show(message, state){
            status.textContent = message;

            if(state === undefined){
                delete status.dataset.state;
            } else{
                status.dataset.state = state;
            }

            if(container){
                container.hidden = false;
            }
        }
    };
}
