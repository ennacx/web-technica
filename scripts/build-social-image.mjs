import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { fontSources } from './build-fonts.mjs';

const escapeXml = (text) => String(text).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
})[character]);

/**
 * 既存のロゴとローカルのSVGテンプレートを使用して、共有可能なPNGを生成する。
 *
 * @param {string} [pathPrefix='/'] - サイトアドレスに使用するパスプレフィックス
 */
export function buildSocialImage(pathPrefix = '/'){
    const site = JSON.parse(readFileSync('src/_data/site.json', 'utf8'));
    const logo = readFileSync('src/assets/img/brand/logo.svg', 'utf8');
    const address = new URL(pathPrefix, site.url);

    const svg = readFileSync('src/_includes/social-card.svg', 'utf8')
        .replace('__SITE_NAME__', escapeXml(site.name))
        .replace('__SITE_ADDRESS__', escapeXml(address.host + address.pathname.replace(/\/$/, '')))
        .replace('__LOGO_VIEWBOX__', escapeXml(logo.match(/viewBox="([^"]+)"/)[1]))
        .replace('__LOGO__', logo.replace(/<\/?svg\b[^>]*>/g, ''));

    const options = {
        font: {
            loadSystemFonts: false,
            fontFiles: fontSources
        }
    };

    // Resvg フォントファミリーを読み込めない場合は通知しないで除外
    for(const family of new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map((match) => match[1]))){
        const probe = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text y="50" font-size="24" font-family="${escapeXml(family)}">Web-Technica</text></svg>`, options);

        assert((probe.innerBBox()?.width > 0), `Cannot render social image font: ${family}`);
    }

    const png = new Resvg(svg, options).render().asPng();
    const filename = 'src/assets/img/brand/social-card.png';

    if(!existsSync(filename) || !readFileSync(filename).equals(png)){
        writeFileSync(filename, png);
    }
}
