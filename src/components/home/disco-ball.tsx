"use client";

import { forwardRef, type CSSProperties } from "react";
import styles from "./disco-ball.module.css";

/**
 * DiscoBall —— 迪斯科灯球「接缝件」(方案 C 预览替身)。
 *
 * 【复用接口 / 替换契约】本组件对外只暴露下列 CSS 变量:
 *   --disco-size            基础直径(px,布局尺寸,不参与动画)
 *   --disco-scale           缩放(HR-4 缩小 / HR-8 咬合;GSAP 运行时覆写)
 *   --disco-glow            发光强度 0–1(HR-3 渐亮;GSAP 覆写)
 *   --disco-spin-duration   球自转一圈时长(HR-6 滚动变速;GSAP 覆写)
 *   --disco-ring-duration   星环旋转时长(HR-6 独立变速)
 *
 * 编排层(disco-hero / GSAP 时间线)只读写这些变量,永不关心内部是
 * 「CSS 球」还是「Blender 序列」。将来接入 docs/blender-assets.md 的
 * B-2 `ball-loop` / B-3 `ring-loop` 时,替换本文件内部渲染、保持同一组
 * props 与 CSS 变量即可无痛升级(跨页复用如 radar 亦复用此接口)。
 */
export interface DiscoBallProps {
  /**
   * 基础直径。number → px;string → 原样作 CSS 长度(如 "0.8em" 让球随字号缩放,
   * 充当标题字母 O 时用)。默认 240。缩放动画请用 scale,勿改此值。
   */
  size?: number | string;
  /** 自转一圈时长(秒),越小越快。默认 8 */
  spinDuration?: number;
  /** 星环旋转一圈时长(秒)。默认 12 */
  ringDuration?: number;
  /** 是否显示星环(HR-5 之前传 false)。默认 true */
  showRing?: boolean;
  /** 发光强度 0–1。默认 1 */
  glow?: number;
  /** 缩放倍数。默认 1 */
  scale?: number;
  className?: string;
  style?: CSSProperties;
}

/** CSS 变量契约的类型化写法(允许自定义属性进 style) */
type DiscoVars = CSSProperties & Record<`--disco-${string}`, string | number>;

export const DiscoBall = forwardRef<HTMLDivElement, DiscoBallProps>(
  function DiscoBall(
    {
      size = 240,
      spinDuration = 8,
      ringDuration = 12,
      showRing = true,
      glow = 1,
      scale = 1,
      className,
      style,
    },
    ref,
  ) {
    const vars: DiscoVars = {
      "--disco-size": typeof size === "number" ? `${size}px` : size,
      "--disco-spin-duration": `${spinDuration}s`,
      "--disco-ring-duration": `${ringDuration}s`,
      "--disco-glow": glow,
      "--disco-scale": scale,
      ...style,
    };

    return (
      <div
        ref={ref}
        aria-hidden
        className={[styles.stage, className].filter(Boolean).join(" ")}
        style={vars}
      >
        <span className={styles.glow} />
        {showRing && <span className={styles.ring} />}
        <span className={styles.ball}>
          <span className={styles.facets} />
          <span className={styles.specular} />
        </span>
      </div>
    );
  },
);
