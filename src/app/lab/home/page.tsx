"use client";

import { HomeScene } from "@/components/lab/home-scene";
import { RingCursor } from "@/components/lab/ring-cursor";

/**
 * /lab/home —— 极简 Hero + 右下角"无限自嵌套"原型(复刻 Figma "page",不在站点导航内)。
 *
 * 舞台把一个干净的 16:9 帧 letterbox 居中(让 Figma 比例精确对应),再交给
 * 递归自相似组件 HomeScene(见其文件头)。帧外留白同 --background,无黑边。
 * 验证满意后再决定是否替换线上主页 DiscoHero。
 */
export default function LabHomePage() {
  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
      <div className="aspect-[16/9] max-h-full w-full max-w-[calc(100vh*16/9)]">
        <HomeScene depth={0} showCampfire />
      </div>
      <RingCursor />
    </main>
  );
}
