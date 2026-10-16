import { createHash } from 'node:crypto';
import { globSync, mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

function writeChanged(filename, content){
    const bytes = Buffer.from(content);

    if(!existsSync(filename) || !readFileSync(filename).equals(bytes)){
        mkdirSync(path.dirname(filename), { recursive: true });
        writeFileSync(filename, bytes);
    }
}

/**
 * ロゴのSVGからアイコンPNGを生成する。
 */
export function buildPwaIcons(){
    const logo = readFileSync('src/assets/img/brand/logo.svg', 'utf8');

    // Fit the entire mark inside the central maskable safe circle.
    const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <rect width="1024" height="1024" fill="#151a20"/>
        <svg x="205" y="245" width="614" height="535" viewBox="${logo.match(/viewBox="([^"]+)"/)[1]}">${logo.replace(/<\/?svg\b[^>]*>/g, '')}</svg>
    </svg>`;

    for(const size of [180, 192, 512]){
        const png = new Resvg(square, { fitTo: { mode: 'width', value: size } }).render().asPng();

        writeChanged(`src/assets/img/brand/icon-${size}.png`, png);
    }
}

/**
 * サービスワーカーを生成する。
 *
 * @param param0
 * @param param0.outputDirectory
 * @param param0.results
 * @param param0.passthrough
 * @param param0.pathPrefix
 * @param param0.runMode
 */
export function buildServiceWorker({ outputDirectory, results, passthrough, pathPrefix, runMode }){
    /*
     * このビルドのページおよびパススルーソースからキャッシュリストを生成すること。
     * 削除されたページやアセットが残っている可能性がある出力ディレクトリをキャッシュリストの生成元としてはならない。
     */

    const prefix = `/${pathPrefix.split('/').filter(Boolean).join('/')}/`;
    const scope = (prefix === '//') ? '/' : prefix;
    const cachePrefix = `web-technica:${encodeURIComponent(scope)}:`;
    const output = path.resolve(outputDirectory);

    const files = new Set(results.map((result) => path.resolve(result.outputPath)));

    for(const [source, destination] of Object.entries(passthrough)){
        for(const entry of globSync(source)){
            if(statSync(entry).isDirectory()){
                for(const file of globSync(`${entry.replaceAll('\\', '/')}/**/*`)){
                    if(statSync(file).isFile()){
                        files.add(path.resolve(output, destination, path.relative(entry, file)));
                    }
                }
            } else{
                /*
                 * ファイルを個別に指定するマッピングにはすでに宛先のファイル名が含まれている。
                 * ディレクトリを指定するマッピング (globマッピング) の場合のみ、一致した各ファイルがディレクトリに追加される。
                 */
                const outputPath = (source.includes('*')) ? path.join(destination, path.basename(entry)) : destination;
                files.add(path.resolve(output, outputPath));
            }
        }
    }

    const template = readFileSync('src/_includes/pwa/service-worker.js', 'utf8');
    const hash = createHash('sha256').update(scope).update(template);
    const urls = [];

    for(const file of [...files].sort()){
        const relative = path.relative(output, file).replaceAll('\\', '/');

        if(relative.startsWith('../') || path.isAbsolute(relative)){
            throw new Error(`PWA asset is outside the output directory: ${file}`);
        }

        // ソースマップはオンラインでは有用だがオフラインでは不要
        if(relative.endsWith('.map')){
            continue;
        }

        hash.update(relative).update(readFileSync(file));
        urls.push(scope + relative.replace(/(^|\/)index\.html$/, '$1'));
    }

    const code = (runMode === 'build') ?
        template
            .replace('__CACHE_PREFIX__', JSON.stringify(cachePrefix))
            .replace('__CACHE_NAME__', JSON.stringify(cachePrefix + hash.digest('hex').slice(0, 20)))
            .replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 4)) :
        // 本番環境から開発環境に切り替える際には古いローカルの production worker を置き換える
        `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter((name) => name.startsWith(${JSON.stringify(cachePrefix)})).map((name) => caches.delete(name)));
    await self.clients.claim();
    await self.registration.unregister();
})()));
`;

    writeChanged(path.join(output, 'sw.js'), code);
}
