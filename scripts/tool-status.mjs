/**
 * ツールがリンク可能かを判定する
 *
 * @param {object} tool
 * @return {boolean}
 */
export function isToolAvailable(tool){
    return Boolean((tool.status === 'published' || tool.status === 'develop') && tool.url);
}

/**
 * 各ツールをカテゴリー毎に分類する
 *
 * @param {object[]} tools
 * @return {{name: {string}, tools: {object[]}}[]}
 */
export function groupAvailableTools(tools){
    const categories = new Map();

    for(const tool of tools){
        if(!isToolAvailable(tool) || !tool.category){
            continue;
        }

        if(!categories.has(tool.category)){
            categories.set(tool.category, []);
        }
        categories.get(tool.category).push(tool);
    }

    return Array.from(categories, ([name, tools]) => ({ name, tools }));
}
