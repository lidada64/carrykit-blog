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

    // 记「最后鼠标屏幕坐标」而非归一化值:每帧对**当前**frame rect 重算 → 转场缩放时(段1)
    // 鼠标不动而 frame 缩放,环仍精确贴在真实鼠标处、不随缩放漂移(滚动无 pointermove 也跟得住)。
    let lx: number | null = null;
    let ly: number | null = null;
    let cx = 0.5;
    let cy = 0.5;
    let seeded = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      lx = e.clientX;
      ly = e.clientY;
      // 嵌套 pointer-events-none → e.target 只会是 depth 0 的 [data-key] 元素或空白
      const el = (e.target as Element | null)?.closest?.("[data-key]") as HTMLElement | null;
      const key = el?.dataset.key;
      if (key) frame.dataset.hk = key;
      else delete frame.dataset.hk;
    };

    const tick = () => {
      if (lx !== null && ly !== null) {
        const r = frame.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const tx = Math.min(1, Math.max(0, (lx - r.left) / r.width));
          const ty = Math.min(1, Math.max(0, (ly - r.top) / r.height));
          if (!seeded) {
            seeded = true;
            cx = tx;
            cy = ty;
          }
          cx += (tx - cx) * 0.2;
          cy += (ty - cy) * 0.2;
        }
      }
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
