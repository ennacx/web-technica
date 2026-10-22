import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

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

    const png = new Resvg(svg).render().asPng();
    const filename = 'src/assets/img/brand/social-card.png';

    if(!existsSync(filename) || !readFileSync(filename).equals(png)){
        writeFileSync(filename, png);
    }
}
