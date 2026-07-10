"use client";

import { useT } from "@/i18n";

/**
 * Blog 详情 metadata 侧栏(DESIGN_SPEC §6 / US-B4):描述 + DATE + TAGS,label 走 i18n。
 * lg+ 时 sticky 吸附(top-24,与 blog 列表侧栏一致),顶部带"标题交接"滑入槽:
 * 大标题滚出后文章标题由 post-title 的 ScrollTrigger 在此从上往下滑入。
 */
export function PostMeta({
  title,
  excerpt,
  date,
  tags,
}: {
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
}) {
  const t = useT();

  return (
    <aside className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
      {/* 标题滑入槽:仅 lg+ 且未减弱动态时占位;初始移出裁剪区,无 JS 时不可见 */}
      <span className="hidden overflow-hidden motion-safe:lg:block">
        <span
          data-post-meta-title
          aria-hidden
          // heading 档:大标题消失后由它接棒,比 subheading 更有存在感(字号阶梯内取值)
          className="block text-heading font-display"
          style={{ transform: "translateY(-110%)" }}
        >
          {title}
        </span>
      </span>
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
