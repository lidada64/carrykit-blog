"use client";

import { useRef } from "react";
import { HomeScene } from "@/components/lab/home-scene";
import { CursorMirror } from "@/components/lab/cursor-mirror";

/**
 * /lab/home —— 极简 Hero + 右下角"无限自嵌套"原型(复刻 Figma "page",不在站点导航内)。
 *
 * 舞台把一个干净的 16:9 帧 letterbox 居中(让 Figma 比例精确对应),再交给递归自相似
 * 组件 HomeScene。frame 标 `group/frame` 并挂 CSS 变量/data 属性,由 CursorMirror 驱动
 * → 光标与选择镜像进每一层嵌套(见两组件文件头)。帧外留白同 --background,无黑边。
 */
export default function LabHomePage() {
  const frameRef = useRef<HTMLDivElement>(null);

  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
      <div
        ref={frameRef}
        data-active="0"
        className="group/frame aspect-[16/9] max-h-full w-full max-w-[calc(100vh*16/9)]"
      >
        <HomeScene depth={0} showCampfire />
      </div>
      <CursorMirror frameRef={frameRef} />
    </main>
  );
}
