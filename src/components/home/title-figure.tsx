"use client";

import { forwardRef, type CSSProperties } from "react";
import { DiscoBall } from "./disco-ball";
import {
  BALL,
  CARRY_PATH,
  CARRY_TRANSFORM,
  TITLE_VIEWBOX,
  WELCOME_PATH,
} from "./title-paths";

/**
 * TitleFigure —— 主标题「welcome T[O] carrykit」的矢量呈现。
 *
 * 内联两段**导出的字形轮廓**(images/svg → title-paths.ts),像素级还原设计稿;
 * 灯球充当字母 O:SVG 里**不画 O**,由 DiscoBall 按同一 viewBox 归一化坐标绝对
 * 叠放在 O 位。整体作为单个 SVG 等比缩放,DiscoBall 以 % 定位随之缩放。
 *
 * 宽度完全交给外部 className(内部不设 width,避免工具类冲突导致标题盒失控)。
 * forwardRef 暴露根 div(留作将来背景绕排字幕测量标题盒之用)。
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
        className={["relative", className].filter(Boolean).join(" ")}
        style={{ aspectRatio: `${TITLE_VIEWBOX.w} / ${TITLE_VIEWBOX.h}`, ...style }}
      >
        {/* 无障碍:图形标题读作完整句;SVG/球均 aria-hidden */}
        <h1 className="sr-only">welcome to carrykit</h1>

        {/* 字形层:前景色实字,O 位留空由灯球补上 */}
        <svg
          aria-hidden
          viewBox={`0 0 ${TITLE_VIEWBOX.w} ${TITLE_VIEWBOX.h}`}
          className="block h-auto w-full [color:var(--foreground)]"
          fill="currentColor"
        >
          <path d={WELCOME_PATH} />
          <path
            d={CARRY_PATH}
            transform={`translate(${CARRY_TRANSFORM.x},${CARRY_TRANSFORM.y})`}
          />
        </svg>

        {/* 灯球 O:按 viewBox 归一化坐标以 % 叠放,随 SVG 等比缩放 */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${BALL.cxPct * 100}%`,
            top: `${BALL.cyPct * 100}%`,
            width: `${BALL.dPct * 100}%`,
            aspectRatio: "1",
          }}
        >
          <DiscoBall
            size="100%"
            spinDuration={spinDuration}
            ringDuration={ringDuration}
            glow={glow}
          />
        </div>
      </div>
    );
  },
);
