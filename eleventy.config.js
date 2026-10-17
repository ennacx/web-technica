import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { buildKeygen } from './src/tools/keygen/scripts/build.mjs';
import { buildPwaIcons, buildServiceWorker } from './scripts/build-pwa.mjs';

export default function(eleventyConfig){
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
            'src/tools/json-editor/css/json-editor'
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

    eleventyConfig.addFilter('groupPublishedTools', (tools) => {
        const categories = new Map();

        for(const tool of tools){
            if(tool.status !== 'published'){
                continue;
            }

            const category = tool.category;

            if(!category){
                continue;
            }

            if(!categories.has(category)){
                categories.set(category, []);
            }

            categories.get(category).push(tool);
        }

        return Array.from(categories, ([name, tools]) => ({ name, tools }));
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
