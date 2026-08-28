"use client";

import { useEffect, type RefObject } from "react";

/**
 * CursorMirror —— /lab/home 的光标驱动(挂在 16:9 frame 上,自身不渲染任何东西)。
 *
 * 把鼠标位置归一化成 frame 内分数写进 CSS 变量 `--cx/--cy`,把命中的可选元素 key
 * 写进 `data-hk`,把激活态写进 `data-active`。这三者由 frame 向下继承/后代匹配,
 * 于是**每一层嵌套 Scene 里的递归光标环**(读 `--cx/--cy`,见 home-scene)和**同 key
 * 的元素高亮**(`group-data-[hk=…]/frame:` 变体)都自动镜像——鼠标只改这一个元素上
 * 的 2 个变量 + 1 个属性,**不触发 React 重渲染**,5 层树零成本跟随。
 *
 * 仅精确指针 + 非 reduced-motion 时接管;否则保留原生光标、不显环(frame 的
 * data-active 停在 "0")。启用期间注入 `*{cursor:none}` 消灭 I-beam「工」字/手型。
 */
export function CursorMirror({ frameRef }: { frameRef: RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    const style = document.createElement("style");
    style.textContent = "*{cursor:none !important;}";
    document.head.appendChild(style);
    frame.dataset.active = "1";

    let tx = 0.5;
    let ty = 0.5;
    let cx = 0.5;
    let cy = 0.5;
    let seeded = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const r = frame.getBoundingClientRect();
      tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      if (!seeded) {
        seeded = true;
        cx = tx;
        cy = ty;
      }
      // 嵌套 pointer-events-none → e.target 只会是 depth 0 的 [data-key] 元素或空白
      const el = (e.target as Element | null)?.closest?.("[data-key]") as HTMLElement | null;
      const key = el?.dataset.key;
      if (key) frame.dataset.hk = key;
      else delete frame.dataset.hk;
    };

    const tick = () => {
      cx += (tx - cx) * 0.2;
      cy += (ty - cy) * 0.2;
      frame.style.setProperty("--cx", cx.toFixed(4));
      frame.style.setProperty("--cy", cy.toFixed(4));
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      style.remove();
      frame.dataset.active = "0";
      delete frame.dataset.hk;
      frame.style.removeProperty("--cx");
      frame.style.removeProperty("--cy");
    };
  }, [frameRef]);

  return null;
}
