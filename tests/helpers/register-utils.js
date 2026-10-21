import { registerHooks } from 'node:module';

// Match the browser import map when testing tool source modules in Node.
registerHooks({
    resolve(specifier, context, nextResolve){
        if(specifier.startsWith('#utils/') || specifier.startsWith('#components/')){
            return nextResolve(new URL('../../src/assets/js/' + specifier.slice(1), import.meta.url).href, context);
        }

        return nextResolve(specifier, context);
    }
});
