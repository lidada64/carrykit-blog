"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";
import { prefersReducedMotion } from "./reduced-motion";

gsap.registerPlugin(useGSAP);

/**
 * 页面过渡 revealer(DESIGN_SPEC A1 / PRD US-N1):
 * 捕获站内链接点击 → 遮罩自下而上滑入覆盖 → router.push →
 * 新页就绪(pathname 变化)→ 遮罩继续向上滑出揭示。
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
          gsap.set(overlay, { yPercent: 0, opacity: 0, pointerEvents: "auto" });
          gsap.to(overlay, {
            opacity: 1,
            duration: motionTokens.duration.fast,
            onComplete: navigate,
          });
        } else {
          gsap.set(overlay, {
            yPercent: 100,
            opacity: 1,
            pointerEvents: "auto",
          });
          gsap.to(overlay, {
            yPercent: 0,
            duration: motionTokens.duration.base,
            ease: motionTokens.ease.transition,
            onComplete: navigate,
          });
        }
      });

      document.addEventListener("click", onClick);
      return () => document.removeEventListener("click", onClick);
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
          onComplete: () => gsap.set(overlay, { pointerEvents: "none" }),
        });
      } else {
        gsap.to(overlay, {
          yPercent: -100,
          duration: motionTokens.duration.base,
          ease: motionTokens.ease.transition,
          onComplete: () =>
            gsap.set(overlay, { yPercent: 100, pointerEvents: "none" }),
        });
      }
    },
    { dependencies: [pathname], scope: overlayRef },
  );

  return (
    <div
      ref={overlayRef}
      aria-hidden
      className="fixed inset-0 z-50 bg-revealer"
      // 初始停在视口下方,不响应指针;由 GSAP 接管后续状态
      style={{ transform: "translateY(100%)", pointerEvents: "none" }}
    />
  );
}
