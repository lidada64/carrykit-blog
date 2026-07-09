import type { Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

/**
 * Markdown 渲染管线配置(ARCHITECTURE §1 锁定:react-markdown + remark-gfm + rehype-highlight)。
 * 前台详情页与后台编辑预览(M2-4)共用,保证预览效果与前台一致。
 */
export const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm];
export const rehypePlugins: NonNullable<Options["rehypePlugins"]> = [
  rehypeHighlight,
];
