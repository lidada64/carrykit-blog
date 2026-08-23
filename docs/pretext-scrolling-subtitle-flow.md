# 背景字幕「绕标题轮廓流排」设计(pretext 方案) — 可复用归档

> **状态**:2026-08-23 原型完成并验证编译/SSR,但因共用引擎有布局 bug(见 §6)
> 且需进一步打磨,**已从主线回退**;主页暂收敛为「只有标题、无字幕」。
> 本文件**完整保留设计与源码**,供日后重启或在别处(如 radar 页)复用。
> 相关依赖记录见 [`dev-overrides.md`](dev-overrides.md) DV-2。

---

## 1. 一句话定位

背景播报字幕(HR-BG,"CARRYKIT IS NOT JUST" 密铺)不再用「盖一层背景色遮罩」
挖出标题,而是让**字幕文字真正绕开标题轮廓流排**——凡与标题纵向重叠的行,在标题
**当行的 x 占位**处断开、绕过去。字幕天生不进标题区、严丝合缝贴合字体外形,
所有文字可读,无突兀色块。

## 2. 为什么用绕排,而不是遮罩

演进过程(踩过的坑):

1. **梯形遮罩**:一块与字体无关的死板色块盖住字幕 → 像打码条,**丑,弃**。
2. **逐字形挖空(底片法)**:用背景色按字形描边盖字幕 → 字幕从 e/o/a 的孔洞、
   字缝里漏出来,**不干净**。
3. **v2b 实心剪影遮罩**:形态学闭运算填实孔洞 + 纵向拔高把小型大写字母顶到
   大写线 + clip 齐字高 → 干净且贴字,但仍是「盖」,且与横滚跑马灯冲突
   (滚动文字穿过缺口本质是剪切活)。此法的烘焙滤镜见 §5 的 bake 脚本,**保留可用**。
4. **pretext 绕排(本方案)**:字幕按标题每行占位断开绕排,不盖不切,最优雅。
   代价:绕排的是**排好版的静态文字**,与「相对标题移动」的动画天然矛盾
   (任何相对位移都要逐帧重排)。

## 3. 架构总览(三块)

```
① 离线烘焙排除剖面        ② canvas 绕排引擎              ③ 运动
scripts/bake-*.mjs   →   PretextFlowWall (canvas)   →   static / parallax / scroll
  ↓ 产物                    ↑ 读                          ↑ disco-hero 施加
title-silhouette.generated.ts  (每行标题 x 占位,归一化)
  ↑ 同一 path/几何 ↓
TitleFigure (矢量标题 SVG + 灯球 O)
```

- **标题与排除剖面共用同一几何**:标题按固定 viewBox 组合(两段字形 + 灯球),
  bake 脚本对同一组合做 v2b 处理后**逐行扫描**得到归一化占位区间;运行时按实测
  标题盒把区间缩放到屏幕坐标。改标题只需重跑 bake。
- **pretext 只做文本测量/断行**:`prepareWithSegments` 预处理一次,循环
  `layoutNextLineRange(prepared, cursor, 当前空档宽)` 逐段断行,`materializeLineRange`
  取文字画到 canvas。全程 Canvas measureText,不触发 DOM reflow。

## 4. 关键坑与教训

- **`w-full` 宽度冲突(本次 bug 根因,复用时务必避开)**:`TitleFigure` 根节点
  内部写了 `w-full`,又被外部传入的 `w-[min(92vw,1100px)]` 覆盖——两个 width
  工具类冲突,谁赢取决于生成 CSS 的顺序,**标题盒实宽不可控**。而绕排排除区按
  标题盒算,标题盒一错,空洞位置/大小全错(表现:三版雷同 + 右侧大片空白)。
  **修法**:组件内部不要设 width,宽度完全交给外部 className。
- **字幕字体只在 canvas 用,无 DOM 触发加载**:`document.fonts.ready` 可能在
  Anton SC 未加载时就 resolve,导致用回退字体测量 → 断行/绕排错位。**必须显式
  `document.fonts.load('400 24px <family>')` 后再排**。canvas 字体族从
  `--font-broadcast`(next/font 变量)读。
- **DPR**:`canvas.width = W*dpr`,`style.width = W px`,`ctx.setTransform(dpr,…)`,
  以 CSS px 坐标绘制;dpr 上限 2 省显存。
- **窄缝处理**:窄到放不下整词的空档(如 W 左斜边内的三角)跳过、不推进 cursor,
  留给更宽段落画;避免长词溢出或死循环。
- **主题变色**:`MutationObserver` 监听 `<html>` class/data-theme/style,变了重绘。
- **v2b 烘焙滤镜**:闭运算(dilate→erode)填孔洞;`feMorphology dilate radius="0 N"`
  只纵向拔高把矮字母顶到大写线;外层 `clipPath` 齐字高;灯球单独作圆形排除
  (不拔成竖条)。

## 5. 依赖 & 参数

- **依赖**:`@chenglou/pretext`(0.0.8,纯 JS 文本测量;早期版本,API 可能变)。
  烘焙用 `sharp`(已在 devDeps)。
- **可调参数**:
  - 绕排:`haloH/haloV`(留白)、`fs = W/42`(字号)、`opacity`、`speed`(px/s)。
  - 烘焙:`CLOSE_R`(贴字松紧)、`VLIFT`(拔高)、`CAP_TOP/BASE_LINE`(齐字高带)、
    `BALL_R/GAP_*`(球径与间距);改完 `node scripts/bake-title-silhouette.mjs`。

## 6. 复用步骤

1. `npm i @chenglou/pretext`。
2. 放入两段字形 SVG(或任意标题几何),按 §7.1 组合 + 跑 bake 生成剖面。
3. 落 `TitleFigure`(§7.2,**注意去掉内部 w-full**)+ `PretextFlowWall`(§7.3)。
4. 容器:section `relative`;wall `absolute inset-0`(测标题盒);title `relative z-10`。
5. static 先跑通对齐,再按需接 parallax(整体位移,标题+墙同容器,排除关系不变)
   或 scroll(空档内横滚)。

---

## 7. 完整源码

### 7.1 烘焙脚本 `scripts/bake-title-silhouette.mjs`

```js
// @ts-check
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SVG_DIR = path.join(ROOT, "images", "svg");
const OUT = path.join(ROOT, "src", "components", "home", "title-silhouette.generated.ts");

function grabPath(file) {
  const s = fs.readFileSync(path.join(SVG_DIR, file), "utf8");
  const m = s.match(/ d="([^"]+)"/);
  if (!m) throw new Error(`no path d in ${file}`);
  return m[1];
}

const D_WELCOME = grabPath("WelcomE T.svg"); // viewBox 792 x 148
const D_CARRY = grabPath("CarrykiT.svg");    // viewBox 635 x 144
const WELCOME_W = 792, CARRY_W = 635, VB_H = 148, CARRY_DY = 4;
const BALL_R = 70, GAP_L = 40, GAP_R = 40;
const BALL_CX = WELCOME_W + GAP_L + BALL_R;  // 902
const BALL_CY = 73.5;
const CARRY_OX = BALL_CX + BALL_R + GAP_R;    // 1012
const VB_W = CARRY_OX + CARRY_W;              // 1647
const CAP_TOP = 3, BASE_LINE = 145;
const CLOSE_R = 20, VLIFT = 80;
const SCALE = 2;
const PX_W = Math.round(VB_W * SCALE), PX_H = Math.round(VB_H * SCALE);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX_W}" height="${PX_H}" viewBox="0 0 ${VB_W} ${VB_H}">
  <defs>
    <filter id="flat" x="-15%" y="-90%" width="130%" height="280%">
      <feMorphology operator="dilate" radius="${CLOSE_R}" result="d1"/>
      <feMorphology in="d1" operator="erode" radius="${CLOSE_R}" result="closed"/>
      <feMorphology in="closed" operator="dilate" radius="0 ${VLIFT}"/>
    </filter>
    <clipPath id="band"><rect x="-400" y="${CAP_TOP}" width="${VB_W + 800}" height="${BASE_LINE - CAP_TOP}"/></clipPath>
  </defs>
  <rect width="100%" height="100%" fill="#000"/>
  <g clip-path="url(#band)"><g filter="url(#flat)">
    <path d="${D_WELCOME}" fill="#fff"/>
    <path d="${D_CARRY}" transform="translate(${CARRY_OX},${CARRY_DY})" fill="#fff"/>
  </g></g>
  <circle cx="${BALL_CX}" cy="${BALL_CY}" r="${BALL_R}" fill="#fff"/>
</svg>`;

const main = async () => {
  const { data, info } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const iw = info.width, ih = info.height;
  const rows = [];
  for (let y = 0; y < ih; y++) {
    const runs = []; let s = -1;
    for (let x = 0; x < iw; x++) {
      const on = data[y * iw + x] > 128;
      if (on && s < 0) s = x;
      else if (!on && s >= 0) { runs.push([s / iw, (x - 1) / iw]); s = -1; }
    }
    if (s >= 0) runs.push([s / iw, (iw - 1) / iw]);
    rows.push(runs);
  }
  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  const rowsLit = rows.map((r) => "[" + r.map(([a, b]) => `[${r4(a)},${r4(b)}]`).join(",") + "]").join(",\n  ");
  const out = `// AUTO-GENERATED — DO NOT EDIT. 重新生成:node scripts/bake-title-silhouette.mjs
/* eslint-disable */
export const TITLE_VIEWBOX = { w: ${VB_W}, h: ${VB_H} } as const;
export const WELCOME_PATH = ${JSON.stringify(D_WELCOME)};
export const CARRY_PATH = ${JSON.stringify(D_CARRY)};
export const CARRY_TRANSFORM = { x: ${CARRY_OX}, y: ${CARRY_DY} } as const;
export const BALL = { cxPct: ${r4(BALL_CX / VB_W)}, cyPct: ${r4(BALL_CY / VB_H)}, dPct: ${r4((BALL_R * 2) / VB_W)} } as const;
export const SILHOUETTE_ROWS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  ${rowsLit},
];
`;
  fs.writeFileSync(OUT, out);
  console.log(`baked ${rows.length} rows → ${path.relative(ROOT, OUT)}`);
};
main();
```

> 产物 `title-silhouette.generated.ts` 导出:`TITLE_VIEWBOX` / `WELCOME_PATH` /
> `CARRY_PATH` / `CARRY_TRANSFORM` / `BALL`(归一化 %)/ `SILHOUETTE_ROWS`(296 行占位)。

### 7.2 矢量标题 `TitleFigure`（复用时删掉内部 `w-full`,见 §4)

```tsx
"use client";
import { forwardRef, type CSSProperties } from "react";
import { DiscoBall } from "./disco-ball";
import { BALL, CARRY_PATH, CARRY_TRANSFORM, TITLE_VIEWBOX, WELCOME_PATH } from "./title-silhouette.generated";

export interface TitleFigureProps {
  spinDuration?: number; ringDuration?: number; glow?: number;
  className?: string; style?: CSSProperties;
}

export const TitleFigure = forwardRef<HTMLDivElement, TitleFigureProps>(
  function TitleFigure({ spinDuration = 7, ringDuration = 14, glow = 1, className, style }, ref) {
    return (
      <div
        ref={ref}
        className={["relative", className].filter(Boolean).join(" ")}
        style={{ aspectRatio: `${TITLE_VIEWBOX.w} / ${TITLE_VIEWBOX.h}`, ...style }}
      >
        <h1 className="sr-only">welcome to carrykit</h1>
        <svg aria-hidden viewBox={`0 0 ${TITLE_VIEWBOX.w} ${TITLE_VIEWBOX.h}`}
             className="block h-auto w-full [color:var(--foreground)]" fill="currentColor">
          <path d={WELCOME_PATH} />
          <path d={CARRY_PATH} transform={`translate(${CARRY_TRANSFORM.x},${CARRY_TRANSFORM.y})`} />
        </svg>
        <div className="absolute -translate-x-1/2 -translate-y-1/2"
             style={{ left: `${BALL.cxPct * 100}%`, top: `${BALL.cyPct * 100}%`, width: `${BALL.dPct * 100}%`, aspectRatio: "1" }}>
          <DiscoBall size="100%" spinDuration={spinDuration} ringDuration={ringDuration} glow={glow} />
        </div>
      </div>
    );
  },
);
```

### 7.3 绕排引擎 `PretextFlowWall`

```tsx
"use client";
import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { layoutNextLineRange, materializeLineRange, prepareWithSegments, type LayoutCursor } from "@chenglou/pretext";
import { SILHOUETTE_ROWS } from "./title-silhouette.generated";

export type FlowMotion = "static" | "parallax" | "scroll";
export interface PretextFlowWallProps {
  titleRef: RefObject<HTMLDivElement | null>;
  phrase?: string; motion?: FlowMotion; opacity?: number; speed?: number;
  className?: string; style?: CSSProperties;
}
type Interval = [number, number];

function unionIntervals(list: Interval[]): Interval[] {
  if (list.length === 0) return [];
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [sorted[0].slice() as Interval];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i], last = out[out.length - 1];
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur.slice() as Interval);
  }
  return out;
}
function freeSegments(excl: Interval[], W: number): Interval[] {
  const segs: Interval[] = []; let cur = 0;
  for (const [a, b] of excl) {
    const A = Math.max(0, a), B = Math.min(W, b);
    if (A > cur) segs.push([cur, Math.min(A, W)]);
    cur = Math.max(cur, B);
  }
  if (cur < W) segs.push([cur, W]);
  return segs.filter(([a, b]) => b - a > 3);
}

export function PretextFlowWall({
  titleRef, phrase = "CARRYKIT IS NOT JUST", motion = "static",
  opacity = 0.14, speed = 40, className, style,
}: PretextFlowWallProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current, title = titleRef.current;
    if (!host || !canvas || !title) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = motion === "scroll" && !reduce;
    let raf = 0, disposed = false;

    type State = {
      W: number; H: number; fs: number; lh: number; color: string; font: string;
      prepared: ReturnType<typeof prepareWithSegments>; tileW: number;
      tx0: number; ty0: number; tw: number; th: number; haloH: number; haloV: number;
    };
    let st: State | null = null;
    const readVar = (name: string, fb: string) => getComputedStyle(host).getPropertyValue(name).trim() || fb;

    const exclusionsAt = (rowTop: number, s: State): Interval[] => {
      const yA = rowTop - s.haloV, yB = rowTop + s.fs + s.haloV;
      if (yB < s.ty0 || yA > s.ty0 + s.th) return [];
      const len = SILHOUETTE_ROWS.length;
      const iA = Math.max(0, Math.floor(((yA - s.ty0) / s.th) * (len - 1)));
      const iB = Math.min(len - 1, Math.ceil(((yB - s.ty0) / s.th) * (len - 1)));
      const raw: Interval[] = [];
      for (let i = iA; i <= iB; i++)
        for (const [a, b] of SILHOUETTE_ROWS[i])
          raw.push([s.tx0 + a * s.tw - s.haloH, s.tx0 + b * s.tw + s.haloH]);
      return unionIntervals(raw);
    };

    const layout = () => {
      const hostRect = host.getBoundingClientRect(), titleRect = title.getBoundingClientRect();
      const W = Math.max(1, Math.round(hostRect.width)), H = Math.max(1, Math.round(hostRect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fs = Math.max(14, Math.min(52, W / 42)), lh = fs * 1.16;
      const family = readVar("--font-broadcast", "sans-serif"), color = readVar("--foreground", "#111");
      const font = `400 ${fs}px ${family}`, letterSpacing = fs * 0.06;
      ctx.font = font; ctx.textBaseline = "top";
      const tileW = ctx.measureText(`${phrase}   `).width + letterSpacing * (phrase.length + 3);
      const prepared = prepareWithSegments(`${phrase} `.repeat(600), font, { letterSpacing });
      st = {
        W, H, fs, lh, color, font, prepared, tileW,
        tx0: titleRect.left - hostRect.left, ty0: titleRect.top - hostRect.top,
        tw: titleRect.width, th: titleRect.height, haloH: fs * 0.42, haloV: fs * 0.18,
      };
    };

    const drawFlow = () => {
      const s = st; if (!s) return;
      ctx.clearRect(0, 0, s.W, s.H);
      ctx.globalAlpha = opacity; ctx.fillStyle = s.color; ctx.font = s.font; ctx.textBaseline = "top";
      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
      for (let rowTop = 0; rowTop < s.H; rowTop += s.lh) {
        for (const [x0, x1] of freeSegments(exclusionsAt(rowTop, s), s.W)) {
          const wSeg = x1 - x0;
          let range = layoutNextLineRange(s.prepared, cursor, wSeg);
          if (!range) { cursor = { segmentIndex: 0, graphemeIndex: 0 }; range = layoutNextLineRange(s.prepared, cursor, wSeg); }
          if (!range || range.width > wSeg + 0.5) continue;
          ctx.fillText(materializeLineRange(s.prepared, range).text, x0, rowTop);
          cursor = range.end;
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawScroll = (tMs: number) => {
      const s = st; if (!s) return;
      ctx.clearRect(0, 0, s.W, s.H);
      ctx.globalAlpha = opacity; ctx.fillStyle = s.color; ctx.font = s.font; ctx.textBaseline = "top";
      const tile = `${phrase}   `; let r = 0;
      for (let rowTop = 0; rowTop < s.H; rowTop += s.lh, r++) {
        const segs = freeSegments(exclusionsAt(rowTop, s), s.W);
        if (segs.length === 0) continue;
        const dir = r % 2 === 1 ? -1 : 1;
        const phase = ((((tMs / 1000) * speed * dir) % s.tileW) + s.tileW) % s.tileW;
        for (const [x0, x1] of segs) {
          ctx.save(); ctx.beginPath(); ctx.rect(x0, rowTop, x1 - x0, s.lh); ctx.clip();
          for (let x = x0 - phase; x < x1; x += s.tileW) ctx.fillText(tile, x, rowTop);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    };

    const frame = (t: number) => { if (disposed) return; drawScroll(t); raf = requestAnimationFrame(frame); };
    const render = () => { layout(); if (animate) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } else drawFlow(); };

    let ready = false;
    const kick = () => { if (disposed) return; ready = true; render(); };
    const family = readVar("--font-broadcast", "sans-serif");
    if (document.fonts?.load) document.fonts.load(`400 24px ${family}`).then(kick, kick); else kick();

    const ro = new ResizeObserver(() => ready && render());
    ro.observe(host); ro.observe(title);
    const mo = new MutationObserver(() => { if (ready && !animate) drawFlow(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });

    return () => { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); };
  }, [titleRef, phrase, motion, opacity, speed]);

  return (
    <div ref={hostRef} aria-hidden
         className={["pointer-events-none absolute inset-0 overflow-hidden", className].filter(Boolean).join(" ")}
         style={style}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
```

### 7.4 集成 `disco-hero`（三种运动 + parallax 漂移 CSS）

```tsx
"use client";
import { useRef } from "react";
import { PretextFlowWall, type FlowMotion } from "./pretext-flow-wall";
import { TitleFigure } from "./title-figure";
import styles from "./disco-hero.module.css";

const MOTION: FlowMotion = "static"; // 分支切换点:static | parallax | scroll

export function DiscoHero({ motion = MOTION }: { motion?: FlowMotion }) {
  const titleRef = useRef<HTMLDivElement>(null);
  return (
    <section className="relative mx-[calc(50%-50vw)] flex min-h-svh w-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className={["relative flex min-h-svh w-full items-center justify-center",
                       motion === "parallax" ? styles.floatWrap : ""].filter(Boolean).join(" ")}>
        <PretextFlowWall titleRef={titleRef} motion={motion} />
        <TitleFigure ref={titleRef} className="relative z-10 w-[min(92vw,1100px)]"
                     spinDuration={7} ringDuration={14} glow={1} />
      </div>
    </section>
  );
}
```

```css
/* disco-hero.module.css —— parallax:标题+字幕整体缓慢漂移(排除关系不变) */
.floatWrap { animation: heroFloat 9s ease-in-out infinite; will-change: transform; }
@keyframes heroFloat { 0%,100% { transform: translateY(-1.1%); } 50% { transform: translateY(1.1%); } }
@media (prefers-reduced-motion: reduce) { .floatWrap { animation: none; } }
```
