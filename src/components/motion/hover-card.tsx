"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

/**
 * 卡片 hover(DESIGN_SPEC A8):封面图 scale 1.03 + 卡片 y -4px,时长 fast。
 * 图片需位于 overflow-hidden 容器内(现有卡片结构已满足)。
 * prefers-reduced-motion 时不绑定事件。
 */
export function HoverCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      if (prefersReducedMotion() || !contextSafe) return;
      const el = ref.current;
      if (!el) return;
      const image = el.querySelector("img");

      const animate = (lift: number, scale: number) =>
        contextSafe(() => {
          gsap.to(el, {
            y: lift,
            duration: motionTokens.duration.fast,
            ease: motionTokens.ease.transition,
          });
          if (image) {
            gsap.to(image, {
              scale,
              duration: motionTokens.duration.fast,
              ease: motionTokens.ease.transition,
            });
          }
        });

      const enter = animate(
        motionTokens.hover.cardLift,
        motionTokens.hover.imageScale,
      );
      const leave = animate(0, 1);
      el.addEventListener("mouseenter", enter);
      el.addEventListener("mouseleave", leave);
      return () => {
        el.removeEventListener("mouseenter", enter);
        el.removeEventListener("mouseleave", leave);
      };
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
