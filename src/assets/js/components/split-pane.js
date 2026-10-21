// 各ハンドルは自身のパネルのみを変化させ、ワークスペースは子要素の拡大に合わせて大きくなる。
// ホスト側のCSSは --<name>-min/max/default を提供し、--<name>-height を利用する。
export function setupSplitPane(workspace, splitter, resetButton, {
    pane = workspace.firstElementChild,
    name = 'input',
    label = 'Input'
} = {}){
    let requestedHeight = null;
    let drag = null;

    function measure(){
        const style = getComputedStyle(workspace);
        const min = Number.parseFloat(style.getPropertyValue(`--${name}-min`));
        const max = Number.parseFloat(style.getPropertyValue(`--${name}-max`));
        const initial = Number.parseFloat(style.getPropertyValue(`--${name}-default`));

        return { min, max, initial };
    }

    function render(){
        const { min, max, initial } = measure();
        const height = Math.max(min, Math.min(max, requestedHeight ?? initial));

        workspace.style.setProperty(`--${name}-height`, `${height}px`);

        splitter.setAttribute('aria-valuemin', min);
        splitter.setAttribute('aria-valuemax', max);
        splitter.setAttribute('aria-valuenow', Math.round(height));
        splitter.setAttribute('aria-valuetext', `${label} height ${Math.round(height)} pixels`);
    }

    function setHeight(height){
        const { min, max } = measure();

        requestedHeight = Math.max(min, Math.min(max, height));

        render();
    }

    function reset(){
        requestedHeight = null;

        render();
    }

    function finish(event){
        if(!drag || event.pointerId !== drag.id){
            return;
        }

        drag = null;

        delete workspace.dataset.resizing;

        if(splitter.hasPointerCapture(event.pointerId)){
            splitter.releasePointerCapture(event.pointerId);
        }
    }

    splitter.addEventListener('pointerdown', (event) => {
        if(!event.isPrimary || event.button !== 0 || drag){
            return;
        }

        event.preventDefault();

        splitter.focus({ preventScroll: true });

        drag = {
            id: event.pointerId,
            y: event.pageY,
            height: pane.getBoundingClientRect().height
        };

        splitter.setPointerCapture(event.pointerId);

        workspace.dataset.resizing = '';
    });

    splitter.addEventListener('pointermove', (event) => {
        if(drag && event.pointerId === drag.id){
            setHeight(drag.height + event.pageY - drag.y);
        }
    });

    for(const name of ['pointerup', 'pointercancel', 'lostpointercapture']){
        splitter.addEventListener(name, finish);
    }

    splitter.addEventListener('dblclick', reset);
    resetButton.addEventListener('click', reset);

    splitter.addEventListener('keydown', (event) => {
        const { min, max } = measure();
        const current = pane.getBoundingClientRect().height;
        const step = (event.shiftKey) ? 50 : 10;

        switch(event.key){
            case 'ArrowUp':
                setHeight(current - step);
                break;
            case 'ArrowDown':
                setHeight(current + step);
                break;
            case 'Home':
                setHeight(min);
                break;
            case 'End':
                setHeight(max);
                break;
            case 'Enter':
                reset();
                break;
            default:
                return;
        }

        event.preventDefault();
    });

    new ResizeObserver(render).observe(workspace);

    render();
}
