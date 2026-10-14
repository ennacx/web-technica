import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "sass";

export default function (eleventyConfig) {
    eleventyConfig.addWatchTarget("src/assets/css/**/*.scss");
    eleventyConfig.watchIgnores.add("src/assets/css/**/*.css");
    eleventyConfig.watchIgnores.add("src/assets/css/**/*.css.map");
    eleventyConfig.on("eleventy.before", () => {
        for (const name of ["style", "home"]) {
            const directory = "src/assets/css";
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
        "src/assets/css/*.css": "assets/css",
        "src/assets/css/*.css.map": "assets/css",
        "src/assets/img": "assets/img"
    });
    // Original tool sources are retained until their migration is complete.
    eleventyConfig.ignores.add("src/tools/**");

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
        pathPrefix: "/web-technica/"
    };
}
