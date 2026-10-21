import test from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createAssetPlan } from '../scripts/site-assets.mjs';

const tools = JSON.parse(readFileSync('src/_data/tools.json', 'utf8'));

function mappedFiles(plan){
    const files = new Map();
    for(const [source, destination] of Object.entries(plan.passthrough)){
        for(const entry of globSync(source)){
            if(statSync(entry).isDirectory()){
                for(const child of globSync(`${entry.replaceAll('\\', '/')}/**/*`)){
                    if(statSync(child).isFile()){
                        files.set(path.posix.join(destination, path.relative(entry, child).replaceAll('\\', '/')), child);
                    }
                }
            } else{
                files.set(source.includes('*') ? path.posix.join(destination, path.basename(entry)) : destination, entry);
            }
        }
    }
    return files;
}

test('asset plan covers every routed tool regardless of publication state, and omits unrouted plans', () => {
    const plan = createAssetPlan([...tools, { slug: 'planned-tool', url: null, status: 'planned' }]);
    for(const tool of tools.filter((tool) => tool.url)){
        assert.ok(plan.stylesheets.includes(`src/tools/${tool.slug}/css/${tool.slug}`), tool.slug);
        assert.ok(plan.watchTargets.includes(`src/tools/${tool.slug}/js/**/*.js`), tool.slug);
        assert.ok(plan.watchIgnores.includes(`src/tools/${tool.slug}/css/**/*.css.map`), tool.slug);
    }
    assert.ok(!JSON.stringify(plan).includes('planned-tool'));
    assert.equal(new Set(plan.stylesheets).size, plan.stylesheets.length);
});

test('keygen generated assets are explicitly allowlisted without requiring a prior build', () => {
    const plan = createAssetPlan(tools);
    const keygen = Object.fromEntries(Object.entries(plan.passthrough)
        .filter(([source]) => source.startsWith('src/tools/keygen/')));
    assert.deepEqual(keygen, {
        'src/tools/keygen/css/*.css': 'keygen/css',
        'src/tools/keygen/js/app.js': 'keygen/js/app.js',
        'src/tools/keygen/js/app.js.LEGAL.txt': 'keygen/js/app.js.LEGAL.txt',
        'src/tools/keygen/js/THIRD-PARTY-LICENSES.txt': 'keygen/js/THIRD-PARTY-LICENSES.txt'
    }, 'only the bundle, its licenses and CSS may be published as runtime assets');
});

test('native asset allowlist retains shared modules and Worker imports while excluding tool/build sources', () => {
    const plan = createAssetPlan(tools);
    // Generated keygen files are absent before CI's build step. Check their
    // declarations above; enumerate source assets independently of local build state.
    const passthrough = Object.fromEntries(Object.entries(plan.passthrough)
        .filter(([source]) => !source.startsWith('src/tools/keygen/js/')));
    const files = mappedFiles({ passthrough });
    for(const filename of [
        'assets/js/components/copy-button.js', 'assets/js/components/notice.js',
        'assets/js/components/split-pane.js', 'assets/js/utils/text.js',
        'regex-tester/js/workers/javascript.worker.js', 'regex-tester/js/engines/javascript.js'
    ]){
        assert.ok(files.has(filename), filename);
    }
    assert.ok(!files.has('regex-tester/js/split-pane.js'), 'removed tool-local component must not enter the PWA cache');
    for(const filename of files.keys()){
        assert.doesNotMatch(filename, /(?:\.scss|\.map|README\.md|package(?:-lock)?\.json)$/);
        assert.doesNotMatch(filename, /(?:^|\/)(?:node_modules|scripts|nodejs)\//);
        if(filename.startsWith('keygen/')){
            assert.match(filename, /^keygen\/(?:css\/keygen\.css|js\/(?:app\.js(?:\.LEGAL\.txt)?|THIRD-PARTY-LICENSES\.txt))$/);
        }
    }
    for(const [filename, source] of files){
        if(!filename.endsWith('.js')) continue;
        const code = readFileSync(source, 'utf8');
        for(const [, specifier] of code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)){
            const target = specifier.startsWith('#') ?
                'assets/js/' + specifier.slice(1) :
                path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier));
            assert.ok(files.has(target), `${filename} imports missing ${specifier}`);
        }
    }
});
