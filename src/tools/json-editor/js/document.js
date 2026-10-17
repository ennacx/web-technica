export class JsonEditorDocument {
    filename = 'document.json';
    source = '';
    viewText = '';
    mode = 'edit';
    editIndent = 2;
    viewIndent = 2;

    get text(){
        return (this.mode === 'edit') ? this.source : this.viewText;
    }

    get indent(){
        return (this.mode === 'edit') ? this.editIndent : this.viewIndent;
    }

    setSource(text){
        if(text === this.source){
            return;
        }

        this.source = text;
        this.viewText = text;
        this.viewIndent = this.editIndent;
    }

    setText(text){
        if(this.mode === 'view'){
            this.viewText = text;
        } else{
            this.setSource(text);
        }
    }

    setIndent(width){
        if(this.mode === 'view'){
            this.viewIndent = width;
        } else{
            this.editIndent = width;
        }
    }
}
