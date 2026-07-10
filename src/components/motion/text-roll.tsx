"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

/**
 * 文字滚动 hover(DESIGN_SPEC A3):同一文字堆叠 3 份 span 于
 * overflow-hidden wrapper(高 1lh)内。触发时内层上滚一份。
 * 反色由触发容器负责(整行/整项 hover:bg-foreground),本组件只保证
 * 滚入的第二份副本文字用底色 token(text-background)与之配合;
 * 离开时继续滚到第三份(正常色)后瞬时复位,视觉上是无缝的持续上滚。
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
      const currentY = () => Number(gsap.getProperty(inner, "yPercent"));
      const rollIn = contextSafe(() => {
        const y = currentY();
        gsap.killTweensOf(inner);
        if (y < -STEP) {
          // rollOut 后半程被重新 hover:直接 tween 回 -STEP 会向下倒滚,
          // 破坏"持续上滚"错觉 → 顺势滚完整圈瞬时归零后再滚入,始终向上
          gsap
            .timeline()
            .to(inner, {
              yPercent: -STEP * 2,
              // 剩余距离按正常滚速折算时长(y ∈ (-2*STEP, -STEP),结果 ∈ (0, base))
              duration: (motionTokens.duration.base * (STEP * 2 + y)) / STEP,
              ease: "none",
            })
            .set(inner, { yPercent: 0 })
            .to(inner, {
              yPercent: -STEP,
              // base 时长:fast 的滚动手感偏急(用户反馈调慢)
              duration: motionTokens.duration.base,
              ease: motionTokens.ease.transition,
            });
          return;
        }
        gsap.to(inner, {
          yPercent: -STEP,
          duration: motionTokens.duration.base,
          ease: motionTokens.ease.transition,
        });
      });
      const rollOut = contextSafe(() => {
        // 已在复位态(如 mouseleave 复位后又收到 focusout)则不滚:
        // 否则会无故滚一整圈,中途闪过反色副本
        if (currentY() === 0) return;
        gsap.killTweensOf(inner);
        gsap.to(inner, {
          yPercent: -STEP * 2,
          duration: motionTokens.duration.base,
          ease: motionTokens.ease.transition,
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
        {/* 滚入副本用底色文字,与触发容器的 hover:bg-foreground 反色配合(A3) */}
        <span aria-hidden className="text-background">
          {text}
        </span>
        <span aria-hidden>{text}</span>
      </span>
    </span>
  );
}
