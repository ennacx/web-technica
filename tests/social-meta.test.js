import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import nunjucks from 'nunjucks';

const siteData = JSON.parse(readFileSync('src/_data/site.json', 'utf8'));
const metadata = (html) => Object.fromEntries([...html.matchAll(/<meta (?:name|property)="([^"]+)" content="([^"]*)">/g)]
    .map(([, key, value]) => [key, value]));

test('all pages have page-specific social metadata and absolute root/Pages URLs with a generated PNG', () => {
    for(const prefix of ['/', '/web-technica/']){
        // Match separate CLI builds; Eleventy caches template state within a process.
        const pages = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
            import Eleventy from '@11ty/eleventy';
            const site = new Eleventy('src', 'dist', { quietMode: true, pathPrefix: process.argv[1] });
            const pages = await site.toJSON();
            console.log(JSON.stringify(pages.filter(page => page.outputPath.endsWith('.html'))
                .map(({inputPath, outputPath, content}) => ({inputPath, outputPath, content}))));
        `, prefix], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }));
        for(const page of pages){
            const meta = metadata(page.content);
            const relative = path.relative('dist', page.outputPath).replaceAll('\\', '/').replace(/index\.html$/, '');
            assert.equal(meta['og:url'], new URL(prefix + relative, siteData.url).href, page.inputPath);
            assert.equal(meta['og:title'], page.content.match(/<title>([\s\S]*?)<\/title>/)[1]);
            assert.equal(meta['og:description'], meta.description);
            assert.equal(meta['og:site_name'], siteData.name);
            assert.equal(meta['og:type'], 'website');
            assert.equal(meta['og:image'], new URL(prefix + siteData.social.image.slice(1), siteData.url).href);
            assert.equal(meta['og:image:width'], String(siteData.social.imageWidth));
            assert.equal(meta['og:image:height'], String(siteData.social.imageHeight));
            assert.equal(meta['og:image:type'], 'image/png');
            assert.equal(meta['og:image:alt'], siteData.social.imageAlt);
            assert.equal(meta['twitter:card'], 'summary_large_image');
            for(const key of ['title', 'description', 'image', 'image:alt']){
                assert.equal(meta[`twitter:${key}`], meta[`og:${key}`]);
            }
            const canonical = page.content.match(/rel="canonical" href="([^"]+)"/);
            if(canonical) assert.equal(meta['og:url'], canonical[1]);
            if(meta.robots === 'noindex') assert.equal(canonical, null, 'social tags do not change indexing policy');
        }
        const image = readFileSync('src' + siteData.social.image);
        assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(image.readUInt32BE(16), siteData.social.imageWidth);
        assert.equal(image.readUInt32BE(20), siteData.social.imageHeight);
    }
});

test('social tags escape quotes and markup and fall back to the site title and description', () => {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('src/_includes'), { autoescape: false });
    env.addFilter('absoluteUrl', (url, origin) => new URL('/web-technica' + url, origin).href);
    const context = { site: siteData, page: { url: '/' } };
    const defaults = metadata(env.render('components/social-meta.njk', context));
    assert.equal(defaults['og:title'], siteData.name);
    assert.equal(defaults['og:description'], siteData.description);
    const html = env.render('components/social-meta.njk', { ...context,
        title: 'Tool "quoted" <unsafe> & more', description: 'Try "x" & <b>text</b>' });
    assert.ok(html.includes('Tool &quot;quoted&quot; &lt;unsafe&gt; &amp; more | Web-Technica'));
    assert.ok(html.includes('Try &quot;x&quot; &amp; &lt;b&gt;text&lt;/b&gt;'));
    assert.ok(!html.includes('<unsafe>') && !html.includes('<b>'));
});
