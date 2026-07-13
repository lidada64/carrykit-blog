"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useT } from "@/i18n";

gsap.registerPlugin(ScrollTrigger, useGSAP);

function PostMetaContent({
  title,
  excerpt,
  date,
  tags,
  dateLabel,
  tagsLabel,
  isDark,
}: {
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  dateLabel: string;
  tagsLabel: string;
  isDark?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-8 lg:p-8 ${isDark ? "text-background" : ""}`}>
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
      {excerpt && (
        <p
          className={`max-w-[40ch] text-body ${
            isDark ? "text-background/70" : "text-muted"
          }`}
        >
          {excerpt}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <span
          className={`text-caption font-mono uppercase ${
            isDark ? "text-background/70" : "text-muted"
          }`}
        >
          {dateLabel}
        </span>
        <span className="text-caption font-mono">{date}</span>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span
            className={`text-caption font-mono uppercase ${
              isDark ? "text-background/70" : "text-muted"
            }`}
          >
            {tagsLabel}
          </span>
          <span className="text-caption font-mono">{tags.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Blog 详情 metadata 侧栏(DESIGN_SPEC §6 / US-B4):描述 + DATE + TAGS,label 走 i18n。
 * lg+ 时 sticky 吸附(top-24,与 blog 列表侧栏一致),顶部带"标题交接"滑入槽:
 * 大标题滚出后文章标题由 post-title 的 ScrollTrigger 在此从上往下滑入。
 * 添加了滑动遮罩反色效果，跟随文章滚动实现暗色背景覆盖和文字反色。
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
  const containerRef = useRef<HTMLElement>(null);
  const darkLayerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = containerRef.current;
      const darkLayer = darkLayerRef.current;
      const parent = container?.parentElement;
      if (!container || !darkLayer || !parent) return;

      const mm = gsap.matchMedia();
      mm.add(
        "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        () => {
          // 遮罩反色动效 (向上遮罩)
          gsap.fromTo(
            darkLayer,
            { clipPath: "inset(100% 0% 0% 0%)" },
            {
              clipPath: "inset(0% 0% 0% 0%)",
              ease: "none",
              scrollTrigger: {
                trigger: parent,
                start: "top top+=96", // 触及顶线开始
                end: "bottom bottom", // 文章底部到达视口底部结束
                scrub: true,
              },
            },
          );

          // 物理下移视差动效 (替代 sticky)
          gsap.fromTo(
            container,
            { y: 0 },
            {
              y: () => parent.clientHeight - container.clientHeight,
              ease: "none",
              scrollTrigger: {
                trigger: parent,
                start: "top top+=96",
                end: "bottom bottom",
                scrub: true,
                invalidateOnRefresh: true,
              },
            }
          );
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <aside
      ref={containerRef}
      className="relative lg:-mx-8 lg:self-start lg:overflow-hidden"
    >
      {/* 底层正常模式 */}
      <PostMetaContent
        title={title}
        excerpt={excerpt}
        date={date}
        tags={tags}
        dateLabel={t("blog.dateLabel")}
        tagsLabel={t("blog.tagsLabel")}
      />
      
      {/* 顶层暗色反色模式遮罩 */}
      <div
        ref={darkLayerRef}
        className="absolute inset-0 hidden bg-foreground lg:block"
        aria-hidden="true"
        style={{ clipPath: "inset(100% 0% 0% 0%)" }}
      >
        <PostMetaContent
          title={title}
          excerpt={excerpt}
          date={date}
          tags={tags}
          dateLabel={t("blog.dateLabel")}
          tagsLabel={t("blog.tagsLabel")}
          isDark
        />
      </div>
    </aside>
  );
}
