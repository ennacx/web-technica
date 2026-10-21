import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';

/**
 * SCSSからCSSとローカル用source mapを生成する。内容が同じ場合は書き込まない。
 *
 * @param entries
 */
export function buildStylesheets(entries){
    for(const entry of entries){
        const directory = path.dirname(entry);
        const name = path.basename(entry);
        const result = compile(`${directory}/${name}.scss`, { style: 'expanded', sourceMap: true });
        const sourceMap = {
            ...result.sourceMap,
            file: `${name}.css`,
            sources: result.sourceMap.sources.map((source) =>
                path.relative(directory, fileURLToPath(source)).split(path.sep).join('/')
            )
        };
        const outputs = {
            [`${entry}.css`]: `${result.css}\n\n/*# sourceMappingURL=${name}.css.map */\n`,
            [`${entry}.css.map`]: `${JSON.stringify(sourceMap)}\n`
        };

        for(const [filename, content] of Object.entries(outputs)){
            if(!existsSync(filename) || readFileSync(filename, 'utf8') !== content){
                writeFileSync(filename, content);
            }
        }
    }
}
