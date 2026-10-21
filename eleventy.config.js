import { readFileSync } from 'node:fs';
import { buildKeygen } from './src/tools/keygen/scripts/build.mjs';
import { buildPwaIcons, buildServiceWorker } from './scripts/build-pwa.mjs';
import { buildStylesheets } from './scripts/build-css.mjs';
import { createAssetPlan } from './scripts/site-assets.mjs';
import { isToolAvailable, groupAvailableTools } from './scripts/tool-status.mjs';

export default function(eleventyConfig){
    const assets = createAssetPlan(JSON.parse(readFileSync('src/_data/tools.json', 'utf8')));

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
    for(const target of assets.watchTargets){
        eleventyConfig.addWatchTarget(target);
    }
    for(const target of assets.watchIgnores){
        eleventyConfig.watchIgnores.add(target);
    }

    eleventyConfig.on('eleventy.before', async () => {
        buildPwaIcons();

        // keygenのビルド
        await buildKeygen();

        // SCSSのビルド
        buildStylesheets(assets.stylesheets);
    });

    eleventyConfig.addFilter('isToolAvailable', isToolAvailable);
    eleventyConfig.addFilter('groupAvailableTools', groupAvailableTools);
    eleventyConfig.addFilter('absoluteUrl', (url, origin) => {
        const filteredUrl = eleventyConfig.getFilter('url')(url);

        return new URL(filteredUrl, origin).href;
    });

    const { passthrough } = assets;

    eleventyConfig.addPassthroughCopy(passthrough);

    eleventyConfig.on('eleventy.after', ({ directories, results, runMode, outputMode }) => {
        if(outputMode === 'fs'){
            // ServiceWorkerのビルド
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
