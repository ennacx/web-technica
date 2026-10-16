import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

export async function buildKeygen(){
    const directory = fileURLToPath(new URL('../', import.meta.url));
    const result = await build({
        absWorkingDir: directory,
        entryPoints: [
            'js/index.js'
        ],
        bundle: true,
        minify: true,
        format: 'esm',
        target: 'es2020',
        external: [
            '#utils/*'
        ],
        legalComments: 'linked',
        metafile: true,
        outfile: 'js/app.js'
    });

    // 実際にバンドルに含まれたnpmパッケージのライセンス原文を保持
    const packages = new Map();
    for(const input of Object.keys(result.metafile.inputs)){
        if(!input.replaceAll('\\', '/').includes('node_modules/')){
            continue;
        }

        let packageDirectory = dirname(resolve(directory, input));

        while(!existsSync(join(packageDirectory, 'package.json'))){
            const parent = dirname(packageDirectory);
            if(parent === packageDirectory){
                throw new Error(`Package metadata not found for ${input}`);
            }

            packageDirectory = parent;
        }

        const info = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
        const licenses = readdirSync(packageDirectory).filter((name) => /^(licen[sc]e|copying)(\.|$)/i.test(name));

        if(!licenses.length){
            throw new Error(`License not found for ${info.name}`);
        }

        packages.set(info.name, `${info.name}@${info.version} (${info.license})\n\n${licenses.map((name) => readFileSync(join(packageDirectory, name), 'utf8')).join('\n')}`);
    }

    const notices = [...packages.entries()]
        .sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text)
        .join('\n\n--------------------\n\n');
    const destination = join(directory, 'js/THIRD-PARTY-LICENSES.txt');

    if(!existsSync(destination) || readFileSync(destination, 'utf8') !== notices){
        writeFileSync(destination, notices);
    }

    return result;
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url){
    await buildKeygen();
}
