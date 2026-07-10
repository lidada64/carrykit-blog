"use client";

import { useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * 滚动/阅读进度条(DESIGN_SPEC A6 / US-B5):页面底部细条,
 * scaleX = 整页滚动进度(scrub 直接映射,与滚动位置一致)。
 * portal 到 body:组件由页面渲染,但 SmoothScroll 内容层带 transform,
 * fixed 定位在层内会失效,必须挂到包裹层之外。
 * 非运动性反馈,reduced-motion 下保留(DESIGN_SPEC §5 红线)。
 */
// mounted 探测:服务端快照 false、客户端快照 true,无需订阅任何外部源
const emptySubscribe = () => () => {};

export function ProgressBar() {
  const ref = useRef<HTMLDivElement>(null);
  // portal 需要 document,SSR 首帧先渲染空
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useGSAP(
    () => {
      const bar = ref.current;
      if (!bar) return;
      gsap.fromTo(
        bar,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: true },
        },
      );
    },
    // mounted 翻转后 bar 才存在,依赖它重跑一次
    { dependencies: [mounted], scope: ref },
  );

  if (!mounted) return null;
  return createPortal(
    <div
      ref={ref}
      aria-hidden
      className="fixed bottom-0 left-0 z-40 h-0.5 w-full origin-left bg-foreground"
      style={{ transform: "scaleX(0)" }}
    />,
    document.body,
  );
}
