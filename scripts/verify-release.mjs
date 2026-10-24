import { spawnSync, execFileSync } from 'node:child_process';
import {
    copyFileSync, existsSync, globSync, lstatSync, mkdirSync, mkdtempSync,
    readFileSync, realpathSync, rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createAssetPlan } from './site-assets.mjs';
import { fontSources } from './build-fonts.mjs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function generatedFiles(repository){
    const plan = createAssetPlan(readJson(path.join(repository, 'src/_data/tools.json')));

    return [
        'src/assets/fonts/THIRD-PARTY-LICENSES.txt',
        ...fontSources.map((source) => source.replace(/\.ttf$/, '.woff2')),
        ...plan.stylesheets.flatMap((entry) => [`${entry}.css`, `${entry}.css.map`]),
        ...[180, 192, 512].map((size) => `src/assets/img/brand/icon-${size}.png`),
        'src/assets/img/brand/social-card.png',
        'src/tools/keygen/js/app.js',
        'src/tools/keygen/js/app.js.map',
        'src/tools/keygen/js/app.js.LEGAL.txt',
        'src/tools/keygen/js/THIRD-PARTY-LICENSES.txt'
    ];
}

/**
 * 現在作業中のファイル (追跡対象外のソースを含む) をコピーすること。
 * !!! 以前のビルド出力は決して含めないこと !!!
 */
export function copyReleaseSources(repository, destination){
    const generated = new Set(generatedFiles(repository));
    const files = execFileSync('git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        {
            cwd: repository,
            encoding: 'utf8'
        }
    ).split('\0').filter(Boolean);

    let count = 0;

    for(const file of new Set(files)){
        if(generated.has(file) || /(^|\/)(?:node_modules|dist|\.git)(?:\/|$)/.test(file)){
            continue;
        }

        const source = path.resolve(repository, file);
        const target = path.resolve(destination, file);

        assert((!path.relative(destination, target).startsWith('..') && target !== destination), `Invalid snapshot path: ${file}`);

        // ワーキングツリーで削除された追跡対象ファイルはこの段階で既になくなっているはず
        if(!existsSync(source)){
            continue;
        }

        assert((lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink()), `Expected a regular source file: ${file}`);

        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);

        count++;
    }

    return count;
}

/**
 * 所有する一時プロジェクト内で、生成されたことが判明しているパスのみを削除する。
 */
function clearGenerated(project){
    for(const file of [...generatedFiles(project), 'dist']){
        const target = path.resolve(project, file);

        assert((!path.relative(project, target).startsWith('..') && target !== project));

        rmSync(target, { recursive: file === 'dist', force: true });
    }
}

/**
 * 実際に生成されたアセットとビルドコマンドの終了ステータスの両方を確認する。
 */
export function verifyReleaseOutput(project, prefix){
    const output = path.join(project, 'dist');
    const tools = readJson(path.join(project, 'src/_data/tools.json'));
    const site = readJson(path.join(project, 'src/_data/site.json'));
    const version = readJson(path.join(project, 'package.json')).version;
    const worker = readFileSync(path.join(output, 'sw.js'), 'utf8');
    const precache = worker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);

    assert((precache), 'Production Service Worker was not generated');

    const cached = new Set(JSON.parse(precache[1]));
    const expected = new Set([
        'index.html', '404.html', 'offline.html',
        'manifest.webmanifest', 'sitemap.xml',
        site.social.image.slice(1),
        // 各ツールのindex.html
        ...tools.filter((tool) => tool.url).map((tool) => `${tool.slug}/index.html`),
        // keygen
        'keygen/js/app.js', 'keygen/js/app.js.LEGAL.txt', 'keygen/js/THIRD-PARTY-LICENSES.txt'
    ]);
    const plan = createAssetPlan(tools);
    for(const source of fontSources){
        expected.add(`assets/fonts/${path.basename(source, '.ttf')}.woff2`);
    }
    expected.add('assets/fonts/THIRD-PARTY-LICENSES.txt');

    for(const [source, destination] of Object.entries(plan.passthrough)){
        const matches = [...globSync(source, { cwd: project })];

        assert((matches.length > 0), `Missing build source: ${source}`);

        for(const entry of matches){
            if(lstatSync(path.join(project, entry)).isDirectory()){
                for(const child of globSync('**/*', { cwd: path.join(project, entry) })){
                    if(lstatSync(path.join(project, entry, child)).isFile()){
                        expected.add(path.posix.join(destination, child.replaceAll('\\', '/')));
                    }
                }
            } else{
                expected.add(source.includes('*') ? path.posix.join(destination, path.basename(entry)) : destination);
            }
        }
    }

    for(const file of expected){
        assert((existsSync(path.join(output, file))), `Missing output: ${file}`);
        assert((cached.has(prefix + file.replace(/(^|\/)index\.html$/, '$1'))), `Not precached: ${file}`);

        if(file.endsWith('.html')){
            const html = readFileSync(path.join(output, file), 'utf8');

            assert(html.includes(`href="${prefix}assets/fonts/THIRD-PARTY-LICENSES.txt"`), `Missing font license link: ${file}`);

            const footer = html.match(/<small\b[^>]*class="[^"]*\bfooter-version\b[^"]*"[^>]*>([\s\S]*?)<\/small>/);

            assert.equal(footer?.[1].replace(/<[^>]*>/g, '').trim(), `v${version}`, `Missing footer version: ${file}`);

            const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);

            assert((map), `Missing import map: ${file}`);

            const { imports } = JSON.parse(map[1]);

            assert.equal(imports['#utils/'], `${prefix}assets/js/utils/`, `Wrong import map: ${file}`);
            assert.equal(imports['#components/'], `${prefix}assets/js/components/`, `Wrong component import map: ${file}`);

            const imageUrl = new URL(prefix + site.social.image.slice(1), site.url).href;
            assert(html.includes(`property="og:image" content="${imageUrl}"`), `Wrong social image URL: ${file}`);
            assert(html.includes('name="twitter:card" content="summary_large_image"'), `Missing X card: ${file}`);
        }
    }

    for(const file of globSync('**/*', { cwd: output })){
        assert((!/(?:\.ttf|\.scss|\.map|README\.md|package(?:-lock)?\.json)$|(?:^|[\\/])(?:node_modules|scripts|nodejs)(?:[\\/]|$)/.test(file)), `Development file published: ${file}`);
    }

    console.log(`[verify:release] ${prefix}: ${expected.size} required pages/assets and PWA cache verified`);
}

export function verifyRelease(){
    const repository = fileURLToPath(new URL('../', import.meta.url));
    const npmCli = process.env.npm_execpath;

    assert((npmCli && existsSync(npmCli)), 'Run this check with npm run verify:release');

    const temporaryBase = realpathSync(tmpdir());

    // Outside the repository: module resolution cannot fall back to its node_modules.
    const relative = path.relative(repository, temporaryBase);

    assert((path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)),
        'The OS temp directory must be outside the repository');

    const temporary = mkdtempSync(path.join(temporaryBase, 'web-technica-release-'));
    const project = path.join(temporary, 'project');
    const environment = { ...process.env };

    for(const key of Object.keys(environment)){
        if(/^(?:npm_package_|npm_lifecycle_)/i.test(key) ||
            /^(?:NODE_PATH|NODE_OPTIONS|INIT_CWD|npm_config_local_prefix|npm_config_prefix|npm_config_workspace|npm_config_workspaces|npm_config_include_workspace_root)$/i.test(key)){
            delete environment[key];
        }
    }
    function npm(args){
        console.log(`\n[verify:release] npm ${args.join(' ')}`);

        const result = spawnSync(process.execPath, [npmCli, ...args], {
            cwd: project,
            env: environment,
            stdio: 'inherit'
        });

        if(result.error){
            throw result.error;
        }

        assert.equal(result.status, 0, `npm ${args.join(' ')} failed${result.signal ? ` (${result.signal})` : ''}`);
    }

    try{
        mkdirSync(project);

        console.log(`[verify:release] Temporary project: ${project}`);
        console.log(`[verify:release] Copied ${copyReleaseSources(repository, project)} working source files`);

        assert((!existsSync(path.join(project, 'node_modules'))));

        npm(['ci', '--include=dev', '--no-audit', '--no-fund', '--cache', path.join(temporary, 'npm-cache')]);
        npm(['test']);

        for(const [command, prefix] of [['build', '/'], ['build:pages', '/web-technica/']]){
            // テストが独自にアセットを生成する場合があるが、どちらのビルドもそれらを再利用することはできない。
            clearGenerated(project);
            npm(['run', command]);
            verifyReleaseOutput(project, prefix);
        }

        console.log('\n[verify:release] Clean install, tests, root build and Pages build passed.');
    } finally{
        // Only remove the directory minted by mkdtemp above, never a caller-supplied path.
        assert.equal(path.dirname(temporary), temporaryBase);
        assert((path.basename(temporary).startsWith('web-technica-release-')));
        assert.equal(realpathSync(temporary), temporary);

        rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
    }
}

if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url){
    try{
        verifyRelease();
    } catch(e){
        console.error(`[verify:release] ${e.message}`);

        process.exitCode = 1;
    }
}
