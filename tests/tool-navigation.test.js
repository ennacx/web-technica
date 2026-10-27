import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import nunjucks from 'nunjucks';
import { groupAvailableTools } from '../scripts/tool-status.mjs';

test('mobile navigation groups available tools and preserves prefixed links and current tool', () => {
    const tools = JSON.parse(readFileSync('src/_data/tools.json', 'utf8'));
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('src/_includes'), { autoescape: true });
    env.addFilter('url', (url) => '/web-technica' + url);
    env.addFilter('groupAvailableTools', groupAvailableTools);
    const html = env.render('components/header.njk', { tools, tool: tools[1], page: { url: tools[1].url }, site: {} });
    const mobile = html.split('data-mobile-tool-navigation')[1].split('class="site-nav-category"')[0];
    assert.match(mobile, />Tools\s+<svg/);
    assert.match(html, /href="\/web-technica\/#tools"[^>]*>All Tools/);
    assert.doesNotMatch(mobile, /href="\/web-technica\/#tools"/);
    for(const { name, tools: members } of groupAvailableTools(tools)){
        assert.ok(mobile.includes(String(env.getFilter('escape')(name))), name);
        for(const tool of members){
            assert.ok(mobile.includes(`href="/web-technica${tool.url}"`), tool.name);
        }
    }
    assert.match(mobile, /href="\/web-technica\/url-inspector\/" aria-current="page"/);
    const hasDevelopTool = groupAvailableTools(tools).some(({ tools: members }) => members.some((tool) => tool.status === 'develop'));
    assert.equal(mobile.includes('data-tool-status="develop"'), hasDevelopTool);
});

test('mobile disclosures close on Escape, leaving navigation, link selection and layout changes', () => {
    const element = () => ({
        open: true, handlers: {},
        addEventListener(name, handler){ this.handlers[name] = handler; },
        contains(target){ return target === this || this.children?.includes(target); },
        focus(){ this.focused = true; }
    });
    const summary = element();
    const categorySummary = element();
    const category = element();
    const mobile = element();
    const navigation = element();
    const document = element();
    const media = element();
    mobile.children = [category, categorySummary, summary];
    navigation.children = [mobile, category, categorySummary, summary];
    runInNewContext(readFileSync('src/assets/js/components/tool-navigation.js', 'utf8').replace(/^import .*;\r?\n/, ''), {
        document, window: { matchMedia: () => media },
        querySelAll(selector){
            return selector === '[data-tool-navigation]' ? [navigation] : selector === 'details' ? [category] : [];
        },
        querySel(selector, root){
            return selector === '[data-mobile-tool-navigation]' ? mobile : root === category ? categorySummary : summary;
        }
    });
    const escape = (details) => mobile.handlers.keydown({ key: 'Escape', target: { closest: () => details }, preventDefault(){} });
    escape(category);
    assert.equal(category.open, false);
    assert.equal(mobile.open, true);
    assert.equal(categorySummary.focused, true);
    escape(mobile);
    assert.equal(mobile.open, false);
    assert.equal(summary.focused, true);
    for(const close of [
        () => mobile.handlers.focusout({ relatedTarget: null }),
        () => mobile.handlers.click({ target: { closest: () => ({}) } }),
        () => document.handlers.pointerdown({ target: {} }),
        () => media.handlers.change()
    ]){
        mobile.open = category.open = true;
        close();
        assert.equal(mobile.open, false);
        assert.equal(category.open, false);
    }
    mobile.open = true;
    mobile.handlers.focusout({ relatedTarget: categorySummary });
    document.handlers.pointerdown({ target: categorySummary });
    assert.equal(mobile.open, true, 'moving within the menu leaves it open');
});
