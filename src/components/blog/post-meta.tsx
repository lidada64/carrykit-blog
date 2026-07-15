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
          // 获取右侧正文容器
          const rightContent = parent.querySelector('.right-content');
          if (!rightContent) return;

          // 计算需要滑动的距离:右侧内容总高度 - 视口可用高度(100vh - 96px)
          const getScrollAmount = () => {
            const amount = rightContent.scrollHeight - (window.innerHeight - 96);
            return Math.max(0, amount);
          };

          const amount = getScrollAmount();

          if (amount > 0) {
            // 核心修复: 限制父容器高度为视口可用高度并隐藏溢出，
            // 这样加上 GSAP pin-spacer 的高度后，总高度正好等于内容原高度，彻底消除底部的巨大空白！
            gsap.set(parent, {
              maxHeight: "calc(100vh - 96px)",
              overflow: "hidden"
            });

            // 钉住(pin)整个父网格，翻译(translate)右侧内容模拟其独立滑动
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: parent,
                start: "top top+=96",
                end: () => `+=${getScrollAmount()}`,
                pin: true,
                scrub: true,
                invalidateOnRefresh: true,
              }
            });

            // 1. 右侧正文向上滑动
            tl.to(rightContent, {
              y: () => -getScrollAmount(),
              ease: "none"
            }, 0);

            // 2. 左侧反色遮罩动画同步执行
            tl.fromTo(
              darkLayer,
              { clipPath: "inset(100% 0% 0% 0%)" },
              {
                clipPath: "inset(0% 0% 0% 0%)",
                ease: "none"
              },
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
                  trigger: parent,
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
