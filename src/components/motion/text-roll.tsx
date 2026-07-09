"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

/**
 * 文字滚动 hover(DESIGN_SPEC A3):同一文字堆叠 3 份 span 于
 * overflow-hidden wrapper(高 1lh)内。触发时内层上滚一份,离开时
 * 继续滚到第三份后瞬时复位——文字相同,视觉上是无缝的持续上滚。
 * 触发器取最近的 <a> 祖先(整行链接 hover 时日期与标题同时滚动),
 * 键盘 focusin/focusout 同样触发;reduced-motion 时不绑定事件。
 */
export function TextRoll({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      if (prefersReducedMotion() || !contextSafe) return;
      const el = ref.current;
      if (!el) return;
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) return;
      const trigger = el.closest("a") ?? el;

      // yPercent 以内层自身(3 行)为基准:滚一行 = 100/3
      const STEP = 100 / 3;
      const rollIn = contextSafe(() => {
        gsap.to(inner, {
          yPercent: -STEP,
          duration: motionTokens.duration.fast,
          ease: motionTokens.ease.transition,
          overwrite: "auto",
        });
      });
      const rollOut = contextSafe(() => {
        gsap.to(inner, {
          yPercent: -STEP * 2,
          duration: motionTokens.duration.fast,
          ease: motionTokens.ease.transition,
          overwrite: "auto",
          onComplete: () => gsap.set(inner, { yPercent: 0 }),
        });
      });

      trigger.addEventListener("mouseenter", rollIn);
      trigger.addEventListener("mouseleave", rollOut);
      trigger.addEventListener("focusin", rollIn);
      trigger.addEventListener("focusout", rollOut);
      return () => {
        trigger.removeEventListener("mouseenter", rollIn);
        trigger.removeEventListener("mouseleave", rollOut);
        trigger.removeEventListener("focusin", rollIn);
        trigger.removeEventListener("focusout", rollOut);
      };
    },
    { scope: ref },
  );

  return (
    <span
      ref={ref}
      className={`inline-block overflow-hidden align-bottom ${className ?? ""}`}
      // 1lh = 恰好一行高,溢出的两份副本被裁掉
      style={{ height: "1lh" }}
    >
      <span className="flex flex-col">
        <span>{text}</span>
        <span aria-hidden>{text}</span>
        <span aria-hidden>{text}</span>
      </span>
    </span>
  );
}
