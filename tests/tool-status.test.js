import test from 'node:test';
import assert from 'node:assert/strict';
import nunjucks from 'nunjucks';
import { isToolAvailable, groupAvailableTools } from '../scripts/tool-status.mjs';
import toolData from '../src/tools/tools.11tydata.js';

const sample = { name: 'Sample Tool', slug: 'sample', url: '/sample/', category: 'Inspect', icon: 'link', description: 'Sample description.', tags: [] };
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('src/_includes'), { autoescape: true });
env.addFilter('url', (url) => '/web-technica' + url);
env.addFilter('isToolAvailable', isToolAvailable);
env.addFilter('groupAvailableTools', groupAvailableTools);

test('available tool groups include published and develop links, preserving category and tool order', () => {
    const tools = [
        { ...sample, status: 'published' },
        { ...sample, slug: 'develop', status: 'develop' },
        { ...sample, status: 'planned' },
        { ...sample, status: 'unknown' },
        { ...sample, status: 'develop', url: undefined },
        { ...sample, status: 'published', category: 'Generate' }
    ];
    assert.deepEqual(tools.map(isToolAvailable), [true, true, false, false, false, true]);
    assert.deepEqual(groupAvailableTools(tools), [
        { name: 'Inspect', tools: [tools[0], tools[1]] },
        { name: 'Generate', tools: [tools[5]] }
    ]);
});

test('status drives badges and links consistently in cards, tool headings and header navigation', () => {
    for(const status of ['published', 'develop', 'planned', 'unknown']){
        const tool = { ...sample, status };
        const context = { tool, tools: [tool], title: tool.name, page: { url: tool.url }, site: {}, offlineModes: {} };
        const card = env.renderString('{% from "components/tool-card.njk" import toolCard %}{{ toolCard(tool, offlineModes) }}', context);
        const heading = env.render('layouts/tool.njk', context);
        const header = env.render('components/header.njk', context);
        const available = status === 'published' || status === 'develop';
        assert.equal(card.includes('href="/web-technica/sample/"'), available, status);
        assert.equal(header.includes('href="/web-technica/sample/"'), available, status);
        assert.equal(toolData.eleventyComputed.noindex(context), status !== 'published');
        if(status === 'published'){
            for(const html of [card, heading, header]){ assert.doesNotMatch(html, /data-tool-status=/); }
        } else{
            const label = status === 'develop' ? 'In development' : status === 'planned' ? 'Planned' : 'Coming soon';
            for(const html of [card, heading]){
                assert.ok(html.includes(`data-tool-status="${status}"`));
                assert.ok(html.includes(label));
            }
            if(available){ assert.match(header, /data-tool-status="develop">\s*In development/); }
            else{ assert.doesNotMatch(header, /site-nav-category/); }
        }
    }
});

test('a develop tool without a URL keeps its badge but is not linked or listed in the header', () => {
    const tool = { ...sample, status: 'develop', url: undefined };
    const html = env.renderString('{% from "components/tool-card.njk" import toolCard %}{{ toolCard(tool, {}) }}', { tool });
    assert.match(html, /In development/);
    assert.doesNotMatch(html, /<a /);
    assert.deepEqual(groupAvailableTools([tool]), []);
});
