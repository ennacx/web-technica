import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Eleventy from '@11ty/eleventy';

test('Eleventy resolves registry-based titles before rendering tool pages and status metadata', async () => {
    const tools = JSON.parse(readFileSync('src/_data/tools.json', 'utf8'));
    const site = new Eleventy('src', 'dist', { quietMode: true, pathPrefix: '/web-technica/' });
    // Render through the real data cascade and layouts, without writing HTML.
    const pages = await site.toJSON();
    for(const tool of tools.filter((tool) => tool.url)){
        const page = pages.find((page) => page.inputPath.replaceAll('\\', '/').endsWith(`/${tool.slug}/index.njk`));
        assert.ok(page, tool.slug);
        assert.ok(page.content.includes(`<h1>${tool.name}</h1>`), tool.slug + ' heading');
        assert.ok(page.content.includes(`<title>${tool.name} | Web-Technica</title>`), tool.slug + ' document title');
        assert.ok(page.content.includes(`<span aria-current="page">${tool.name}</span>`), tool.slug + ' breadcrumb');
        assert.equal(page.content.includes('<meta name="robots" content="noindex">'), tool.status !== 'published', tool.slug + ' indexing');
        if(tool.status === 'develop'){
            assert.match(page.content, /data-tool-status="develop">\s*In development/);
        }
        if(tool.slug === 'json-editor'){
            const editor = page.content.indexOf('class="json-editor-body"');
            const notice = page.content.indexOf('id="json-action-notice"');
            const footer = page.content.indexOf('class="json-status-bar"');
            assert.ok(editor < notice && notice < footer, 'JSON notification is between the editor and validation footer');
            assert.match(page.content, /id="json-action-dismiss"[^>]*aria-label="Dismiss notification"/);
        }
        if(tool.slug === 'regex-tester'){
            const status = page.content.indexOf('id="regex-status"');
            const heading = page.content.indexOf('class="regex-section-heading regex-pattern-heading"');
            const patternField = page.content.indexOf('class="regex-pattern-field"');
            assert.ok(heading < status && status < patternField, 'execution status is in the input heading');
            assert.equal(page.content.match(/id="regex-status"/g).length, 1, 'one live status region');
            assert.match(page.content.slice(status, patternField), /tabindex="0"/);
        }
    }
});
