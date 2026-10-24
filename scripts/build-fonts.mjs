import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import wawoff2 from 'wawoff2';

export const fontSources = [
    'src/assets/fonts/SpaceGrotesk-VariableFont_wght.ttf',
    'src/assets/fonts/Inter-VariableFont_opsz,wght.ttf',
    'src/assets/fonts/JetBrainsMono-VariableFont_wght.ttf'
];

const fontLicenses = [
    ['Space Grotesk', 'OFL-SpaceGrotesk.txt'],
    ['Inter', 'OFL-Inter.txt'],
    ['JetBrains Mono', 'OFL-JetBrainsMono.txt']
];

function writeIfChanged(filename, data){
    const buffer = Buffer.from(data);
    if(!existsSync(filename) || !readFileSync(filename).equals(buffer)){
        writeFileSync(filename, buffer);
    }
}

/**
 * Generate browser fonts (woff2) from the version-controlled TTF sources.
 *
 * @param {string} [directory='src/assets/fonts']
 */
export async function buildWebFonts(directory = 'src/assets/fonts'){
    mkdirSync(directory, { recursive: true });

    for(const source of fontSources){
        const basename = path.basename(source, '.ttf');
        const filename = path.join(directory, `${basename}.woff2`);
        const data = Buffer.from(await wawoff2.compress(readFileSync(source)));

        writeIfChanged(filename, data);
    }

    const licenses = fontLicenses.map(([family, filename]) =>
        `===== ${family} (${filename}) =====\n\n${readFileSync(path.join('src/assets/fonts', filename), 'utf8')}`
    ).join('\n\n');
    writeIfChanged(path.join(directory, 'THIRD-PARTY-LICENSES.txt'),
        `Web-Technica — Third-party font licenses\n\n${licenses}\n`);
}
