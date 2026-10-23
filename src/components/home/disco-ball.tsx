"use client";

import { forwardRef, useEffect, useRef, useState, type CSSProperties } from "react";
import orbMeta from "../../../public/orb/orb-loop.json";
import styles from "./disco-ball.module.css";

/**
 * DiscoBall —— 迪斯科灯球。
 *
 * 【复用接口 / 替换契约】本组件对外只暴露下列 CSS 变量:
 *   --disco-size            基础直径(px,布局尺寸,不参与动画)
 *   --disco-scale           缩放(HR-4 缩小 / HR-8 咬合;GSAP 运行时覆写)
 *   --disco-glow            发光强度 0–1(HR-3 渐亮;GSAP 覆写)
 *   --disco-spin-duration   球自转一圈时长(HR-6 滚动变速;GSAP 覆写)
 *   --disco-ring-duration   星环旋转一圈时长(HR-6 独立变速)
 *
 * 编排层(disco-hero / GSAP 时间线)只读写这些变量,永不关心内部怎么画。
 *
 * ── 内部实现:B-2 `ball-loop` 预渲染序列(2026-09) ──────────────────────
 * 原来是纯 CSS 替身。现在球体换成 Blender 出的 48 帧精灵图,按
 * `blender/orb-build.py` 建模、`scripts/orb-dither.mjs` 量化、
 * `scripts/orb-pack.mjs` 打包。黑白配比与纬度分布是照参考图**量**出来的
 * (抖动后各纬度带 RMS 2.3 个百分点)。星环与光晕仍是 CSS 替身,归 B-3。
 *
 * ── 为什么精灵图只存掩码 ────────────────────────────────────────────────
 * 水面每帧从 `:root` 读 `--water-ink` / `--water-paper`,主题一换水跟着换。
 * 灯球要是把色值烤进 PNG,主题切换时水变了球不变,两层立刻不是同一种材质。
 * 所以 PNG 只存「哪些像素是纸色」的拓扑,颜色交给 CSS:
 *   底层 `.disc`  —— `--water-ink` 的圆(球正对镜头,轮廓就是个圆)
 *   上层 `.paper` —— `--water-paper` 实心块 + 这张掩码
 *
 * ── 自转为什么用 rAF 而不是 CSS 动画 ────────────────────────────────────
 * 精灵图是 8×6 的**二维**网格,单条 CSS 动画没法同时步进两个轴
 * (`mask-position-x/y` 不是可移植的可动画属性)。写 48 条关键帧能行,
 * 但那会把帧数硬编码进 CSS,换一次资产要改两处。
 * rAF 每帧只写一个 `maskPosition` 字符串,而且**帧号没变就不写** ——
 * 每秒实际写入 = 转速 × 192,8 秒一圈时是 24 次/秒。
 * 转速仍然读 `--disco-spin-duration`:读的是 stage 的**行内样式**
 * (字符串查表),不是 `getComputedStyle`,不触发强制回流。
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
type DiscoVars = CSSProperties & Record<`--disco-${string}` | `--orb-${string}`, string | number>;

const SHEET = "/orb/orb-loop.png";
const STILL = "/orb/orb-still.png";

/** 整圈转过多少个精灵帧。球是 4 重对称的,一张图只覆盖 90°,所以要乘 360/loopDeg。 */
const FRAMES_PER_TURN = orbMeta.count * (360 / orbMeta.loopDeg);

/**
 * 帧号 → `mask-position`。
 * `mask-size` 取 `cols*100% rows*100%`,于是一帧正好铺满元素;此时百分比定位的
 * 含义是「把贴图的 p 处对到容器的 p 处」,要露出第 c 列就得 p = c/(cols−1)。
 */
function maskPos(i: number): string {
  const col = i % orbMeta.cols;
  const row = Math.floor(i / orbMeta.cols);
  const x = orbMeta.cols > 1 ? (100 * col) / (orbMeta.cols - 1) : 0;
  const y = orbMeta.rows > 1 ? (100 * row) / (orbMeta.rows - 1) : 0;
  return `${x}% ${y}%`;
}

/** 从行内样式读 `--disco-spin-duration`(GSAP 会覆写它)。读不到返回 null。 */
function inlineSpin(el: HTMLElement | null): number | null {
  if (!el) return null;
  const raw = el.style.getPropertyValue("--disco-spin-duration").trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
    const stageRef = useRef<HTMLDivElement | null>(null);
    const paperRef = useRef<HTMLSpanElement | null>(null);
    /** 精灵图到位前先挂静帧(6 KB 对 239 KB),首屏不等 */
    const [sheetReady, setSheetReady] = useState(false);

    useEffect(() => {
      const img = new Image();
      img.onload = () => setSheetReady(true);
      img.src = SHEET;
      /* 已经在缓存里时 onload 仍会触发(decode 之后),不需要额外补 complete 判断;
       * 真失败了就一直用静帧 —— 球不转,但不会变成空洞。 */
      return () => {
        img.onload = null;
      };
    }, []);

    useEffect(() => {
      const el = paperRef.current;
      if (!el || !sheetReady) return;
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      let raf = 0;
      let start = 0;
      let last = -1;
      /** 「用户的时钟」:暂停/切走标签页时 rAF 不跑,球不会跳帧 */
      const tick = (ms: number): void => {
        raf = requestAnimationFrame(tick);
        if (start === 0) start = ms;
        const dur = inlineSpin(stageRef.current) ?? spinDuration;
        const turns = (ms - start) / (dur * 1000);
        const i = ((Math.floor(turns * FRAMES_PER_TURN) % orbMeta.count) + orbMeta.count) % orbMeta.count;
        if (i === last) return;          // 帧号没变就一个字节都不写
        last = i;
        const p = maskPos(i);
        el.style.maskPosition = p;
        el.style.webkitMaskPosition = p;
      };
      const apply = (): void => {
        cancelAnimationFrame(raf);
        raf = 0;
        if (mq.matches) {
          /* reduced-motion 红线:停转,停在第 0 帧 */
          last = 0;
          const p = maskPos(0);
          el.style.maskPosition = p;
          el.style.webkitMaskPosition = p;
          return;
        }
        start = 0;
        last = -1;
        raf = requestAnimationFrame(tick);
      };
      apply();
      mq.addEventListener("change", apply);
      return () => {
        mq.removeEventListener("change", apply);
        if (raf) cancelAnimationFrame(raf);
      };
    }, [sheetReady, spinDuration]);

    const vars: DiscoVars = {
      "--disco-size": typeof size === "number" ? `${size}px` : size,
      "--disco-spin-duration": `${spinDuration}s`,
      "--disco-ring-duration": `${ringDuration}s`,
      "--disco-glow": glow,
      "--disco-scale": scale,
      /* 精灵图的几何:球在帧里不是铺满的,外面还有一圈透明边。
       * 这几个数由 scripts/orb-pack.mjs 量出来写进 orb-loop.json,不手抄。 */
      "--orb-disc": `${(200 * orbMeta.ball.r) / orbMeta.frame}%`,
      "--orb-cx": `${(100 * orbMeta.ball.cx) / orbMeta.frame}%`,
      "--orb-cy": `${(100 * orbMeta.ball.cy) / orbMeta.frame}%`,
      "--orb-cols": `${orbMeta.cols * 100}%`,
      "--orb-rows": `${orbMeta.rows * 100}%`,
      ...style,
    };

    return (
      <div
        ref={(node) => {
          stageRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        aria-hidden
        className={[styles.stage, className].filter(Boolean).join(" ")}
        style={vars}
      >
        <span className={styles.glow} />
        {showRing && <span className={styles.ring} />}
        <span className={styles.ball}>
          <span className={styles.disc} />
          <span
            ref={paperRef}
            className={styles.paper}
            style={{
              maskImage: `url(${sheetReady ? SHEET : STILL})`,
              WebkitMaskImage: `url(${sheetReady ? SHEET : STILL})`,
              maskSize: sheetReady ? "var(--orb-cols) var(--orb-rows)" : "100% 100%",
              WebkitMaskSize: sheetReady ? "var(--orb-cols) var(--orb-rows)" : "100% 100%",
            }}
          />
        </span>
      </div>
    );
  },
);
