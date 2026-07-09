"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { PRELOADER_DONE_EVENT } from "./preloader";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

/** 像素块边长(px):实现常量;块颜色一律用 bg-background token 类 */
const PIXEL_SIZE = 28;

/**
 * Pixelated 标题入场(DESIGN_SPEC A4,M3-5 定案:分块 div 方案,非 canvas):
 * 真实文字之上盖一层底色方块网格,入场时方块按随机顺序消失,
 * 呈"像素块逐步清晰"的揭示;文字始终是真实 DOM(SEO/无障碍不受影响)。
 * 首访时等 preloader 揭示完成(PRELOADER_DONE_EVENT)再开播;
 * reduced-motion 降级为整体 fade。入场只播一次(once per mount)。
 */
export function PixelTitle({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      if (!contextSafe) return;
      const el = ref.current;
      if (!el) return;
      const grid = el.querySelector<HTMLElement>("[data-pixel-grid]");
      if (!grid) return;

      if (prefersReducedMotion()) {
        grid.remove();
        gsap.from(el, { opacity: 0, duration: motionTokens.duration.base });
        return;
      }

      const play = contextSafe(() => {
        const rect = el.getBoundingClientRect();
        const cols = Math.max(1, Math.ceil(rect.width / PIXEL_SIZE));
        const rows = Math.max(1, Math.ceil(rect.height / PIXEL_SIZE));
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        const cells: HTMLElement[] = [];
        for (let i = 0; i < cols * rows; i += 1) {
          const cell = document.createElement("div");
          cell.className = "bg-background";
          grid.appendChild(cell);
          cells.push(cell);
        }
        // 方块就位后撤掉整块打底,由方块自己遮盖
        grid.classList.remove("bg-background");
        gsap.to(cells, {
          opacity: 0,
          duration: motionTokens.duration.fast,
          ease: motionTokens.ease.transition,
          stagger: {
            amount: motionTokens.duration.slow,
            from: "random",
            grid: [rows, cols],
          },
          onComplete: () => grid.remove(),
        });
      });

      // 首访 preloader 还在播时,等它揭开再播,否则效果被遮罩盖住
      if (document.querySelector("[data-preloader]")) {
        window.addEventListener(PRELOADER_DONE_EVENT, play, { once: true });
        return () => window.removeEventListener(PRELOADER_DONE_EVENT, play);
      }
      play();
    },
    { scope: ref },
  );

  return (
    <span ref={ref} className="relative inline-block">
      {text}
      {/* 方块生成前先整块盖住,避免水合前文字闪现后被遮 */}
      <span
        data-pixel-grid
        aria-hidden
        className="absolute inset-0 grid bg-background"
      />
    </span>
  );
}
