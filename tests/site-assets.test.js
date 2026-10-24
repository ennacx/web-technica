import test from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAssetPlan } from '../scripts/site-assets.mjs';
import { compile } from 'sass';
import { buildWebFonts, fontSources } from '../scripts/build-fonts.mjs';

const tools = JSON.parse(readFileSync('src/_data/tools.json', 'utf8'));

test('TTF sources generate the browser fonts referenced by CSS and allowlisted with licenses', async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'web-technica-font-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    await buildWebFonts(directory);
    const plan = createAssetPlan(tools);
    const files = mappedFiles(plan);
    assert.equal(plan.passthrough['src/assets/fonts/*.woff2'], 'assets/fonts');
    assert.ok(plan.watchTargets.includes('src/assets/fonts/*.ttf'));
    assert.ok(plan.watchIgnores.includes('src/assets/fonts/*.woff2'));
    for(const filename of files.keys()) assert.doesNotMatch(filename, /\.ttf$/);
    const css = compile('src/assets/css/style.scss').css;
    const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)];
    assert.equal(faces.length, 3);
    for(const [, face] of faces){
        const url = face.match(/url\("([^"]+)"\)/)[1];
        const target = path.posix.normalize(path.posix.join('assets/css', url));
        assert.equal(path.posix.dirname(target), 'assets/fonts');
        assert.ok(fontSources.some((source) => path.basename(source, '.ttf') + '.woff2' === path.basename(target)));
        assert.equal(readFileSync(path.join(directory, path.basename(target))).subarray(0, 4).toString(), 'wOF2');
        assert.match(face, /font-weight: \d+ \d+/);
        assert.match(face, /font-display: swap/);
    }
    assert.equal(plan.passthrough['src/assets/fonts/THIRD-PARTY-LICENSES.txt'], 'assets/fonts/THIRD-PARTY-LICENSES.txt');
    assert.ok(plan.watchIgnores.includes('src/assets/fonts/THIRD-PARTY-LICENSES.txt'));
    const combined = readFileSync(path.join(directory, 'THIRD-PARTY-LICENSES.txt'), 'utf8');
    for(const family of ['Inter', 'SpaceGrotesk', 'JetBrainsMono']){
        assert.ok(!files.has(`assets/fonts/OFL-${family}.txt`));
        const original = readFileSync(`src/assets/fonts/OFL-${family}.txt`, 'utf8');
        assert.ok(combined.includes(original), `${family}: preserve the complete copyright and license text`);
    }
});

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
        assert.doesNotMatch(filename, /(?:\.ttf|\.scss|\.map|README\.md|package(?:-lock)?\.json)$/);
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
