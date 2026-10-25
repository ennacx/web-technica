import { readFileSync } from 'node:fs';

export function createDocument(){
    const document = { activeElement: null };

    class Element {
        constructor(tag){
            this.tag = tag;
            this.children = [];
            this.attributes = {};
            this.listeners = {};
            this.dataset = {};
            this.style = {};
            this.value = '';
            this._text = '';
            this.selectionStart = this.selectionEnd = 0;
            this.scrollTop = this.scrollLeft = 0;
        }

        set textContent(value){
            this._text = value;
            this.children = [];
        }

        get textContent(){
            return this._text + this.children.map((node) => node.textContent).join('');
        }

        append(...nodes){
            for(const node of nodes){
                this.children.push(...((node.tag === 'fragment') ? node.children : [node]));
            }
        }

        replaceChildren(...nodes){
            this._text = '';
            this.children = [];
            this.append(...nodes);
        }

        setAttribute(name, value){
            this.attributes[name] = value;
        }

        removeAttribute(name){
            delete this.attributes[name];
        }

        addEventListener(name, handler){
            this.listeners[name] = handler;
        }

        fire(name){
            return this.listeners[name]?.({ target: this, preventDefault(){} });
        }

        focus(options){
            document.activeElement = this;
            this.focusOptions = options;
        }

        setSelectionRange(start, end){
            this.selectionStart = start;
            this.selectionEnd = end;
        }
    }

    const template = readFileSync(new URL('../../src/tools/json-editor/index.njk', import.meta.url), 'utf8');
    const elements = new Map(
        [...template.matchAll(/<([a-z]+)\b[^>]*\bid="(json-[^"]+)"/g)]
            .map(([, tag, id]) => [id, new Element(tag)
    ]));

    elements.get('json-indent').value = '2';
    elements.get('json-action-notice').hidden = true;

    document.getElementById = (id) => elements.get(id) ?? null;
    document.createElement = (tag) => new Element(tag);
    document.createElementNS = (_, tag) => new Element(tag);
    document.createDocumentFragment = () => new Element('fragment');
    document.createTextNode = (text) => { const node = new Element('text'); node.textContent = text; return node; };
    document.defaultView = {
        HTMLElement: Element,
        isSecureContext: true,
        navigator: {
            clipboard: { writeText: async () => {} }
        }
    };

    return document;
}
