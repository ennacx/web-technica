import { validateJson } from './validator.js';
import { prettyPrintJson, minifyJson, changeJsonIndent } from './formatter.js';

export class JsonEditorDocument {
    filename = 'document.json';
    source = '';
    mode = 'edit';
    editIndent = 2;
    view = {
        format: 'source',
        indent: 2,
        indentApplied: false,
        text: null,
        dirty: true,
    };

    get text(){
        return (this.mode === 'edit') ? this.source : this.getViewText();
    }

    get indent(){
        return (this.mode === 'edit') ? this.editIndent : this.view.indent;
    }

    setSource(text){
        if(text === this.source){
            return;
        }

        this.source = text;

        this.invalidateView();
    }

    setText(text){
        if(this.mode === 'view'){
            throw new TypeError('View text is generated from source and settings.');
        } else{
            this.setSource(text);
        }
    }

    setIndent(width){
        if(![2, 4, 8].includes(width)){
            throw new RangeError('Choose 2, 4, or 8 spaces.');
        }

        if(this.mode === 'view'){
            if(validateJson(this.source).state !== 'valid'){
                return false;
            }

            if(this.view.indent !== width || !this.view.indentApplied){
                this.view.indent = width;
                this.view.indentApplied = true;

                this.invalidateView();
            }
        } else{
            this.editIndent = width;
        }

        return true;
    }

    setViewFormat(format){
        if(!['source', 'pretty', 'minify'].includes(format)){
            throw new RangeError('Unsupported view format.');
        }

        if(validateJson(this.source).state !== 'valid'){
            return false;
        }

        if(this.view.format !== format){
            this.view.format = format;

            this.invalidateView();
        }

        return true;
    }

    invalidateView(){
        this.view.text = null;
        this.view.dirty = true;
    }

    getViewText(){
        if(!this.view.dirty){
            return this.view.text;
        }

        let text = this.source;

        // 無効や未完了の入力は設定を変更しなくてもそのまま表示され続ける
        if(validateJson(this.source).state === 'valid'){
            if(this.view.format === 'pretty'){
                text = prettyPrintJson(this.source, this.view.indent);
            } else if(this.view.format === 'minify'){
                text = minifyJson(this.source);
            } else if(this.view.indentApplied){
                text = changeJsonIndent(this.source, this.view.indent, this.view.indent);
            }
        }

        this.view.text = text;
        this.view.dirty = false;

        return text;
    }
}
