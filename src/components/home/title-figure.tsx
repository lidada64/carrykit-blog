"use client";

import { forwardRef, type CSSProperties } from "react";
import { DiscoBall } from "./disco-ball";
import { GlyphCarousel } from "./glyph-carousel";

/**
 * TitleFigure —— 主标题「Welcome / T[O] / CarryKit」的三行居中呈现
 * (布局见 idea/disco_ball_animation_feasibility.md 2026.8.24 更新)。
 *
 * 排版改为**真实文字**(字体 IM Fell English SC,古典衬线小型大写,
 * 挂在 --font-title / font-title 工具类上),弃用此前的字形轮廓 SVG 方案。
 * 中行「TO」的字母 O 由 DiscoBall 充当:以 em 尺寸内联,随字号等比缩放;
 * 灯球的星环/光晕溢出行盒是刻意效果(穿插于上下行之间)。
 *
 * 宽度交给外部 className;forwardRef 暴露根 div(留作日后测量标题盒之用)。
 */
export interface TitleFigureProps {
  /** 灯球自转一圈时长(秒) */
  spinDuration?: number;
  /** 星环旋转一圈时长(秒) */
  ringDuration?: number;
  /** 发光强度 0–1 */
  glow?: number;
  className?: string;
  style?: CSSProperties;
}

export const TitleFigure = forwardRef<HTMLDivElement, TitleFigureProps>(
  function TitleFigure(
    { spinDuration = 7, ringDuration = 14, glow = 1, className, style },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={[
          "leading-[0.92]",
          "font-title font-normal tracking-[0.02em] [color:var(--foreground)]",
          "text-[clamp(3.5rem,16vw,14rem)]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={style}
      >
        {/* 无障碍:图形标题读作完整句;各视觉块 aria-hidden */}
        <h1 className="sr-only">welcome to carrykit</h1>

        {/* Welcome T[O] + 轮播标点:一行相连。灯球 O 紧接 T、随组内字号缩放;
            球右侧 ":"/">"/"?" 轮播 SVG 平衡左重的视觉重心。整组钉在左上。 */}
        <div
          aria-hidden
          className="absolute left-[4vw] top-[14vh] flex -translate-y-1/2 items-center gap-[0.18em] whitespace-nowrap text-[0.5em]"
        >
          {/* 与左上导航 logo「CarryKit」同款字体 Girassol(font-display) */}
          <span className="font-display tracking-[0.12em]">Welcome T</span>
          <DiscoBall
            size="0.74em"
            spinDuration={spinDuration}
            ringDuration={ringDuration}
            glow={glow}
          />
          <GlyphCarousel className="h-[0.72em] w-[0.44em]" />
        </div>

        {/* CarryKit:屏幕居中 */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 italic underline decoration-[0.02em] underline-offset-[0.08em]"
        >
          CarryKit
        </span>
      </div>
    );
  },
);
