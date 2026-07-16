import type { ReactNode } from "react";

/**
 * 纯 CSS 驱动的双语内容切换组件,兼容 SSG 渲染。
 * 依赖 html[data-locale="en"] 的 CSS 选择器进行切换。
 */
export function Bilingual({
  zh,
  en,
  asBlock = false,
}: {
  zh: ReactNode;
  en?: ReactNode;
  asBlock?: boolean;
}) {
  if (!en) return <>{zh}</>;

  return (
    <>
      <span
        className={`[[data-locale='en']_&]:hidden ${asBlock ? "block" : ""}`}
      >
        {zh}
      </span>
      <span className={`hidden ${asBlock ? "[[data-locale='en']_&]:!block" : "[[data-locale='en']_&]:!inline"}`}>
        {en}
      </span>
    </>
  );
}
