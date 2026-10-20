import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { buildKeygen } from './src/tools/keygen/scripts/build.mjs';
import { buildPwaIcons, buildServiceWorker } from './scripts/build-pwa.mjs';
import { isToolAvailable, groupAvailableTools } from './scripts/tool-status.mjs';

export default function(eleventyConfig){
    // XMLは最初のバイトで必ずXML宣言をしなければならないため、ビルド時に先頭と文末をtrimする。
    eleventyConfig.addTransform('trimXml', function(content){
        if((this.page.outputPath || '').endsWith('.xml')){
            return content.trim();
        }

        return content;
    });

    // サイトマップのコレクションを登録
    eleventyConfig.addCollection('sitemap', (collectionApi) => {
        return collectionApi.getAll().filter((item) => (
            item.outputPath?.endsWith('.html')
            && item.data.sitemap !== false
            && !item.data.noindex
        )).sort((a, b) => a.url.localeCompare(b.url));
    });

    // 共通
    eleventyConfig.addWatchTarget('src/assets/js/**/*.js');
    eleventyConfig.addWatchTarget('src/assets/css/**/*.scss');
    eleventyConfig.addWatchTarget('src/assets/img/brand/logo.svg');
    eleventyConfig.addWatchTarget('src/_includes/pwa/service-worker.js');
    eleventyConfig.watchIgnores.add('src/assets/img/brand/icon-*.png');
    eleventyConfig.watchIgnores.add('src/assets/css/**/*.css');
    eleventyConfig.watchIgnores.add('src/assets/css/**/*.css.map');
    // pwdgen
    eleventyConfig.addWatchTarget('src/tools/pwdgen/css/**/*.scss');
    eleventyConfig.watchIgnores.add('src/tools/pwdgen/css/**/*.css');
    eleventyConfig.watchIgnores.add('src/tools/pwdgen/css/**/*.css.map');
    // sri-hasher
    eleventyConfig.addWatchTarget('src/tools/sri-hasher/css/**/*.scss');
    eleventyConfig.watchIgnores.add('src/tools/sri-hasher/css/**/*.css');
    eleventyConfig.watchIgnores.add('src/tools/sri-hasher/css/**/*.css.map');
    // json-editor
    eleventyConfig.addWatchTarget('src/tools/json-editor/js/**/*.js');
    eleventyConfig.addWatchTarget('src/tools/json-editor/css/**/*.scss');
    eleventyConfig.watchIgnores.add('src/tools/json-editor/css/**/*.css');
    eleventyConfig.watchIgnores.add('src/tools/json-editor/css/**/*.css.map');
    // regex-tester
    eleventyConfig.addWatchTarget('src/tools/regex-tester/js/**/*.js');
    eleventyConfig.addWatchTarget('src/tools/regex-tester/css/**/*.scss');
    eleventyConfig.watchIgnores.add('src/tools/regex-tester/css/**/*.css');
    eleventyConfig.watchIgnores.add('src/tools/regex-tester/css/**/*.css.map');
    // url-inspector
    eleventyConfig.addWatchTarget('src/tools/url-inspector/js/**/*.js');
    eleventyConfig.addWatchTarget('src/tools/url-inspector/css/**/*.scss');
    eleventyConfig.watchIgnores.add('src/tools/url-inspector/css/**/*.css');
    eleventyConfig.watchIgnores.add('src/tools/url-inspector/css/**/*.css.map');
    // keygen
    eleventyConfig.addWatchTarget('src/tools/keygen/js/**/*.js');
    eleventyConfig.addWatchTarget('src/tools/keygen/css/**/*.scss');
    eleventyConfig.watchIgnores.add('src/tools/keygen/css/**/*.css');
    eleventyConfig.watchIgnores.add('src/tools/keygen/css/**/*.css.map');
    // keygen esbuild
    eleventyConfig.watchIgnores.add('src/tools/keygen/js/app.js');
    eleventyConfig.watchIgnores.add('src/tools/keygen/js/app.js.LEGAL.txt');
    eleventyConfig.watchIgnores.add('src/tools/keygen/js/THIRD-PARTY-LICENSES.txt');

    eleventyConfig.on('eleventy.before', async () => {
        buildPwaIcons();

        // keygenのビルド
        await buildKeygen();

        const entries = [
            'src/assets/css/style',
            'src/assets/css/home',
            'src/assets/css/error',
            'src/tools/pwdgen/css/pwdgen',
            'src/tools/keygen/css/keygen',
            'src/tools/sri-hasher/css/sri-hasher',
            'src/tools/json-editor/css/json-editor',
            'src/tools/url-inspector/css/url-inspector',
            'src/tools/regex-tester/css/regex-tester'
        ];

        for(const entry of entries){
            const directory = path.dirname(entry);
            const name = path.basename(entry);
            const result = compile(`${directory}/${name}.scss`, { style: 'expanded', sourceMap: true });
            const sourceMap = {
                ...result.sourceMap,
                file: `${name}.css`,
                sources: result.sourceMap.sources.map((source) =>
                    path.relative(directory, fileURLToPath(source)).split(path.sep).join('/')
                )
            };
            const outputs = {
                [`${directory}/${name}.css`]: `${result.css}\n\n/*# sourceMappingURL=${name}.css.map */\n`,
                [`${directory}/${name}.css.map`]: `${JSON.stringify(sourceMap)}\n`
            };
            for(const [filename, content] of Object.entries(outputs)){
                // Avoid unnecessary writes, including those observed by editor file watchers.
                if(!existsSync(filename) || readFileSync(filename, 'utf8') !== content){
                    writeFileSync(filename, content);
                }
            }
        }
    });

    eleventyConfig.addFilter('isToolAvailable', isToolAvailable);
    eleventyConfig.addFilter('groupAvailableTools', groupAvailableTools);
    eleventyConfig.addFilter('absoluteUrl', (url, origin) => {
        const filteredUrl = eleventyConfig.getFilter('url')(url);

        return new URL(filteredUrl, origin).href;
    });

    const passthrough = {
        // assets
        'src/assets/js/utils/*.js': 'assets/js/utils',
        'src/assets/js/components/*.js': 'assets/js/components',
        'src/assets/css/*.css': 'assets/css',
        'src/assets/img': 'assets/img',
        // json-editor
        'src/tools/json-editor/js/*.js': 'json-editor/js',
        'src/tools/json-editor/css/*.css': 'json-editor/css',
        // regex-tester (native module Workers and engine modules use relative imports)
        'src/tools/regex-tester/js/*.js': 'regex-tester/js',
        'src/tools/regex-tester/js/engines/*.js': 'regex-tester/js/engines',
        'src/tools/regex-tester/js/workers/*.js': 'regex-tester/js/workers',
        'src/tools/regex-tester/css/*.css': 'regex-tester/css',
        // url-inspector
        'src/tools/url-inspector/js/*.js': 'url-inspector/js',
        'src/tools/url-inspector/css/*.css': 'url-inspector/css',
        // pwdgen
        'src/tools/pwdgen/js/*.js': 'pwdgen/js',
        'src/tools/pwdgen/css/*.css': 'pwdgen/css',
        // keygen
        'src/tools/keygen/js/app.js': 'keygen/js/app.js',
        'src/tools/keygen/css/*.css': 'keygen/css',
        'src/tools/keygen/js/app.js.LEGAL.txt': 'keygen/js/app.js.LEGAL.txt',
        'src/tools/keygen/js/THIRD-PARTY-LICENSES.txt': 'keygen/js/THIRD-PARTY-LICENSES.txt',
        // sri-hasher
        'src/tools/sri-hasher/js/*.js': 'sri-hasher/js',
        'src/tools/sri-hasher/css/*.css': 'sri-hasher/css',
    };

    eleventyConfig.addPassthroughCopy(passthrough);

    eleventyConfig.on('eleventy.after', ({ directories, results, runMode, outputMode }) => {
        if(outputMode === 'fs'){
            buildServiceWorker({
                outputDirectory: directories.output,
                results,
                passthrough,
                pathPrefix: eleventyConfig.pathPrefix,
                runMode
            });
        }
    });

    // リポジトリ利用ガイドはサイトページでは無いので無視
    eleventyConfig.ignores.add('src/tools/**/README.md');

    eleventyConfig.ignores.add('src/tools/keygen/nodejs/**');
    eleventyConfig.ignores.add('src/tools/keygen/scripts/**');
    eleventyConfig.ignores.add('src/tools/keygen/node_modules/**');

    return {
        dir: {
            input: 'src',
            includes: '_includes',
            data: '_data',
            output: 'dist'
        },
        templateFormats: ['njk', 'html', 'md'],
        htmlTemplateEngine: 'njk',
        markdownTemplateEngine: 'njk',
        pathPrefix: '/'
    };
}
