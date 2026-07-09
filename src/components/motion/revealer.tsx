"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

/**
 * 页面过渡 revealer(DESIGN_SPEC A1 / PRD US-N1,对齐参考站):
 * 捕获站内链接点击 → 屏幕中部略低处浮现一条横向黑线,由慢到快
 * 纵向放大铺满全屏(scaleY,origin 55%)→ router.push →
 * 新页就绪(pathname 变化)→ 遮罩自底向上由慢到快上刷揭示内容。
 * 只挂在 (site) 布局,admin 不启用;指向 /admin 的链接直接放行。
 * reduced-motion 降级为遮罩 fade;无 JS 时链接原生跳转不受影响。
 */
export function Revealer() {
  const router = useRouter();
  const pathname = usePathname();
  const overlayRef = useRef<HTMLDivElement>(null);
  /** 遮罩当前是否覆盖中(点击拦截已播入场):浏览器前进/后退不经拦截,不播滑出 */
  const covering = useRef(false);

  // 站内链接点击拦截 → 遮罩滑入 → 导航
  useGSAP(
    (_context, contextSafe) => {
      if (!contextSafe) return;

      const onClick = contextSafe((event: MouseEvent) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        const anchor = (event.target as Element).closest?.("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        // 仅站内相对路径;外链/mailto/新标签/下载/admin 一律放行
        if (!href || !href.startsWith("/") || href.startsWith("/admin")) return;
        if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
        const url = new URL(href, window.location.origin);
        if (url.pathname === window.location.pathname) return;

        event.preventDefault();
        const overlay = overlayRef.current;
        if (!overlay) return;
        covering.current = true;
        const navigate = () => router.push(href);

        if (prefersReducedMotion()) {
          gsap.set(overlay, {
            scaleY: 1,
            yPercent: 0,
            opacity: 0,
            pointerEvents: "auto",
          });
          gsap.to(overlay, {
            opacity: 1,
            duration: motionTokens.duration.fast,
            onComplete: navigate,
          });
        } else {
          // 黑线在屏幕中部略低处(origin 55%)浮现,由慢到快放大铺满
          gsap.set(overlay, {
            scaleY: 0.002,
            yPercent: 0,
            opacity: 1,
            transformOrigin: "50% 55%",
            pointerEvents: "auto",
          });
          gsap.to(overlay, {
            scaleY: 1,
            duration: motionTokens.duration.slow,
            ease: motionTokens.ease.accelerate,
            onComplete: navigate,
          });
        }
      });

      // 捕获阶段拦截:next/link 的 React onClick 在冒泡阶段会先 preventDefault
      // 并自行导航,冒泡阶段的监听永远轮不到;capture 先行 preventDefault 后
      // Link 会尊重 defaultPrevented 放弃自身导航
      document.addEventListener("click", onClick, true);
      return () => document.removeEventListener("click", onClick, true);
    },
    { scope: overlayRef },
  );

  // 新页就绪 → 遮罩滑出
  useGSAP(
    () => {
      if (!covering.current) return;
      covering.current = false;
      const overlay = overlayRef.current;
      if (!overlay) return;

      if (prefersReducedMotion()) {
        gsap.to(overlay, {
          opacity: 0,
          duration: motionTokens.duration.fast,
          onComplete: () =>
            gsap.set(overlay, { scaleY: 0, pointerEvents: "none" }),
        });
      } else {
        // 自底向上由慢到快上刷,露出新页内容
        gsap.to(overlay, {
          yPercent: -100,
          duration: motionTokens.duration.slow,
          ease: motionTokens.ease.accelerate,
          onComplete: () =>
            gsap.set(overlay, { yPercent: 0, scaleY: 0, pointerEvents: "none" }),
        });
      }
    },
    { dependencies: [pathname], scope: overlayRef },
  );

  return (
    <div
      ref={overlayRef}
      data-revealer
      aria-hidden
      className="fixed inset-0 z-50 bg-revealer"
      // 初始压扁为不可见的线,不响应指针;由 GSAP 接管后续状态
      style={{ transform: "scaleY(0)", pointerEvents: "none" }}
    />
  );
}
