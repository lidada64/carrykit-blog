"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

const STORAGE_KEY = "carrykit.preloader-played";

/** preloader 揭示完成事件:等待它的入场动效(如 A4 像素标题)监听此事件再开播 */
export const PRELOADER_DONE_EVENT = "carrykit:preloader-done";

/**
 * Preloader(DESIGN_SPEC A2 / PRD US-H4):仅 Home 挂载。
 * 首次访问:全屏 overlay + mono counter 000→100 → overlay 向上揭开进入 hero。
 * sessionStorage 记忆,同会话不重播;reduced-motion 直接跳过。
 * overlay 随 SSR 输出(首屏被遮罩盖住,不闪内容),重复访问在水合后立即移除。
 */
export function Preloader() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const overlay = overlayRef.current;
      const counter = counterRef.current;
      if (!overlay || !counter) return;

      const played = window.sessionStorage.getItem(STORAGE_KEY) === "1";
      if (played || prefersReducedMotion()) {
        // 隐藏而非 remove():节点归 React 所有,直接删除会在卸载时触发 removeChild 错误。
        // 同时摘掉 data-preloader 标记,等待方(PixelTitle)按"无 preloader"处理
        overlay.removeAttribute("data-preloader");
        gsap.set(overlay, { display: "none" });
        return;
      }
      // 播放开始即标记:中途刷新也不重播
      window.sessionStorage.setItem(STORAGE_KEY, "1");

      const progress = { value: 0 };
      gsap
        .timeline()
        .to(progress, {
          value: 100,
          duration: motionTokens.duration.slow,
          ease: motionTokens.ease.transition,
          onUpdate: () => {
            counter.textContent = String(Math.round(progress.value)).padStart(
              3,
              "0",
            );
          },
        })
        .to(counter, {
          opacity: 0,
          duration: motionTokens.duration.fast,
        })
        .to(overlay, {
          yPercent: -100,
          duration: motionTokens.duration.slow,
          ease: motionTokens.ease.enter,
          onComplete: () => {
            // 隐藏而非 remove():避免 React 卸载时 removeChild 报错
            overlay.removeAttribute("data-preloader");
            gsap.set(overlay, { display: "none" });
            window.dispatchEvent(new Event(PRELOADER_DONE_EVENT));
          },
        });
    },
    { scope: overlayRef },
  );

  return (
    <div
      ref={overlayRef}
      data-preloader
      aria-hidden
      // z-[60] 盖过 revealer(z-50);counter 用底色 token 反白
      className="fixed inset-0 z-[60] flex items-end justify-end bg-revealer p-6 lg:p-12"
    >
      <span
        ref={counterRef}
        className="text-display font-mono text-background"
      >
        000
      </span>
    </div>
  );
}
