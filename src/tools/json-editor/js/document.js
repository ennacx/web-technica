import { validateJson } from './validator.js';
import { prettyPrintJson, minifyJson, changeJsonIndent } from './formatter.js';
import { sortJsonKeys } from './key-sorter.js';

export class JsonEditorDocument {
    filename = 'document.json';
    source = '';
    mode = 'edit';
    revision = 0;
    validation = null;
    parsed = undefined;
    editIndent = 2;
    editSort = null;
    view = {
        format: 'source',
        indent: 2,
        indentApplied: false,
        sort: null,
        text: null,
        dirty: true,
    };

    get text(){
        return (this.mode === 'view') ? this.getViewText() : this.source;
    }

    get indent(){
        return (this.mode === 'edit') ? this.editIndent : this.view.indent;
    }

    get sort(){
        return this.mode === 'edit' ? this.editSort : this.view.sort;
    }

    setViewSort(direction){
        if(![null, 'asc', 'desc'].includes(direction)){
            throw new RangeError('Choose asc, desc, or null.');
        }

        if(this.validateSource().state !== 'valid'){
            return false;
        }

        if(this.view.sort !== direction){
            this.view.sort = direction;

            this.invalidateView();
        }

        return true;
    }

    sortKeys(direction){
        if(this.mode === 'tree') return false;
        if(!['asc', 'desc'].includes(direction)){
            throw new RangeError('Choose asc or desc.');
        }

        if(this.validateSource().state !== 'valid'){
            return false;
        }

        if(this.mode === 'view'){
            return this.setViewSort(direction);
        }

        this.setSource(sortJsonKeys(this.source, direction));
        this.editSort = direction;

        return true;
    }

    // Syntax and error positions always refer to the editable source, never
    // to generated display text or its cache.
    validateSource(){
        if(!this.validation){
            this.parsed = undefined;
            this.validation = validateJson(this.source, (parsed) => { this.parsed = parsed; });
        }
        return this.validation;
    }

    setSource(text){
        if(text === this.source){
            return;
        }

        this.source = text;
        this.revision++;
        this.validation = null;
        this.parsed = undefined;

        this.invalidateView();
    }

    setText(text){
        if(this.mode !== 'edit'){
            throw new TypeError('View text is generated from source and settings.');
        } else{
            this.setSource(text);
        }
    }

    setIndent(width){
        if(this.mode === 'tree') return false;
        if(![2, 4, 8].includes(width)){
            throw new RangeError('Choose 2, 4, or 8 spaces.');
        }

        if(this.mode === 'view'){
            if(this.validateSource().state !== 'valid'){
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

        if(this.validateSource().state !== 'valid'){
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
        if(this.validateSource().state === 'valid'){
            if(this.view.sort){
                text = sortJsonKeys(text, this.view.sort);
            }

            if(this.view.format === 'pretty'){
                text = prettyPrintJson(text, this.view.indent);
            } else if(this.view.format === 'minify'){
                text = minifyJson(text);
            } else if(this.view.indentApplied){
                text = changeJsonIndent(text, this.view.indent, this.view.indent);
            }
        }

        this.view.text = text;
        this.view.dirty = false;

        return text;
    }
}
