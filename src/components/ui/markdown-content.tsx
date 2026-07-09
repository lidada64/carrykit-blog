import ReactMarkdown, { type Components } from "react-markdown";
import { rehypePlugins, remarkPlugins } from "@/lib/markdown";
import "highlight.js/styles/github.css";

/**
 * Markdown 正文渲染(US-B3):blog 与 work 详情共用。
 * 元素样式映射到 5 档字号阶梯与色板 token(DESIGN_SPEC §2-3),不引入 typography 插件。
 */

const components: Components = {
  // 正文内的 # 一律降级为 h2 元素:页面 h1 已被文章标题占用
  h1: ({ children }) => (
    <h2 className="mt-6 text-heading font-display">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 text-heading font-display">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-subheading font-display">{children}</h3>
  ),
  p: ({ children }) => <p className="text-body">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="underline underline-offset-2 hover:text-accent"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-4 text-muted">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto border border-border text-caption [&_code]:font-mono">
      {children}
    </pre>
  ),
  code: ({ className, children }) =>
    className ? (
      // 代码块(rehype-highlight 已注入 hljs 类与高亮 span)
      <code className={className}>{children}</code>
    ) : (
      // 行内代码
      <code className="bg-border/40 px-1 font-mono">{children}</code>
    ),
  img: ({ src, alt }) => (
    // 正文图片尺寸未知,V1 先用原生 img;next/image 全覆盖在 M3-10 统一处理
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      className="w-full"
    />
  ),
  hr: () => <hr className="border-border" />,
  table: ({ children }) => (
    <table className="w-full border-collapse text-body">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border-b border-border py-2 text-left text-caption font-mono uppercase text-muted">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border py-2">{children}</td>
  ),
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="flex max-w-[65ch] flex-col gap-5 text-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
