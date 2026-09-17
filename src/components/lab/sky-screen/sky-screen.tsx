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
const REWIND_MS = 1300; // 倒流时长
const REWIND_POW = 3; // 倒流「反向惯性」加速度:越大越「先几乎不动、最后一刻猛冲到家」(更接近 easeOutExpo 的严格倒放)

const easeOutExpo = (u: number): number => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));

/** 倒流缓动 0→1(已飞回的比例)= **爆炸的时间倒放**:ease-in —— 从四散处近乎静止起步,朝原点**持续加速**,
 *  到家那一刻速度最大,随后 u=1 硬急停(戛然定住)。惯性/加速度都是反的,不再有中段减速。 */
function rewindEase(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return Math.pow(u, REWIND_POW);
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

const TITLE_FONT = (fs: number) => `italic ${fs}px "IM Fell English SC", Georgia, serif`;

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

/**
 * SkyScreenScene —— /lab/sky-screen。open 单参数同驱粒子(progress)+ 中央挖空/视频;不建滚动时间线。
 * reduced-motion:静止(粒子在 home、视频隐藏、不自动播放)。
 * `waterScroll`(0..1):喂给 water 的滚动进度 = 夜空 night→mid 过渡(首页下滑用;默认 0=恒 night)。
 * `openOverride`(0..1|null):非 null 时由外部(首页滚动)驱动标题爆开/中央开合,并关掉内部点击/长按交互;
 *   null(默认,/lab/sky-screen)= 内部点击爆开 / 长按倒流。
 */
export function SkyScreenScene({
  waterScroll = 0,
  openOverride = null,
}: { waterScroll?: number; openOverride?: number | null } = {}) {
  const [skyMask, setSkyMask] = useState<HTMLCanvasElement | null>(null);
  const [rect, setRect] = useState<Rect>(() => computeRect(1280, 720));

  const [atlasReady, setAtlasReady] = useState(false);
  const [grid, setGrid] = useState<readonly [number, number] | null>(null);
  const [count, setCount] = useState(0);

  // 渲染要读的逐帧参数用 state;同时镜像到 ref 供 rAF 闭包读最新值。
  const [open, setOpen] = useState(0); // 0=标题成形, 1=全开(粒子四散 + 视频矩形)
  const [vphase, setVphase] = useState(0); // 视频相位 0..1
  const [nonce, setNonce] = useState(0); // 动画停下时 +1 → 逼 ParticleBurst 落定成实心圆点(修发灰)
  const openRef = useRef(0);
  const phaseRef = useRef(0);
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

    // ① open:时间驱动。爆开 = easeOutExpo(猛炸);倒流 = rewindEase(慢-快-慢-骤停)。粒子位置纯由 open
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
      const u = Math.min(1, (t - a.start) / REWIND_MS);
      openRef.current = a.from * (1 - rewindEase(u));
      if (u >= 1) {
        openRef.current = 0;
        a.kind = null;
        rewindingRef.current = false;
        videoPlayingRef.current = false;
        stateRef.current = "idle";
        setNonce((n) => n + 1); // 倒流停下 → 落定成实心圆点(不残留发灰拖影)
      }
      setOpen(openRef.current);
    }

    // ② 视频相位:倒流→倒放(递减);播放中且已开→前进循环;否则冻结。
    if (countRef.current > 0) {
      const d = (dt * fpsRef.current) / countRef.current;
      if (rewindingRef.current) {
        const np = phaseRef.current - d;
        phaseRef.current = np - Math.floor(np);
        setVphase(phaseRef.current);
      } else if (videoPlayingRef.current && openRef.current > 0.85) {
        const np = phaseRef.current + d;
        phaseRef.current = np - Math.floor(np);
        setVphase(phaseRef.current);
      }
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

  // openOverride 非 null(首页转场:滚动驱动)→ 接管 open,关掉点击交互;null(/lab)→ 内部点击/长按驱动。
  const effectiveOpen = openOverride != null ? openOverride : open;

  const overrides: Record<string, number> = {
    uSkyStarGain: STAR_GAIN,
    uSkyStarDensity: STAR_DENSITY,
    uSkyScreenProgress: effectiveOpen, // 中央开合量(0=标题态挖空, 1=视频矩形)
    uSkyScreenGain: atlasReady ? VIDEO_GAIN : 0,
    uSkyScreenCount: count,
    uSkyScreenPhase: vphase,
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
          orbEnergy={0}
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
        />

        {/* 标题粒子层(z-5):真粒子,open 驱动爆开/倒流。pointer-events-none → 点击落到热区。 */}
        <ParticleBurst
          className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
          progress={effectiveOpen}
          draw={drawTitle}
          centerUv={[0.5, SCREEN_CY]}
          gridStep={4}
          dotSize={3.0}
          spread={0.5}
          gravity={0.12}
          angleRandomness={0.5}
          streak={4.0}
          color={paper}
          frozen={reduced}
          renderNonce={nonce}
        />

        {/* 交互层(z-10):透明热区。点击=爆开/暂停;长按 2s=倒流。openOverride(首页滚动驱动)时不挂,交给滚动。 */}
        {openOverride == null && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Explode the title / play the sky screen"
            className="absolute z-10 cursor-pointer select-none"
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
        )}
      </section>
    </div>
  );
}
