"use client";

import { useT } from "@/i18n";

/** 作品外链按钮(PRD US-W2):新标签页打开;无外链时由详情页不渲染本组件 */
export function ProjectLinkButton({ href }: { href: string }) {
  const t = useT();

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="border border-border px-4 py-2 text-caption font-mono uppercase hover:border-foreground"
    >
      {t("work.linkLabel")} ↗
    </a>
  );
}
