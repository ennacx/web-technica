import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "sass";
import { buildKeygen } from "./src/tools/keygen/scripts/build.mjs";

export default function (eleventyConfig) {
    eleventyConfig.addWatchTarget("src/assets/js/**/*.js");
    eleventyConfig.addWatchTarget("src/assets/css/**/*.scss");
    eleventyConfig.watchIgnores.add("src/assets/css/**/*.css");
    eleventyConfig.watchIgnores.add("src/assets/css/**/*.css.map");
    eleventyConfig.addWatchTarget("src/tools/pwdgen/css/**/*.scss");
    eleventyConfig.watchIgnores.add("src/tools/pwdgen/css/**/*.css");
    eleventyConfig.watchIgnores.add("src/tools/pwdgen/css/**/*.css.map");
    eleventyConfig.addWatchTarget("src/tools/sri-hasher/css/**/*.scss");
    eleventyConfig.watchIgnores.add("src/tools/sri-hasher/css/**/*.css");
    eleventyConfig.watchIgnores.add("src/tools/sri-hasher/css/**/*.css.map");
    eleventyConfig.addWatchTarget("src/tools/keygen/css/**/*.scss");
    eleventyConfig.addWatchTarget("src/tools/keygen/js/**/*.js");
    eleventyConfig.watchIgnores.add("src/tools/keygen/css/**/*.css");
    eleventyConfig.watchIgnores.add("src/tools/keygen/css/**/*.css.map");
    eleventyConfig.watchIgnores.add("src/tools/keygen/js/app.js");
    eleventyConfig.watchIgnores.add("src/tools/keygen/js/app.js.LEGAL.txt");
    eleventyConfig.watchIgnores.add("src/tools/keygen/js/THIRD-PARTY-LICENSES.txt");
    eleventyConfig.on("eleventy.before", async () => {
        await buildKeygen();
        for (const entry of ["src/assets/css/style", "src/assets/css/home", "src/assets/css/error", "src/tools/pwdgen/css/pwdgen", "src/tools/sri-hasher/css/sri-hasher", "src/tools/keygen/css/keygen"]) {
            const directory = path.dirname(entry);
            const name = path.basename(entry);
            const result = compile(`${directory}/${name}.scss`, { style: "expanded", sourceMap: true });
            const sourceMap = {
                ...result.sourceMap,
                file: `${name}.css`,
                sources: result.sourceMap.sources.map(source =>
                    path.relative(directory, fileURLToPath(source)).split(path.sep).join("/")
                )
            };
            const outputs = {
                [`${directory}/${name}.css`]: `${result.css}\n\n/*# sourceMappingURL=${name}.css.map */\n`,
                [`${directory}/${name}.css.map`]: `${JSON.stringify(sourceMap)}\n`
            };
            for (const [filename, content] of Object.entries(outputs)) {
                // Avoid unnecessary writes, including those observed by editor file watchers.
                if (!existsSync(filename) || readFileSync(filename, "utf8") !== content) {
                    writeFileSync(filename, content);
                }
            }
        }
    });
    eleventyConfig.addPassthroughCopy({
        "src/assets/js/utils/*.js": "assets/js/utils",
        "src/assets/js/components/*.js": "assets/js/components",
        "src/assets/css/*.css": "assets/css",
        "src/assets/css/*.css.map": "assets/css",
        "src/assets/img": "assets/img",
        "src/tools/pwdgen/css/*.css": "pwdgen/css",
        "src/tools/pwdgen/css/*.css.map": "pwdgen/css",
        "src/tools/pwdgen/js/*.js": "pwdgen/js",
        "src/tools/sri-hasher/css/*.css": "sri-hasher/css",
        "src/tools/sri-hasher/css/*.css.map": "sri-hasher/css",
        "src/tools/sri-hasher/js/*.js": "sri-hasher/js",
        "src/tools/keygen/css/*.css": "keygen/css",
        "src/tools/keygen/css/*.css.map": "keygen/css",
        "src/tools/keygen/js/app.js": "keygen/js/app.js",
        "src/tools/keygen/js/app.js.LEGAL.txt": "keygen/js/app.js.LEGAL.txt",
        "src/tools/keygen/js/THIRD-PARTY-LICENSES.txt": "keygen/js/THIRD-PARTY-LICENSES.txt"
    });
    eleventyConfig.ignores.add("src/tools/keygen/nodejs/**");
    eleventyConfig.ignores.add("src/tools/keygen/scripts/**");
    eleventyConfig.ignores.add("src/tools/keygen/node_modules/**");

    return {
        dir: {
            input: "src",
            includes: "_includes",
            data: "_data",
            output: "dist"
        },
        templateFormats: ["njk", "html", "md"],
        htmlTemplateEngine: "njk",
        markdownTemplateEngine: "njk",
        pathPrefix: "/"
    };
}
