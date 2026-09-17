"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * CursorRing —— 首页舞台内的自定义光标环(「选取器」)。
 *
 * 复活自旧首页的 CursorMirror:那版只往 frame 写 --cx/--cy,真正画环的是递归 HomeScene(已归档)。
 * 这里做成**自带渲染**的独立版:在 `[data-stage]` 内隐藏原生光标,画一个跟随鼠标(缓动)的墨色圆环;
 * 舞台外(顶栏 CARRY/汉堡/菜单)保留原生光标。仅精确指针 + 非 reduced-motion 接管。
 */
export function CursorRing({ stageRef }: { stageRef: RefObject<HTMLElement | null> }) {
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const ring = ringRef.current;
    if (!stage || !ring) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // 仅舞台内灭原生光标(不碰舞台外导航)。
    const style = document.createElement("style");
    style.textContent = "[data-stage],[data-stage] *{cursor:none !important;}";
    document.head.appendChild(style);

    let lx = -1;
    let ly = -1;
    let cx = -1;
    let cy = -1;
    let inside = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      lx = e.clientX;
      ly = e.clientY;
      const r = stage.getBoundingClientRect();
      inside = lx >= r.left && lx <= r.right && ly >= r.top && ly <= r.bottom;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (lx < 0) return;
      if (cx < 0) {
        cx = lx;
        cy = ly;
      }
      cx += (lx - cx) * 0.25; // 缓动跟随
      cy += (ly - cy) * 0.25;
      ring.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      ring.style.opacity = inside ? "1" : "0";
    };

    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      style.remove();
    };
  }, [stageRef]);

  return (
    <div
      ref={ringRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[40] h-7 w-7 rounded-full opacity-0"
      style={{
        border: "1.5px solid var(--water-paper)",
        boxShadow: "0 0 6px color-mix(in srgb, var(--water-paper) 55%, transparent)",
        transition: "opacity 180ms ease",
      }}
    />
  );
}
