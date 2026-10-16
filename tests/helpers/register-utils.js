import { registerHooks } from 'node:module';

// Match the browser import map when testing tool source modules in Node.
registerHooks({
    resolve(specifier, context, nextResolve){
        if(specifier.startsWith('#utils/')){
            return nextResolve(new URL('../../src/assets/js/utils/' + specifier.slice(7), import.meta.url).href, context);
        }

        return nextResolve(specifier, context);
    }
});
