"use client";

import { type CSSProperties } from "react";
import styles from "./broadcast-wall.module.css";

/**
 * BroadcastWall —— 主页背景播报文字墙(HR-BG,docs/homepage-animation-plan.md)。
 *
 * "CARRYKIT IS NOT JUST" 密集平铺、隔行反向无缝横滚,叠在标题之后(z-0)。
 * 标题区的清空改由 disco-hero「底片层」以背景色描边按字形盖掉(见 disco-hero),
 * 本层只负责铺满整段、不再自裁。纯装饰层(aria-hidden)。
 */
export interface BroadcastWallProps {
  /** 播报语。默认 "CARRYKIT IS NOT JUST" */
  phrase?: string;
  /** 平铺行数(纵向)。默认 14 */
  rows?: number;
  /** 单份内每行重复短语次数(需足够撑满视口宽)。默认 8 */
  repeat?: number;
  /** 整层透明度 0–1。默认 0.12 */
  opacity?: number;
  /** 单行滚动一轮时长(秒),越小越快。默认 70(缓慢) */
  speed?: number;
  className?: string;
  style?: CSSProperties;
}

type BroadcastVars = CSSProperties & Record<`--bw-${string}`, string | number>;

export function BroadcastWall({
  phrase = "CARRYKIT IS NOT JUST",
  rows = 14,
  repeat = 8,
  opacity = 0.12,
  speed = 70,
  className,
  style,
}: BroadcastWallProps) {
  const vars: BroadcastVars = {
    "--bw-opacity": opacity,
    "--bw-speed": `${speed}s`,
    ...style,
  };

    // 单份内容:短语重复 repeat 次,用普通空格连接(与短语内部词间距一致),
    // 末尾再补一个空格 → 两份拼接的接缝间距也等于词间距(见 .copy white-space: pre)。
    const line = `${Array.from({ length: repeat }, () => phrase).join(" ")} `;

  return (
    <div
      aria-hidden
      className={[styles.wall, className].filter(Boolean).join(" ")}
      style={vars}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className={[styles.row, r % 2 === 1 ? styles.rowReverse : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {/* 隔行错位:负 delay 让相邻行起始相位不同,避免竖向对齐成网格 */}
          <div
            className={styles.track}
            style={{ animationDelay: `${-(r * 3.1)}s` }}
          >
            {/* 两份等长内容 → 平移 -50% 无缝循环 */}
            <span className={styles.copy}>{line}</span>
            <span className={styles.copy}>{line}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
