"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "@/components/motion/tokens";
import { Bilingual } from "@/components/ui/bilingual";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** 左栏 sticky 吸附线(top-24 = 96px):大标题底边越线即触发交接 */
const STICKY_TOP = 96;

/**
 * Blog 详情大标题 + "标题交接"动效:
 * 向下滚动时大标题随滚动淡出上移(scrub,上滚自动还原);
 * 大标题底边越过左栏 sticky 线后,文章标题在 PostMeta 顶部的
 * [data-post-meta-title] 槽内从上往下滑入,上滚回则逆向滑出。
 * 仅 lg+ 且未开启减弱动态时生效(lg 以下无左右栏,效果无意义);
 * 其余情况大标题保持静态,侧栏槽被 CSS 隐藏(post-meta)。
 */
export function PostTitle({ titleZh, titleEn }: { titleZh: string; titleEn?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const heading = ref.current;
      if (!heading) return;

      const mm = gsap.matchMedia();
      // 1024px = Tailwind lg 断点;reduced-motion 由 media query 排除
      mm.add(
        "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        () => {
          // 大标题消失:随自身滚出视口的过程淡出并上移
          gsap.to(heading, {
            autoAlpha: 0,
            y: -motionTokens.enterY,
            ease: "none",
            scrollTrigger: {
              trigger: heading,
              start: `top ${STICKY_TOP}px`,
              end: `bottom ${STICKY_TOP}px`,
              scrub: true,
            },
          });

          // 交接:大标题底边越过 sticky 线 → 侧栏标题滑入;滚回则滑出
          const slots = document.querySelectorAll<HTMLElement>(
            "[data-post-meta-title]",
          );
          if (slots.length === 0) return;
          // 无 JS 兜底的内联 translateY(-110%) 是像素轨道,
          // 归一到 yPercent 轨道后交给 tween 驱动
          gsap.set(slots, { y: 0, yPercent: -110 });
          // 注意:这里不能用外层 useGSAP 的 contextSafe 包裹——
          // matchMedia 子 context 与外层 context 会相互引用,断点切换
          // revert 时 getTweens 无限递归栈溢出;裸 tween 最长只活 0.5s,
          // 卸载后在游离节点上跑完即被回收,无需纳入 context
          const slideIn = () =>
            gsap.to(slots, {
              yPercent: 0,
              duration: motionTokens.duration.base,
              ease: motionTokens.ease.enter,
              overwrite: "auto",
            });
          const slideOut = () =>
            gsap.to(slots, {
              yPercent: -110,
              duration: motionTokens.duration.base,
              ease: motionTokens.ease.enter,
              overwrite: "auto",
            });
          ScrollTrigger.create({
            trigger: heading,
            start: `bottom ${STICKY_TOP}px`,
            onEnter: slideIn,
            onLeaveBack: slideOut,
          });
        },
      );
    },
    { scope: ref },
  );

  return (
    <h1 ref={ref} className="mt-10 max-w-[20ch] text-display font-display">
      <Bilingual zh={titleZh} en={titleEn} asBlock />
    </h1>
  );
}
