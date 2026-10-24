/**
 * tools.jsonのURLを持つツールから、ビルド・監視・配信用の設定をまとめて生成する。
 * ネイティブES Modulesを標準とし、keygenだけはバンドルとライセンスを配信する。
 *
 * @param {Array<{slug: string, url: string|null}>} tools
 */
export function createAssetPlan(tools){
    // 単体CSS
    const stylesheets = [
        'src/assets/css/style',
        'src/assets/css/home',
        'src/assets/css/error'
    ];
    // Watch対象
    const watchTargets = [
        'package.json',
        'src/assets/js/**/*.js',
        'src/assets/css/**/*.scss',
        'src/assets/fonts/*.ttf',
        'src/assets/fonts/OFL-*.txt',
        'src/assets/img/brand/logo.svg',
        'src/_includes/social-card.svg',
        'src/_includes/pwa/service-worker.js',
        'src/_data/site.json'
    ];
    // Watch無視
    const watchIgnores = [
        'src/assets/fonts/THIRD-PARTY-LICENSES.txt',
        'src/assets/fonts/*.woff2',
        'src/assets/img/brand/icon-*.png',
        'src/assets/img/brand/social-card.png',
        'src/assets/css/**/*.css',
        'src/assets/css/**/*.css.map'
    ];
    // パススルー
    const passthrough = {
        'src/assets/js/utils/*.js': 'assets/js/utils',
        'src/assets/js/components/*.js': 'assets/js/components',
        'src/assets/css/*.css': 'assets/css',
        'src/assets/fonts/*.woff2': 'assets/fonts',
        'src/assets/fonts/THIRD-PARTY-LICENSES.txt': 'assets/fonts/THIRD-PARTY-LICENSES.txt',
        'src/assets/img': 'assets/img'
    };

    for(const { slug, url } of tools){
        if(!url){
            continue;
        }

        const source = `src/tools/${slug}`;

        stylesheets.push(`${source}/css/${slug}`);
        watchTargets.push(`${source}/js/**/*.js`, `${source}/css/**/*.scss`);
        watchIgnores.push(`${source}/css/**/*.css`, `${source}/css/**/*.css.map`);
        passthrough[`${source}/css/*.css`] = `${slug}/css`;

        // keygenは色々追加がある
        if(slug === 'keygen'){
            for(const file of ['app.js', 'app.js.LEGAL.txt', 'THIRD-PARTY-LICENSES.txt']){
                passthrough[`${source}/js/${file}`] = `${slug}/js/${file}`;
                watchIgnores.push(`${source}/js/${file}`);
            }
        } else{
            // 各ディレクトリを個別に登録しWorkerの相対import構造を保持する
            const directories = (slug === 'regex-tester') ? ['js', 'js/engines', 'js/workers'] : ['js'];

            for(const directory of directories){
                passthrough[`${source}/${directory}/*.js`] = `${slug}/${directory}`;
            }
        }
    }

    return { stylesheets, watchTargets, watchIgnores, passthrough };
}
