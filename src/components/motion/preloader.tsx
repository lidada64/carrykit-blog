"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

/** preloader 揭示完成事件:等待它的入场动效(如 A4 像素标题)监听此事件再开播 */
export const PRELOADER_DONE_EVENT = "carrykit:preloader-done";

/**
 * Preloader(DESIGN_SPEC A2 / PRD US-H4):仅 Home 挂载。
 * 每次访问:全屏 overlay + mono counter 000→100 → overlay 向上揭开进入 hero。
 * reduced-motion 跳过动画,遮罩仍等待ready。
 * overlay 随 SSR 输出,场景首帧与安全缓冲完成后才揭幕。
 */
export function Preloader({ ready = true }: { ready?: boolean }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const readyRef = useRef(ready);
  const releaseRef = useRef<() => void>(() => {});

  useGSAP(() => {
    readyRef.current = ready;
    if (ready) releaseRef.current();
  }, [ready]);

  useGSAP(
    () => {
      const overlay = overlayRef.current;
      const counter = counterRef.current;
      if (!overlay || !counter) return;

      if (prefersReducedMotion()) {
        // 隐藏而非 remove():节点归 React 所有,直接删除会在卸载时触发 removeChild 错误。
        // 同时摘掉 data-preloader 标记,等待方(PixelTitle)按"无 preloader"处理
        releaseRef.current = () => {
          overlay.removeAttribute("data-preloader");
          gsap.set(overlay, { display: "none" });
        };
        if (readyRef.current) releaseRef.current();
        return () => { releaseRef.current = () => {}; };
      }
      const progress = { value: 0 };
      const timeline = gsap.timeline();
      releaseRef.current = () => { timeline.resume(); };
      const updateCounter = () => {
        counter.textContent = String(Math.round(progress.value)).padStart(3, "0");
      };
      timeline
        .to(progress, {
          value: 90,
          duration: motionTokens.duration.slow,
          ease: motionTokens.ease.transition,
          onUpdate: updateCounter,
        })
        .call(() => {
          // Keep the original corner counter visible until the scene can draw.
          if (!readyRef.current) timeline.pause();
        })
        .to(progress, {
          value: 100,
          duration: motionTokens.duration.fast,
          ease: motionTokens.ease.transition,
          onUpdate: updateCounter,
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
      return () => { releaseRef.current = () => {}; };
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
