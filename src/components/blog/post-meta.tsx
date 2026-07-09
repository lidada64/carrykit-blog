"use client";

import { useT } from "@/i18n";

/** Blog 详情 metadata 侧栏(DESIGN_SPEC §6 / US-B4):描述 + DATE + TAGS,label 走 i18n */
export function PostMeta({
  excerpt,
  date,
  tags,
}: {
  excerpt: string;
  date: string;
  tags: string[];
}) {
  const t = useT();

  return (
    <aside className="flex flex-col gap-8">
      {excerpt && <p className="max-w-[40ch] text-body text-muted">{excerpt}</p>}
      <div className="flex flex-col gap-1">
        <span className="text-caption font-mono uppercase text-muted">
          {t("blog.dateLabel")}
        </span>
        <span className="text-caption font-mono">{date}</span>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-mono uppercase text-muted">
            {t("blog.tagsLabel")}
          </span>
          <span className="text-caption font-mono">{tags.join(", ")}</span>
        </div>
      )}
    </aside>
  );
}
