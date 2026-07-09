"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * 滚动/阅读进度条(DESIGN_SPEC A6 / US-B5):页面底部细条,
 * scaleX = 整页滚动进度(scrub 直接映射,与滚动位置一致)。
 * 非运动性反馈,reduced-motion 下保留(DESIGN_SPEC §5 红线)。
 */
export function ProgressBar() {
  const ref = useRef<HTMLDivElement>(null);

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
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className="fixed bottom-0 left-0 z-40 h-0.5 w-full origin-left bg-foreground"
      style={{ transform: "scaleX(0)" }}
    />
  );
}
