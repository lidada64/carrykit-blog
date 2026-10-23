"use client";

import { useEffect, useRef, useState } from "react";
import { WaterScene } from "@/components/lab/water/water-scene";
import type { WaterDirectorFlags } from "@/components/lab/water/water-director";
import { ParticleBurst } from "@/components/lab/particles/particle-burst";

/* ── /lab/sky-screen —— 粒子标题 · 点击爆开露出中央 3D 视频 · 长按倒流 ──
 *  分工:water shader(z-0)画夜空星场 + 中央挖空(open↑ 从标题形状渐变成视频矩形)+ 中央 3D 视频(图集);
 *  标题本身由独立可复用的 <ParticleBurst>(z-5)以**真粒子**呈现,每颗随机角度+力度,爆开=progress 0→1、
 *  倒流=1→0 沿原轨迹飞回。交互(z-10 热区):
 *    · 静止点击 → 爆开(open 0→1)+ 视频开始循环播放;
 *    · 爆开后单击 → 视频暂停/继续;
 *    · 爆开后鼠标长按 ≥2s → 倒流:粒子飞回重组 + 视频倒放 → 复位。 */

const HOME_FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false,
  clickImpulse: false,
  orbDrag: false,
};

const STAR_GAIN = 0.45; // 均匀星场增益
const STAR_DENSITY = 0.62; // 星场稀疏阈值(越大越稀)
const VIDEO_GAIN = 2.0; // 中央视频亮度(细形状要读清;也兼作闸门,缺图集时 water-scene 强钉 0)

const HOLD_MS = 2000; // 长按触发倒流的阈值(2 秒)

// ── 节奏(时间驱动)──
const EXPLODE_MS = 720; // 爆开时长(easeOutExpo:原点高速射出 → 减速漂停);放慢一点让「粒子拉成线条」的速度感看得清
/* 倒流分**两段串行**(用户要求:动画回溯完标题再回溯)。原来 open 单参数同驱粒子与视频,
 * 并行时标题重构比视频倒放快 —— 视频还没退完标题就已成形。拆成:
 *   段1 REWIND_VIDEO_MS:中央 3D 视频倒放回首帧,粒子**保持散开**;
 *   段2 REWIND_TITLE_MS:粒子飞回重构,视频**停在首帧**。 */
const REWIND_VIDEO_MS = 1300; // 段1:视频倒放回首帧。**拉长** → 加速档位变化更缓、更看得清换挡
const REWIND_TITLE_MS = 500; // 段2:标题粒子飞回重构(收尾加快)

const easeOutExpo = (u: number): number => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));

/** 倒流缓动 0→1(已飞回的比例)。**加速回溯**:速度从 1 倍渐渐升到 2^4=16 倍,到终点仍是最高速 → 骤停
 *  (用户要求「一开始一倍速,慢慢加速」;收尾部分速度更快)。
 *  末端骤停不残留拖影:速度线包络 env 是 progress 的纯函数,pN→0 时 env→0 仍收成点,完成时 setNonce 落定。 */
function rewindEase(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return (Math.pow(2, 4 * u) - 1) / 15;
}

const ATLAS_URL = "/orb/sky-screen.png";
const MANIFEST_URL = "/orb/sky-screen.json";

type Rect = readonly [number, number, number, number]; // left, top, w, h(屏幕 UV,top 从上量)

/** 中央区:水平居中、坐上部天空(垂直中心 0.32,避地平线辉光)。static=标题位置,open 后=视频矩形。 */
const SCREEN_CY = 0.4;
const SCREEN_H = 0.3;
const SCREEN_AR = 1.6;
function computeRect(w: number, h: number): Rect {
  const hUv = SCREEN_H;
  const wUv = (SCREEN_AR * SCREEN_H * h) / Math.max(w, 1);
  return [0.5 - wUv / 2, SCREEN_CY - hUv / 2, wUv, hUv];
}

/** 点击热区:比标题略宽的横带(覆盖整条 CarryKit)。固定在标题原位。 */
const HOT: Rect = [0.2, SCREEN_CY - 0.14, 0.6, 0.28];

const TITLE_FONT = (fs: number) => `italic ${fs}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-title").trim()}`;

/** 冷色回落(拿不到 CSS 变量时;≈ --water-paper 的冷调纸白)。 */
const PAPER_FALLBACK: readonly [number, number, number] = [0.9, 0.99, 0.99];

/** 读 `--water-paper`(与 water-scene 同源)→ 0..1 RGB。粒子用它 = 和星场/水面同一冷色纸调。 */
function readPaperRGB(): readonly [number, number, number] {
  if (typeof window === "undefined") return PAPER_FALLBACK;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--water-paper").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return PAPER_FALLBACK;
  return [
    parseInt(raw.slice(1, 3), 16) / 255,
    parseInt(raw.slice(3, 5), 16) / 255,
    parseInt(raw.slice(5, 7), 16) / 255,
  ];
}

/** water 遮罩(数据纹理):R = 中间挖空负空间(模糊加粗标题 → 给 overlay 粒子留干净暗底)。 */
function drawSkyMask(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const fs = Math.min(w * 0.11, h * 0.2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = TITLE_FONT(fs);
  ctx.save();
  ctx.filter = `blur(${Math.round(fs * 0.4)}px)`;
  ctx.fillStyle = "rgb(255,0,0)"; // R 通道
  ctx.fillText("CarryKit", w * 0.5, SCREEN_CY * h);
  ctx.fillText("CarryKit", w * 0.5, SCREEN_CY * h);
  ctx.restore();
}

/** overlay 粒子播种源:实心标题字形(不透明处 = 粒子)。与 water 遮罩同字体/位置。 */
function drawTitle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const fs = Math.min(w * 0.11, h * 0.2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = TITLE_FONT(fs);
  ctx.fillStyle = "#fff";
  ctx.fillText("CarryKit", w * 0.5, SCREEN_CY * h);
}

/* ── 水下隐藏字彩蛋(idea/灯球彩蛋.md;A 方案:night 暗墨、朝地平线压扁)──────────
 * 平常看不见;点灯球点亮灯球照度(orbLit>0)时,白光斑打在水面把字压成暗墨浮现。
 * 参数 = 验证台 /lab/water-text 的 night TUNE。字模贴图按**世界坐标**铺在水平面。 */
const HIDDEN_TEXT = "CarryKit is not just CarryKit";
// 往前拉近(minY 28→18)并拉长(height 12→32)，消除斜视角导致的极致纵向压缩，
// 在 3D 平面上自然形成“前大后小”的强烈透视感。
const HIDDEN_RECT: readonly [number, number, number, number] = [-60, 15, 120, 120]; 

/** 画一张 R=字覆盖度的字模贴图 → dataURL(白字黑底,shader 取 .r)。 */
function drawHiddenText(): string {
  const w = 2048;
  const h = 2048;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  
  // 纵向拉伸，抵消 3D 物理透视的极度压扁
  const scaleY = 4.5;
  ctx.scale(1, scaleY);
  
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const sentence = "CarryKit IS NOT JUST";
  
  const logicalH = h / scaleY;

  // 用一个辅助函数来画层，通过不同字号、透明度、发光和密度，人造出“深水区、浅水区、水面”的物理体积感
  const drawLayer = (
    fontSize: number,
    alpha: number,
    blur: number,
    rowCount: number,
    offsetSpeed: number,
    yOffsetRatio: number
  ) => {
    ctx.font = `${fontSize}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-title").trim()}`;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha})`;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    
    const measure = ctx.measureText(sentence + " ").width;
    const rowHeight = logicalH / rowCount;
    
    for (let i = 0; i < rowCount; i++) {
      // 通过 yOffsetRatio 错开不同层的 Y 轴位置，避免完全重叠
      const y = i * rowHeight + rowHeight * yOffsetRatio;
      const offsetX = (i % 2 === 0) ? 0 : -(measure / 2);
      // 每一层的相位波动不同，形成漂浮交错感
      const jitterX = Math.sin(i * offsetSpeed) * (measure * 0.4);
      
      for (let x = offsetX + jitterX - measure; x < w + measure; x += measure) {
        ctx.fillText(sentence, x, y);
      }
    }
  };

  // 1. 底层：深水巨物感（字极大，非常模糊，极淡，排布稀疏）
  drawLayer(140, 0.15, 25, 3, 7.3, 0.5);

  // 2. 中层：悬浮层（字中等，边缘微亮，半透明）
  drawLayer(75, 0.35, 12, 6, 11.2, 0.25);

  // 3. 表层：水面浮沫（字小，边缘清晰锐利，亮度高，排布密集）
  drawLayer(40, 0.85, 4, 11, 19.5, 0.8);

  return c.toDataURL();
}

/**
 * SkyScreenScene —— /lab/sky-screen。open 单参数同驱粒子(progress)+ 中央挖空/视频;不建滚动时间线。
 * reduced-motion:静止(粒子在 home、视频隐藏、不自动播放)。
 * `waterScroll`(0..1):喂给 water 的滚动进度 = 夜空 night→mid 过渡(默认 0=恒 night)。
 * `titleDim`(0..1):**压暗「天空元素」**——星场增益 ×(1-dim) + 标题粒子溶解 → 星点/标题消失。
 *   首页下滑到 mid(其他元素消失)与点球坠落(盖标题)都驱动它。标题不爆开(爆开只由点击 open 驱动)。默认 0。
 * `baseSkyDim`(0..1):**压暗「基础 night 天空」**(uSkyDim,连水面自身抖动颗粒一起压)。**只点球坠落用**,
 *   下滑到 mid 不用(mid 保留 preset 自然过渡出的天空)。默认 0。
 * `orbLit`(0..1):灯球对水面的照度 → 照出水下隐藏字(随灯球坠落点亮)。默认 0。
 * `locked`(bool):true = 禁用点击热区(坠落中/已落定,用户不能操作)。默认 false。
 */
export function SkyScreenScene({
  waterScroll = 0,
  titleDim = 0,
  baseSkyDim = 0,
  orbLit = 0,
  locked = false,
}: { waterScroll?: number; titleDim?: number; baseSkyDim?: number; orbLit?: number; locked?: boolean } = {}) {
  const [skyMask, setSkyMask] = useState<HTMLCanvasElement | null>(null);
  const [rect, setRect] = useState<Rect>(() => computeRect(1280, 720));
  const [textUrl, setTextUrl] = useState<string | null>(null); // 水下隐藏字模贴图(dataURL)

  const [atlasReady, setAtlasReady] = useState(false);
  const [grid, setGrid] = useState<readonly [number, number] | null>(null);
  const [count, setCount] = useState(0);

  // 渲染要读的逐帧参数用 state;同时镜像到 ref 供 rAF 闭包读最新值。
  const [open, setOpen] = useState(0); // 0=标题成形, 1=全开(粒子四散 + 视频矩形)
  const [vphase, setVphase] = useState(0); // 视频相位 0..1
  const [nonce, setNonce] = useState(0); // 动画停下时 +1 → 逼 ParticleBurst 落定成实心圆点(修发灰)
  const openRef = useRef(0);
  const phaseRef = useRef(0);
  const rewindPhaseStartRef = useRef(0); // 倒流起始时的视频相位 → 相位随 open 同步退回 0(标题与动画同时收束)
  // 时间驱动的动画段:kind=当前在爆开/倒流/无;start=起始时间戳;from=起始 open 值(支持中途反向)。
  const animRef = useRef<{ kind: "explode" | "rewind" | null; start: number; from: number }>({
    kind: null,
    start: 0,
    from: 0,
  });
  const stateRef = useRef<"idle" | "open">("idle");
  const videoPlayingRef = useRef(false); // 视频是否推进(循环)
  const rewindingRef = useRef(false); // 是否倒流中(open→0 + 视频倒放)
  const [paper, setPaper] = useState<readonly [number, number, number]>(PAPER_FALLBACK);
  const reducedRef = useRef(false);
  const [reduced, setReduced] = useState(false);
  const fpsRef = useRef(24);
  const countRef = useRef(0);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const holdTimerRef = useRef(0);
  const firedRef = useRef(false); // 本次按压是否已触发长按(倒流)

  // water 遮罩(字体就绪后;resize 重建 → 换引用 → 水面重传 + 更新 rect)。
  useEffect(() => {
    let cancelled = false;
    const build = () => {
      const w = Math.min(window.innerWidth || 1280, 1920);
      const h = Math.min(window.innerHeight || 720, 1080);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      drawSkyMask(ctx, w, h);
      if (!cancelled) {
        setRect(computeRect(w, h));
        setSkyMask(c);
      }
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(() => !cancelled && build());
    else build();
    window.addEventListener("resize", build);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", build);
    };
  }, []);

  // 水下隐藏字模贴图:立即画一次(fallback 字体也够),字体就绪后重画(度量更准)。
  useEffect(() => {
    let cancelled = false;
    const build = () => {
      if (!cancelled) setTextUrl(drawHiddenText());
    };
    build();
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(() => !cancelled && build());
    return () => {
      cancelled = true;
    };
  }, []);

  // manifest:拿 grid / count / fps。拿不到就保持 atlasReady=false → 无视频(gain 钉 0)。
  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (cancelled || !m?.grid || !m.count) return;
        countRef.current = m.count;
        fpsRef.current = m.fps || 24;
        setCount(m.count);
        setGrid([m.grid.cols, m.grid.rows]);
        setAtlasReady(true);
      })
      .catch(() => {
        /* 缺 manifest 不是错误:回落纯标题粒子。 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // reduced-motion。
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = mq.matches;
      setReduced(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // 粒子色 = --water-paper(冷色纸调)。挂主题监听(class/data-theme + prefers-color-scheme)→ 变了重读。
  useEffect(() => {
    const read = () => setPaper(readPaperRGB());
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);

  const tick = (t: number) => {
    const dt = lastRef.current ? Math.min(0.05, (t - lastRef.current) / 1000) : 0;
    lastRef.current = t;

    // ① open:时间驱动。爆开 = easeOutExpo(猛炸);倒流 = rewindEase(加速 1→8 倍,末端骤停)。粒子位置纯由 open
    //    决定 → 倒流沿原轨迹精确飞回。from 支持中途反向(如爆开途中触发倒流)。
    const a = animRef.current;
    if (a.kind === "explode") {
      const u = Math.min(1, (t - a.start) / EXPLODE_MS);
      openRef.current = a.from + (1 - a.from) * easeOutExpo(u);
      if (u >= 1) {
        openRef.current = 1;
        a.kind = null;
        setNonce((n) => n + 1); // 爆开停下 → 落定
      }
      setOpen(openRef.current);
    } else if (a.kind === "rewind") {
      /* 两段串行(见 REWIND_VIDEO_MS/TITLE_MS 那段)。有视频(count>0)才有段1;没视频直接段2。 */
      const hasVideo = countRef.current > 0;
      const el = t - a.start;
      if (hasVideo && el < REWIND_VIDEO_MS) {
        // 段1:视频 vphase→0 倒放,粒子保持散开(open=from)。缓动同标题:加速回溯(1→8 倍,末端骤停)。
        const u = Math.min(1, el / REWIND_VIDEO_MS);
        openRef.current = a.from;
        phaseRef.current = rewindPhaseStartRef.current * (1 - rewindEase(u));
        setVphase(phaseRef.current);
        setOpen(openRef.current);
      } else {
        // 段2:粒子 open→0 飞回重构,视频停在首帧(vphase=0)。
        const base = hasVideo ? REWIND_VIDEO_MS : 0;
        const u = Math.min(1, (el - base) / REWIND_TITLE_MS);
        openRef.current = a.from * (1 - rewindEase(u));
        if (phaseRef.current !== 0) {
          phaseRef.current = 0;
          setVphase(0);
        }
        if (u >= 1) {
          openRef.current = 0;
          a.kind = null;
          rewindingRef.current = false;
          videoPlayingRef.current = false;
          stateRef.current = "idle";
          phaseRef.current = 0; // 相位精确归 0 = 动画回到首帧
          setVphase(0);
          setNonce((n) => n + 1); // 倒流停下 → 落定成实心圆点(不残留发灰拖影)
        }
        setOpen(openRef.current);
      }
    }

    // ② 视频相位:倒流的 vphase 已在上面 rewind 分支两段各自算好(段1 倒放/段2 钉 0),这里只管
    //    正常播放:已爆开(open>0.85)且播放中 → 前进循环;否则冻结。
    if (countRef.current > 0 && !rewindingRef.current && videoPlayingRef.current && openRef.current > 0.85) {
      const d = (dt * fpsRef.current) / countRef.current;
      const np = phaseRef.current + d;
      phaseRef.current = np - Math.floor(np);
      setVphase(phaseRef.current);
    }

    const busy = a.kind !== null || (videoPlayingRef.current && openRef.current > 0.85);
    if (busy) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = 0;
      lastRef.current = 0;
    }
  };

  const startLoop = () => {
    if (rafRef.current || reducedRef.current) return;
    lastRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // ── 交互动作 ──
  const explode = () => {
    stateRef.current = "open";
    rewindingRef.current = false;
    videoPlayingRef.current = true;
    animRef.current = { kind: "explode", start: performance.now(), from: openRef.current };
    startLoop();
  };
  const togglePause = () => {
    videoPlayingRef.current = !videoPlayingRef.current;
    if (videoPlayingRef.current) startLoop();
  };
  const beginRewind = () => {
    rewindingRef.current = true;
    videoPlayingRef.current = false;
    rewindPhaseStartRef.current = phaseRef.current; // 记住当前相位 → 倒流时线性退回 0,与标题同步收束
    animRef.current = { kind: "rewind", start: performance.now(), from: openRef.current };
    startLoop();
  };

  const onPointerDown = () => {
    if (reducedRef.current) return;
    firedRef.current = false;
    // 只有「已爆开且非倒流中」才武装长按(倒流)。
    if (stateRef.current === "open" && !rewindingRef.current) {
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = 0;
        firedRef.current = true;
        beginRewind();
      }, HOLD_MS);
    }
  };
  const clearHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = 0;
    }
  };
  const onPointerUp = () => {
    if (reducedRef.current) return;
    const wasArmed = holdTimerRef.current !== 0;
    clearHold();
    if (firedRef.current) return; // 长按已触发倒流,松手不再当单击
    // 短按:静止→爆开;已开→暂停/继续。
    if (stateRef.current === "idle") explode();
    else if (stateRef.current === "open" && !rewindingRef.current && wasArmed) togglePause();
  };
  const onPointerCancel = () => {
    clearHold();
  };

  // 爆开只由点击(open,含 3D 视频/倒流)驱动;下滑转场不再爆开,而是 titleDim 把成形标题压暗遮住。
  const particleProgress = open;
  const videoOpen = open; // 中央挖空/视频开合量:只由点击驱动
  const dim = Math.min(1, Math.max(0, titleDim)); // 「天空元素」压暗量(星点 + 标题粒子)
  const skyDim = Math.min(1, Math.max(0, baseSkyDim)); // 「基础 night 天空」压暗量(只点球坠落用)

  const overrides: Record<string, number> = {
    uSkyStarGain: STAR_GAIN * (1 - dim), // 额外星点随压暗归 0(下滑到 mid / 点球坠落 都触发)
    uSkyDim: skyDim * 0.85, // 只点球坠落时把**基础 night 天空**乘暗(压掉水面自身抖动颗粒);mid 不用 → 保留自然天空
    uSkyStarDensity: STAR_DENSITY,
    uSkyScreenProgress: videoOpen, // 中央开合量(0=标题态挖空, 1=视频矩形)
    uSkyTitleFade: 0, // 保留标题暗底(压暗靠 dim 溶粒子,不用 fade 填回星星)
    uSkyScreenGain: atlasReady ? VIDEO_GAIN : 0,
    uSkyScreenCount: count,
    uSkyScreenPhase: vphase,
    /* 水下字彩蛋(A 方案):灯球坠落点亮 orbEnergy(=orbLit)>0 时,白光斑把字压成暗墨。
     * orbLit=0 时 shader 里 waterOrbIrradiance/waterOrbText 精确归 0 → 无字无光(闸门,逐字节回到现状)。 */
    uOrbTextGain: 1,
    /* **night 标定值**(与 /lab/water-text?preset=night 一致):水面恒 night(不抬高),字带落在地平线附近那条
     * 可见水带 —— 光池必须往近景大范围铺(near/far 3.0、poolR 48)把整片可见水照白,字才压成暗墨浮现。
     * 加强了字的对比度：调深了暗墨深度，增加了光池亮度，让字更明显。 */
    uOrbTextDark: 0.12,
    uOrbTextLit: 0.03,
    uOrbPoolGain: 0.55,
    uOrbPoolRadius: 100,
    uOrbPoolNear: 5.0,
    uOrbPoolFar: 5.0,
  };

  return (
    <div>
      {/* 无障碍:真标题给读屏/SEO。 */}
      <h1 className="sr-only">CarryKit</h1>

      <section className="relative h-svh overflow-hidden">
        {/* 水面(z-0):night preset + 星场/挖空(overrides + skyMask)+ 中央 3D 视频(图集)。 */}
        <WaterScene
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          preset="night"
          scroll={waterScroll}
          orbEnergy={orbLit}
          focus={0}
          orbX={0}
          orbSpin={0}
          lightMode={0}
          quantize
          moonHalo={0}
          overrides={overrides}
          flags={HOME_FLAGS}
          timeOverride={null}
          forceReducedMotion={false}
          skyMask={skyMask}
          screenAtlasUrl={atlasReady ? ATLAS_URL : null}
          screenGrid={grid}
          screenRect={rect}
          textAtlasUrl={textUrl}
          textRect={HIDDEN_RECT}
        />

        {/* 标题粒子层(z-5):真粒子,open 驱动爆开/倒流。pointer-events-none → 点击落到热区。 */}
        <ParticleBurst
          className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
          progress={particleProgress}
          draw={drawTitle}
          centerUv={[0.5, SCREEN_CY]}
          gridStep={4}
          dotSize={3.6}
          spread={0.5}
          gravity={0.12}
          angleRandomness={0.5}
          streak={0.4}
          color={paper}
          dim={dim}
          frozen={reduced}
          renderNonce={nonce}
        />

        {/* 交互层(z-10):透明热区。点击=爆开+展示 3D 视频/暂停;长按 2s=倒流。
            locked(转场中/灯球已落定)时 pointer-events-none → 用户不能操作。 */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Explode the title / play the sky screen"
          className={`absolute z-10 select-none ${locked ? "pointer-events-none" : "cursor-pointer"}`}
          style={{
            left: `${HOT[0] * 100}%`,
            top: `${HOT[1] * 100}%`,
            width: `${HOT[2] * 100}%`,
            height: `${HOT[3] * 100}%`,
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerCancel}
          onPointerCancel={onPointerCancel}
        />
      </section>
    </div>
  );
}
