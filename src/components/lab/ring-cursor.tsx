"use client";

import { useEffect, useRef, useState } from "react";

/**
 * RingCursor —— /lab/home 的自定义"选取器"光标:一个跟随鼠标的圆环,滑到可交互
 * 元素([data-hoverable])上时放大并微填充。位置用 rAF 缓动跟随(拖尾),transition
 * 只作用于尺寸/填充,不作用于 transform(否则与逐帧 transform 打架)。
 *
 * 仅在精确指针(鼠标)且非 reduced-motion 时启用;触屏/减弱动画时不接管原生光标。
 * 启用期间用注入样式把全局光标设为 none(含文字 I-beam「工」字、链接手型),
 * 整页只显示圆环;卸载时移除样式还原。
 *
 * 注:两个 effect 分离——先探测能力 setEnabled(触发渲染出 ring 节点),再在
 * ring 已挂载后绑定监听。合并会导致首个 effect 读到 ringRef=null 而直接 return。
 */
export function RingCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fine && !reduce) setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const ring = ringRef.current;
    if (!ring) return;

    // 隐藏原生光标(含文字 I-beam / 链接手型),整页仅显示圆环
    const style = document.createElement("style");
    style.textContent = "*{cursor:none !important;}";
    document.head.appendChild(style);

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let hovering = false;
    let raf = 0;

    ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const target = e.target as Element | null;
      const h = !!target?.closest?.("[data-hoverable]");
      if (h !== hovering) {
        hovering = h;
        ring.dataset.hover = h ? "1" : "0";
      }
    };
    const tick = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      style.remove();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={ringRef}
      aria-hidden
      data-hover="0"
      style={{ willChange: "transform" }}
      className="pointer-events-none fixed left-0 top-0 z-50 h-8 w-8 rounded-full border border-foreground opacity-80 transition-[width,height,background-color] duration-200 ease-out data-[hover=1]:h-14 data-[hover=1]:w-14 data-[hover=1]:bg-foreground/10"
    />
  );
}
