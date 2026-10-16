// ツール名・アイコンは一覧と同じtools.jsonを参照する。
export default {
    layout: 'layouts/tool.njk',
    eleventyComputed: {
        tool: (data) => {
            const tool = data.tools.find((entry) => (entry.slug === data.toolSlug));
            if(!tool){
                throw new Error(`Unknown toolSlug: ${data.toolSlug}`);
            }

            return tool;
        },
        title: '{{ tool.name }}'
    }
};
