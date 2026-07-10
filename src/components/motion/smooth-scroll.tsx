"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, useGSAP);

/**
 * 惯性滚动(ScrollSmoother):原生滚动位置不变(滚动条/键盘/锚点照常),
 * 内容以 transform 延迟追赶,滚动停止后按原方向再滑行一小段。
 * 仅包住可滚动内容;Revealer / ScrollIndicator / ProgressBar 等 fixed
 * 元素必须在本包裹层之外(transform 祖先会破坏 fixed 定位)。
 * 触屏保持原生惯性(smoothTouch 不开);reduced-motion 不创建,普通滚动。
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (!wrapperRef.current || !contentRef.current) return;
      ScrollSmoother.create({
        wrapper: wrapperRef.current,
        content: contentRef.current,
        smooth: motionTokens.inertia,
      });
    },
    { scope: wrapperRef },
  );

  return (
    <div ref={wrapperRef}>
      {/* min-h-svh + flex 让短页 Footer 仍沉底(原 body flex 链被包裹层隔断) */}
      <div ref={contentRef} className="flex min-h-svh flex-col">
        {children}
      </div>
    </div>
  );
}
