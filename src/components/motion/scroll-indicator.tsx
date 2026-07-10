"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * 右侧滚动进度指示,替代原生滚动条(原生条由 globals.css 按
 * html:has([data-scroll-indicator]) 隐藏,仅公开站生效,admin 保留原生)。
 * 顶部时不可见;向下滚动时反主题色矩形从顶部向下生长(scaleY = 滚动进度),
 * 滚到底部铺满整高。不可滚动的短页不显示(与原生滚动条行为一致)。
 * 与 ProgressBar 同为非运动性反馈,reduced-motion 下保留(DESIGN_SPEC §5 红线)。
 */
export function ScrollIndicator() {
  const ref = useRef<HTMLDivElement>(null);
  // 本组件挂在 (site) 布局、跨路由存活:切页后文档高度变化,
  // 需按 pathname 重建 ScrollTrigger 并重算 end="max"
  const pathname = usePathname();

  useGSAP(
    () => {
      const bar = ref.current;
      if (!bar) return;
      gsap.fromTo(
        bar,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            start: 0,
            end: "max",
            scrub: true,
            onRefresh: () =>
              gsap.set(bar, {
                autoAlpha: ScrollTrigger.maxScroll(window) > 0 ? 1 : 0,
              }),
          },
        },
      );
      ScrollTrigger.refresh();
    },
    { dependencies: [pathname], revertOnUpdate: true, scope: ref },
  );

  return (
    <div
      ref={ref}
      data-scroll-indicator
      aria-hidden
      className="fixed right-0 top-0 z-40 h-svh w-2 origin-top bg-foreground"
      style={{ transform: "scaleY(0)" }}
    />
  );
}
