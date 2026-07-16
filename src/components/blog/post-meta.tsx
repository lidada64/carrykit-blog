"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useT } from "@/i18n";
import { Bilingual } from "@/components/ui/bilingual";

gsap.registerPlugin(ScrollTrigger, useGSAP);

function PostMetaContent({
  titleZh,
  titleEn,
  excerptZh,
  excerptEn,
  date,
  tags,
  dateLabel,
  tagsLabel,
  isDark,
}: {
  titleZh: string;
  titleEn?: string;
  excerptZh: string;
  excerptEn?: string;
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
        {/* heading 档:大标题消失后由它接棒,比 subheading 更有存在感(字号阶梯内取值) */}
        <span className="block text-heading font-display" style={{ transform: "translateY(-110%)" }} data-post-meta-title aria-hidden>
          <Bilingual zh={titleZh} en={titleEn} asBlock />
        </span>
      </span>
      {excerptZh && (
        <p
          className={`max-w-[40ch] text-body ${
            isDark ? "text-background/70" : "text-muted"
          }`}
        >
          <Bilingual zh={excerptZh} en={excerptEn} asBlock />
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
  titleZh,
  titleEn,
  excerptZh,
  excerptEn,
  date,
  tags,
}: {
  titleZh: string;
  titleEn?: string;
  excerptZh: string;
  excerptEn?: string;
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
      const scrollContainer = container?.closest('.blog-scroll-container');
      if (!container || !darkLayer || !scrollContainer) return;

      const mm = gsap.matchMedia();
      mm.add(
        "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        () => {
          const rightContent = scrollContainer.querySelector('.right-content') as HTMLElement;
          const relatedArticles = scrollContainer.querySelector('.related-articles-wrapper') as HTMLElement;
          if (!rightContent || !relatedArticles) return;

          const maxLeftY = rightContent.offsetHeight - container.offsetHeight;

          if (maxLeftY > 0) {
            // 核心修复：缩小固定容器的高度，并截断溢出
            // 使得加上 GSAP pin-spacer 的高度后，完美契合内容原高度，彻底消除底部的巨大空白
            gsap.set(scrollContainer, { clearProps: "height,overflow" });
            gsap.set(scrollContainer, {
              height: container.offsetHeight + relatedArticles.offsetHeight,
              overflow: "hidden"
            });

            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: scrollContainer,
                start: "top top+=96",
                end: `+=${maxLeftY}`,
                pin: true,
                scrub: true,
                invalidateOnRefresh: true,
              }
            });

            // Translate Right Content and Related Articles up together
            tl.to([rightContent, relatedArticles], {
              y: -maxLeftY,
              ease: "none"
            }, 0);

            // Sync dark layer animation
            tl.fromTo(
              darkLayer,
              { clipPath: "inset(100% 0% 0% 0%)" },
              { clipPath: "inset(0% 0% 0% 0%)", ease: "none" },
              0
            );
          } else {
            // 如果内容很短不需要滑动，只需简单执行反色遮罩
            gsap.fromTo(
              darkLayer,
              { clipPath: "inset(100% 0% 0% 0%)" },
              {
                clipPath: "inset(0% 0% 0% 0%)",
                ease: "none",
                scrollTrigger: {
                  trigger: scrollContainer,
                  start: "top top+=96",
                  end: "bottom bottom",
                  scrub: true,
                },
              }
            );
          }
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <aside
      ref={containerRef}
      className="relative lg:self-start lg:overflow-hidden"
    >
      {/* 底层正常模式 */}
      <PostMetaContent
        titleZh={titleZh}
        titleEn={titleEn}
        excerptZh={excerptZh}
        excerptEn={excerptEn}
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
          titleZh={titleZh}
          titleEn={titleEn}
          excerptZh={excerptZh}
          excerptEn={excerptEn}
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
