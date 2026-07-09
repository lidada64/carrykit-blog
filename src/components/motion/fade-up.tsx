"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * 入场 fade+up(DESIGN_SPEC A7):区块进入视口 opacity 0→1 + y 24→0,once。
 * stagger 模式对直接子元素逐个入场(列表/卡片网格用)。
 * prefers-reduced-motion 时不创建动画,内容直接静态展示。
 */
export function FadeUp({
  as: Tag = "div",
  stagger = false,
  className,
  children,
}: {
  as?: "div" | "section" | "ul" | "aside";
  stagger?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const el = ref.current;
      if (!el) return;
      gsap.from(stagger ? Array.from(el.children) : el, {
        opacity: 0,
        y: motionTokens.enterY,
        duration: motionTokens.duration.slow,
        ease: motionTokens.ease.enter,
        stagger: stagger ? motionTokens.stagger : 0,
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
      });
    },
    { scope: ref },
  );

  return (
    <Tag
      // 多标签共用同一 ref,类型按 HTMLElement 收敛
      ref={ref as React.Ref<never>}
      className={className}
    >
      {children}
    </Tag>
  );
}
