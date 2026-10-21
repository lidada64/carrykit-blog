"use client";

/**
 * water-scene.tsx —— W8 把六张卡拼成一个真组件
 *
 * W2~W7 的产出("`.glsl.ts` 里躺着的东西")在站点上一直没有落点:
 * field / shade / dither / light / ripple 五个着色器模块、`orb-light.ts` 的
 * 光斑求解器、`ripple.ts` 的波动方程求解器、`water-director.ts` 的交互编排器。
 * 本文件是它们唯一的装配处。
 *
 * ── 每帧的顺序(与 `water-director.ts` 文件头那段接线示例逐条对上)────────
 *   director.update(dt)                  ← 弹簧/阻尼/包络前进一帧
 *   → getFrameState()                    ← 相机、风、球位、曝光,零 DOM 读取
 *   → computeOrbUniforms()               ← O(64) 片镜子解成 ≤24 个光斑
 *   → solver.injectImpulse() ×N          ← 编排器排好的冲击
 *   → solver.stepFixed(0.016)            ← 固定 dt,CFL 是按它算的
 *   → 写 uniform → drawArrays(3)         ← 一个全屏三角形
 *
 * ── 三条硬约束 ────────────────────────────────────────────────────────────
 * ① **每帧零 DOM 读取。** 画布尺寸只来自 `ResizeObserver` 的 `contentRect`
 *    (浏览器在布局之后直接递给回调,读它不触发强制回流),指针坐标只用
 *    事件对象的 `offsetX/offsetY`,主题色只在初始化与主题切换时读一次。
 *    rAF 回调里**没有任何** `getBoundingClientRect` / `offset*` / `client*` /
 *    `getComputedStyle`。证据见 `scripts/water-scene-check.mjs`。
 * ② **`prefers-reduced-motion` 下定格单帧,之后不再进 rAF。** 面板改了参数
 *    才补渲一帧(否则滑块是死的),渲完照样不排下一帧。
 * ③ **拿不到 WebGL2 / `EXT_color_buffer_float` 时优雅降级**:涟漪关掉,
 *    水面照常渲。不许黑屏、不许抛。
 *
 * 着色器源码走 `assemble.ts` —— 与 `golden/w3/build.ts` 写进 `preview.frag`
 * 的是**同一个函数**。参数走 `presets.ts` —— 与跑分用的是**同一份数**。
 * 两条都是 docs §11 坑 7(手抄的产物悄悄漂移)逼出来的。
 */

import { useEffect, useRef, type ReactElement } from "react";
import { assembleWaterFragment } from "./assemble";
import { ORB_MAX_SPOTS } from "./contract";
import type { OrbState, RippleField } from "./contract";
import {
  ENV_LUT_SIZE,
  ENV_PRESETS,
  NIGHT_MOON_HALO,
  blendEnvColumnParams,
  buildEnvColumnLut,
  type EnvColumnParams,
  type EnvLight,
} from "./env-column";
import { DEFAULT_ORB_LIGHT_CONFIG, computeOrbUniforms } from "./orb-light";
import { WaterPerf, type WaterPerfSample } from "./perf";
import {
  WATER_PRESETS,
  WATER_PRESET_ORB_POSES,
  WATER_UNIFORM_DEFAULTS,
  blendMoonSpecGain,
  blendPresetOrbGains,
  blendPresetPool,
  blendPresetUniforms,
} from "./presets";
import { RIPPLE_TEX_SIZE, createRippleSolver, type RippleSolver } from "./ripple";
import { SOLVE_SRC as RIPPLE_SOLVE_SRC } from "./ripple.glsl";
import {
  WaterDirector,
  type WaterDirectorCounters,
  type WaterDirectorFlags,
  type WaterDirectorTuning,
  type WaterPresetName,
} from "./water-director";

/* ────────────────────────────────────────────────────────────────────────
 * 对外形状
 * ──────────────────────────────────────────────────────────────────────── */

/** 组件每隔一小段时间回报一次的运行时数字。面板拿它画计数板。 */
export interface WaterSceneStats {
  /** 编排器的七个计数桶(不变式见 `WaterDirectorCounters`) */
  counters: WaterDirectorCounters;
  /** 这一帧真的有效的光斑数。**滚动联动那条验收看的就是它** */
  activeSpots: number;
  /**
   * 灯球在视锥里的屏幕位置(NDC:x∈[-1,1] 右正,y∈[-1,1] 上正)。
   * **行⑧滚动插值之后的当前值** —— DOM 灯球叠加层从这里取位,不另算一份几何
   * (坑 7:球位是 `director.getFrameState().orb.screen` 的派生量,抄第二遍就漂)。
   */
  orbScreen: [number, number];
  /** 灯球的 NDC 半径(1.0 = 半个视口高)。DOM 层可见直径 = `orbRadiusNdc × 视口高`。 */
  orbRadiusNdc: number;
  /** 编排器解出来的相机高度(米) */
  camHeight: number;
  /** 灯球总闸门的当前值 */
  orbEnergy: number;
  /** 缓动之后的聚焦闸门(不是目标值)。0 = 展示态,1 = 聚焦态 */
  focus: number;
  /** 阻尼跟随之后的滚动进度(不是目标值) */
  scroll: number;
  /** 风速倍率(静置降风那一条) */
  windFactor: number;
  /** 冲击算出来了、但落在涟漪纹理覆盖区之外,被求解器丢掉的次数 */
  outsideField: number;
  fps: number;
  /** 涟漪求解器在跑吗(拿不到浮点纹理时是 false) */
  rippleReady: boolean;
  /** 定格中(`prefers-reduced-motion` 或页面模拟) */
  frozen: boolean;
  /**
   * W9 性能读数与当前降级档位。`source` 说明这是 GPU timer query 的真值还是
   * **回落到 rAF 帧间隔** —— 面板必须把这个字段显示出来,不然会拿帧间隔
   * 当 GPU 帧时间汇报(vsync 把它钉在 16.7 ms,GPU 只用 3 ms 也是 16.7)。
   */
  perf: WaterPerfSample | null;
  /** 非空 = 出了没法继续的问题(没有 WebGL2 / 着色器编译失败 / 缺主题 token) */
  error: string | null;
}

/** 验收脚本拿得到的句柄。**只读,不改任何渲染行为。** */
export interface WaterSceneHandle {
  director: WaterDirector;
  /** W9:GPU 计时与降级阶梯。面板用 `perf.pin(n)` 钉住档位,`pin(null)` 交还自动 */
  perf: WaterPerf | null;
  /** 补渲一帧(定格状态下面板改了参数要靠它) */
  requestFrame(): void;
  /** 读回后备缓冲,给出 FNV-1a 哈希与「与上一次抓帧的逐像素差」 */
  grabFrame(): { hash: number; diff: number; time: number };
  stats(): WaterSceneStats;
}

export interface WaterSceneProps {
  /** 当前 preset。它同时决定滚动映射区间的**终点** */
  preset: WaterPresetName;
  /** 滚动进度 0..1(来自页面的进度条,真站点上来自 ScrollTrigger) */
  scroll: number;
  /** 灯球总闸门。**0 时水面必须一点残光都没有** */
  orbEnergy: number;
  /**
   * **聚焦态闸门 0..1**(W10)。0 = 展示态 A(与 W8 定稿逐字节相同),
   * 1 = 聚焦态 B。组件内部过 `WaterDirector.setFocus()`,800 ms
   * power4.inOut 过渡;`prefers-reduced-motion` 下直接跳到目标。
   *
   * **由页面显式给** —— 不绑 energy、不绑滚动、不绑 IntersectionObserver
   * (理由见 `contract.ts` 的 `WaterFrameState.focus`)。
   * 只有 `preset === "mid"` 有 B 态;near/night 的 `focus` 块是 null,
   * 组件会把 `uOrbFocus` 钉在 0(near 冻结,night 归 W11)。
   */
  focus: number;
  /** 球心 NDC x(时间线的横穿量) */
  orbX: number;
  /** 自转相位 0..1 */
  orbSpin: number;
  /**
   * **可选**灯球自动自转速率(圈/秒)。>0 时组件用**自己每帧的时钟**推进自转相位
   * (忽略 `orbSpin`),这样 B-4 照度图集(360°/120 帧)的帧号是连续量、由 shader 相邻帧
   * 混合 → 光斑连续游走不跳格(否则 9s 一圈只 ~13fps,肉眼一段一段卡);而且**零 React 重渲**
   * (自转不经 props/state)。0 或缺省 = 用外部 `orbSpin`(金标/预览台走这条,逐字节不受影响)。
   */
  orbAutoSpin?: number;
  /** 0 = 模式 A 程序化;1 = 模式 B 预渲染序列(资产未就绪时自动回落 A) */
  lightMode: 0 | 1;
  /** 1-bit 抖动 / 连续灰度 */
  quantize: boolean;
  /** 夜景月晕的注入增益(env-column.ts 的 NIGHT_MOON_HALO) */
  moonHalo: number;
  /** 面板滑块对任意 uniform 的覆盖。空 = 全走 preset */
  overrides: Readonly<Record<string, number>>;
  /** 耦合矩阵的八条开关 */
  flags: Readonly<Partial<WaterDirectorFlags>>;
  /** 非 null 时把水面定格在这个时刻(2.5 = 黄金帧那一刻) */
  timeOverride: number | null;
  /** 页面模拟 reduced-motion(系统设置照样生效,两条是或的关系) */
  forceReducedMotion: boolean;
  /**
   * 覆盖编排器默认调参(`WATER_DIRECTOR_TUNING`)。**mount 时取一次**,之后不响应变化。
   * 目前只有 /lab/water 用它放宽拖拽范围(`dragRangeX/Y`)—— 主页不传,走定过稿的默认手感。
   */
  tuning?: Partial<WaterDirectorTuning>;
  /** 松手后灯球固定在当前位置(不回弹)。仅 lab 传 true;主页默认弹回时间线位。 */
  dragPersist?: boolean;
  onReady?: (handle: WaterSceneHandle | null) => void;
  onStats?: (stats: WaterSceneStats) => void;
  /**
   * **每帧(rAF)**回调灯球屏幕位,给 DOM 叠加层做逐帧跟随。**别用 `onStats` 跟手** ——
   * 它被限流到 5 Hz(HUD 够用),拿它定位球会一秒只动 5 次。
   * `screen` 是 NDC(x∈[-1,1] 右正 / y∈[-1,1] 上正)。
   */
  onOrbFrame?: (screenX: number, screenY: number, energy: number, radiusNdc: number) => void;
  /**
   * **可选**天空星座遮罩(方向4「篝火与星座」/lab/home-campfire 专用)。
   * 一张屏幕空间 canvas:R=清空区(留白抑星)、G=标题/星座亮度;shader 按屏幕 UV 采样(DPR 安全)。
   * 默认 null → 不绑纹理,配合 `overrides.uSkyTitleGain` 默认 0 → 与关闭态逐字节相同(闸门安全)。
   * 只在引用变化时重传纹理。开关/密度经 `overrides`(uSkyStarGain / uSkyTitleGain / uSkyStarDensity)。
   */
  skyMask?: HTMLCanvasElement | null;
  /**
   * **可选**天空「屏幕」动画图集(方向4 / /lab/sky-screen)。一张 1-bit 掩码 sprite sheet
   * (bit-sprite:alpha=形状),shader 在 `uSkyScreenRect` 内按当前帧采样,当遮罩露出粒子。
   * 默认 null → 不加载、不绑;未加载时 draw 会把 `uSkyScreenGain` 强钉 0(闸门安全)。
   * 逐帧参数(相位/进度/增益/密度/帧数)走 `overrides`(uSkyScreenPhase/Progress/Gain/Density/Count)。
   */
  screenAtlasUrl?: string | null;
  /** 图集网格 (cols, rows)。来自 manifest。null → 不设(配合 gain=0 完全惰性)。 */
  screenGrid?: readonly [number, number] | null;
  /** 屏幕矩形 (left, top, w, h),单位屏幕 UV,top 从上量。与标题遮罩里画的矩形一致。 */
  screenRect?: readonly [number, number, number, number] | null;
  /**
   * **可选**水下隐藏字模贴图 URL(灯球手电筒彩蛋)。一张 R=字覆盖度的图,
   * shader 按**世界坐标**铺在水平面的 `textRect` 矩形内、乘灯球照度后加进 body ——
   * 字长在水里、透视天然、无叠层缝(见 idea/灯球彩蛋.md)。
   * 默认 null → 不加载、不绑;`uOrbTextGain`(走 overrides,默认 0)是总闸门,
   * 未绑或 gain=0 时 shader 的 waterOrbText 精确返回 0,四道闸门不受影响。
   */
  textAtlasUrl?: string | null;
  /** 字模铺开的**场坐标**矩形 (minX, minY, sizeX, sizeY),单位米。null → 不绑(尺寸钉 0)。 */
  textRect?: readonly [number, number, number, number] | null;
  className?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 小工具(都不在 rAF 里跑)
 * ──────────────────────────────────────────────────────────────────────── */

type RGB = [number, number, number];

/** `#rrggbb` → 0..1 三元组。**这里没有任何字面量色值** —— 输入来自 CSS token。 */
function parseHex(raw: string): RGB | null {
  const h = raw.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
}

/**
 * 水面两色板。**唯一来源是 `globals.css` 的 `--water-ink` / `--water-paper`**
 * (AGENTS.md 的红线:组件里不许出现字面量色值)。
 *
 * `getComputedStyle` 是强制布局读取,所以**只在初始化与主题切换时调**,
 * 绝不在 rAF 里 —— 那正是本组件承诺的「每帧零 DOM 读取」。
 * 取不到 token 时返回 null:宁可在面板上红着脸报错,也不在这里塞一个硬编码色。
 */
function readInkPaper(): { ink: RGB; paper: RGB } | null {
  if (typeof window === "undefined") return null;
  const cs = window.getComputedStyle(document.documentElement);
  const ink = parseHex(cs.getPropertyValue("--water-ink"));
  const paper = parseHex(cs.getPropertyValue("--water-paper"));
  return ink && paper ? { ink, paper } : null;
}

const VERT_SRC = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader 失败");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "";
    gl.deleteShader(sh);
    throw new Error(log.slice(0, 300));
  }
  return sh;
}

/** 蓝噪声阈值图。`public/water/blue-noise-128.png`,W4 的产物。 */
const NOISE_URL = "/water/blue-noise-128.png";

/**
 * 模式 B 的照度图集(B-4 `ball-waterlight`,night 标定态)。
 * `.webp` 是 12×10 灰度 sprite sheet,`.json` 给 rect / cols / rows。
 * **只在 `lightMode === 1` 且纹理加载完成后才生效**;否则 `uOrbLightmapSize`
 * 保持 (0,0),shader 自动回落模式 A(见 light.glsl.ts 的 waterOrbIrradiance)——
 * 所以加载它对模式 A / 四道闸门零影响。图集是 night 标定的,**要看正确的耦合
 * 请切到 night preset**;其它 preset 的球位落点与这块 rect 对不上(见 blender-assets.md B-4)。
 */
const LIGHTMAP_URL = "/orb/ball-waterlight.webp";
const LIGHTMAP_META_URL = "/orb/ball-waterlight.json";

/* ────────────────────────────────────────────────────────────────────────
 * 组件
 * ──────────────────────────────────────────────────────────────────────── */

export function WaterScene(props: WaterSceneProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<WaterSceneHandle | null>(null);
  /* 每帧从 ref 读 props,而不是把 props 进 effect 依赖 —— 拖一次滑块就重建
   * WebGL 上下文是荒唐的。**同步写在下面那个 effect 里**,不在 render 期间写 ref
   * (`react-hooks/refs`:render 期间读写 ref 会让组件更新不如预期)。 */
  const propsRef = useRef(props);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /* ── 状态(全部关在这个 effect 里,卸载时一起收) ──────────────────── */
    let disposed = false;
    let rafId = 0;
    let lastMs = 0;
    let fps = 0;
    let outsideField = 0;
    let activeSpots = 0;
    let statsAt = 0;
    let sceneError: string | null = null;

    /** 画布的**物理**像素尺寸。唯一写入点是 ResizeObserver 回调。 */
    const size = { w: 0, h: 0, cssW: 1, cssH: 1 };

    const emitStats = (): void => {
      const cb = propsRef.current.onStats;
      if (!cb) return;
      cb({
        counters: director.stats(),
        activeSpots,
        orbScreen: [director.getFrameState().orb.screen[0], director.getFrameState().orb.screen[1]],
        orbRadiusNdc: director.getFrameState().orb.radiusNdc,
        camHeight: director.getFrameState().camHeight,
        orbEnergy: director.getFrameState().orb.energy,
        focus: director.focus,
        scroll: director.scroll,
        windFactor: director.windFactor,
        outsideField,
        fps,
        rippleReady: solver !== null,
        frozen: director.reducedMotion,
        perf: perf ? perf.sample() : null,
        error: sceneError,
      });
    };

    const fail = (msg: string): void => {
      sceneError = msg;
      emitStats();
    };

    /* ── 编排器 ───────────────────────────────────────────────────────── */
    /* 自动自转相位:orbAutoSpin>0 时由 step() 每帧从 dt 推进(不经 props)。见 orbAutoSpin 的注释。 */
    let autoSpinPhase = 0;
    const orbSource = (): OrbState => {
      const p = propsRef.current;
      /* 球位的 y / 两个半径由编排器的行⑧从滚动进度插出来(见 water-director.ts);
       * 时间线只管**横穿**与 energy / 自转。这里给的 y/半径是行⑧关掉时的回退值,
       * 取当前 preset 的球位 —— 那时组件的行为就退回 W7。 */
      const pose = WATER_PRESET_ORB_POSES[p.preset];
      const spin = (p.orbAutoSpin ?? 0) > 0 ? autoSpinPhase : p.orbSpin;
      return {
        screen: [p.orbX, pose.screenY],
        radiusNdc: pose.radiusNdc,
        energy: p.orbEnergy,
        spinPhase: spin,
        /* **连续帧号**(不 floor):shader 的 waterOrbLightmapSample 自己 floor + 相邻帧混合。 */
        lightmapFrame: spin * 120,
        worldRadius: pose.worldRadius,
      };
    };

    const director = new WaterDirector({
      from: "night",
      to: "mid",
      viewport: { left: 0, top: 0, width: 1, height: 1 },
      orbSource,
      tuning: propsRef.current.tuning ?? {},
      dragPersist: propsRef.current.dragPersist ?? false,
    });
    /* `prefers-reduced-motion`:系统设置与页面模拟开关是**或**的关系,而且
     * 两条都要能**关回去** —— `director.bindReducedMotion()` 只接系统那条,
     * 关不掉页面这条,所以这里自己接一次 media query 再合并。 */
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let systemReduced = mq.matches;
    const applyReduced = (): void => {
      const want = systemReduced || propsRef.current.forceReducedMotion;
      if (want === director.reducedMotion) return;
      director.setReducedMotion(want);
      if (!want) lastMs = 0;
    };
    const onMq = (e: MediaQueryListEvent): void => {
      systemReduced = e.matches;
      applyReduced();
      requestFrame();
    };
    mq.addEventListener("change", onMq);
    director.setReducedMotion(systemReduced);

    /* ── 尺寸:**唯一的布局来源**,而且是浏览器主动递过来的 ─────────────── */
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r || r.width <= 0 || r.height <= 0) return;
      size.cssW = r.width;
      size.cssH = r.height;
      applyRenderScale();
      requestFrame();
    });
    ro.observe(canvas);

    /* W9 档位 → 后备缓冲尺寸。**只在尺寸真的变了时才写 canvas.width** ——
     * 给 canvas.width 赋值(哪怕赋同一个数)会清空缓冲并重新分配,每帧写一次
     * 等于每帧丢一次整张后备缓冲。 */
    function applyRenderScale(): void {
      const cv = canvasRef.current;
      if (!cv || !(size.cssW > 0) || !(size.cssH > 0)) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = perf ? perf.currentTier().renderScale : 1;
      const w = Math.max(1, Math.round(size.cssW * dpr * scale));
      const h = Math.max(1, Math.round(size.cssH * dpr * scale));
      if (w === size.w && h === size.h) return;
      size.w = w;
      size.h = h;
      cv.width = w;
      cv.height = h;
      /* 编排器的逆投影用 **CSS 像素**(指针给的是 offsetX/offsetY),
       * 与后备缓冲的倍率无关 —— 降档不该让点击落点跑偏。 */
      director.setViewport({ left: 0, top: 0, width: size.cssW, height: size.cssH });
    }

    /* ── 主题色:初始化读一次,主题切换时再读一次。**不在 rAF 里。** ────── */
    let palette = readInkPaper();
    const themeObserver = new MutationObserver(() => {
      palette = readInkPaper();
      requestFrame();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    /* ── 指针。**只吃事件对象里的数**,一次 DOM 读取都没有。 ──────────── */
    const overOrb = (nx: number, ny: number): boolean => {
      const f = director.getFrameState();
      const aspect = size.w / Math.max(size.h, 1);
      const dx = (nx - f.orb.screen[0]) * aspect;
      const dy = ny - f.orb.screen[1];
      return dx * dx + dy * dy <= f.orb.radiusNdc * f.orb.radiusNdc;
    };

    const onPointerMove = (e: PointerEvent): void => {
      const vp = director.viewport;
      if (!(vp.width > 0) || !(vp.height > 0)) return;
      director.setOrbHover(
        overOrb((e.offsetX / vp.width) * 2 - 1, 1 - (e.offsetY / vp.height) * 2),
      );
      // 行⑩(W11b):拖拽中先喂偏移。pointerMove 内部会看 `dragging` 把涟漪注入挡掉
      director.dragMove(e.offsetX, e.offsetY);
      director.pointerMove(e.offsetX, e.offsetY, e.timeStamp);
      requestFrame();
    };
    const onPointerLeave = (): void => {
      director.pointerLeave();
      director.setOrbHover(false);
    };
    const onPointerDown = (e: PointerEvent): void => {
      const vp = director.viewport;
      /* 行⑩:按在球上 = 拖球,**不落水**。命中判定在这一层(编排器不做屏幕
       * 空间碰撞检测,见 dragStart 的注释)。setPointerCapture 之后指针拖出
       * 画布也还能收到 move/up —— 不然拖到边缘一松手球就永远停在那儿。 */
      if (
        vp.width > 0 &&
        vp.height > 0 &&
        overOrb((e.offsetX / vp.width) * 2 - 1, 1 - (e.offsetY / vp.height) * 2) &&
        director.dragStart(e.offsetX, e.offsetY)
      ) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* 捕获失败(测试环境 / 已释放的 pointerId)不影响拖拽本身,只是拖出
           * 画布后收不到事件 —— 比抛出去把整条 rAF 打断好。 */
        }
        requestFrame();
        return;
      }
      director.pointerDown(e.offsetX, e.offsetY);
      requestFrame();
    };
    const onPointerUp = (e: PointerEvent): void => {
      director.dragEnd();
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* 同上:没捕获成功过就没什么可释放的 */
      }
      requestFrame();
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    /* ── WebGL2 ───────────────────────────────────────────────────────── */
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    let prog: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let noiseTex: WebGLTexture | null = null;
    let noiseSize: [number, number] = [1, 1];
    let envLutTex: WebGLTexture | null = null;
    /* B 星空标题遮罩(可选)。引用变化才重传;默认 null → 不创建、不绑。 */
    let skyMaskTex: WebGLTexture | null = null;
    let skyMaskSrc: HTMLCanvasElement | null = null;
    let skyMaskSize: [number, number] = [1, 1];
    /* 模式 B 照度图集(可选,B-4)。加载完成前 lightmapSize 保持 (0,0) → 回落模式 A。 */
    let lightmapTex: WebGLTexture | null = null;
    let lightmapSize: [number, number] = [0, 0];
    let lightmapCols = 12;
    let lightmapRows = 10;
    let lightmapRect: [number, number, number, number] = [0, 0, 0, 0];
    /* 天空屏幕动画图集(可选)。url 变化才重载;加载完成前 screenAtlasTex 保持 null → gain 强钉 0。 */
    let screenAtlasTex: WebGLTexture | null = null;
    let screenAtlasUrlLoaded: string | null = null;
    /* 隐藏字模贴图(可选,灯球彩蛋)。url 变化才重载;加载完成前 textAtlasSize 保持 (0,0) → shader 回落 0。 */
    let textAtlasTex: WebGLTexture | null = null;
    let textAtlasUrlLoaded: string | null = null;
    let textAtlasSize: [number, number] = [0, 0];
    let solver: RippleSolver | null = null;
    /* W9:GPU 计时 + 降级阶梯。拿不到 timer query 扩展也照样能用(回落 CPU 帧间隔),
     * 所以这里**没有失败分支** —— 见 perf.ts 文件头。 */
    const perf: WaterPerf | null = gl ? new WaterPerf(gl) : null;
    /** 上一帧生效的档位 id;变了才重设后备缓冲尺寸(改 canvas.width 会清空并重分配) */
    let tierApplied = -1;
    /** 档 5「停更」把水面时间钉在这一刻 */
    let freezeTime = -1;
    let solverKey = "";
    const locs = new Map<string, WebGLUniformLocation | null>();

    const setF = (name: string, v: number): void => {
      const l = locs.get(name);
      if (l && gl) gl.uniform1f(l, v);
    };
    const set2 = (name: string, a: number, b: number): void => {
      const l = locs.get(name);
      if (l && gl) gl.uniform2f(l, a, b);
    };
    const set3 = (name: string, v: RGB | [number, number, number]): void => {
      const l = locs.get(name);
      if (l && gl) gl.uniform3f(l, v[0], v[1], v[2]);
    };
    const set4 = (name: string, a: number, b: number, c: number, d: number): void => {
      const l = locs.get(name);
      if (l && gl) gl.uniform4f(l, a, b, c, d);
    };

    if (!gl) {
      fail("no-webgl2");
    } else {
      try {
        const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
        const fs = compile(gl, gl.FRAGMENT_SHADER, assembleWaterFragment());
        prog = gl.createProgram();
        if (!prog) throw new Error("createProgram 失败");
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        /* 链接完就可以删 shader 对象了 —— program 持有自己的副本。 */
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(prog) ?? "link 失败");
        }
        gl.useProgram(prog);
        const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
        for (let i = 0; i < n; i++) {
          const info = gl.getActiveUniform(prog, i);
          if (!info) continue;
          /* 数组 uniform 的名字带 `[0]` 后缀,两个名字都存一份,取的时候不用猜。 */
          const loc = gl.getUniformLocation(prog, info.name);
          locs.set(info.name, loc);
          if (info.name.endsWith("[0]")) locs.set(info.name.slice(0, -3), loc);
        }
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
      } catch (e) {
        prog = null;
        fail("shader:" + (e instanceof Error ? e.message : String(e)));
      }
    }

    /* 蓝噪声。异步加载,加载好之前先不画(阈值图缺了画面就是纯黑白，没意义)。 */
    if (gl && prog) {
      const img = new Image();
      img.onload = () => {
        if (disposed || !gl) return;
        noiseTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, noiseTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        noiseSize = [img.width, img.height];
        start();
      };
      img.onerror = () => {
        if (!disposed) fail("noise");
      };
      img.src = NOISE_URL;
    }

    /* 模式 B 照度图集:异步加载,加载失败**不报错**(模式 A 仍然完整)。
     * 加载好之前 lightmapSize 是 (0,0) → shader 回落 A;好了之后切到 lightMode=1
     * 才生效。用 LINEAR 采样(格内软斑,rect 有留白、格边照度≈0,跨格 bleed 可忽略)。 */
    if (gl && prog) {
      void fetch(LIGHTMAP_META_URL)
        .then((r) => (r.ok ? r.json() : null))
        .then((meta) => {
          if (!meta) return;
          if (Array.isArray(meta.rect) && meta.rect.length === 4) lightmapRect = meta.rect;
          if (meta.cols) lightmapCols = meta.cols;
          if (meta.rows) lightmapRows = meta.rows;
        })
        .catch(() => {
          /* 没有 .json 就用 preset 默认列/行,rect 保持 0 → 采样越界返回 0,无害 */
        });
      const lm = new Image();
      lm.onload = () => {
        if (disposed || !gl) return;
        lightmapTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, lightmapTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, lm);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        lightmapSize = [lm.width, lm.height];
        requestFrame();
      };
      lm.onerror = () => {
        /* 缺资产不是错误:模式 B 本就"资产未就绪自动回落 A"。 */
      };
      lm.src = LIGHTMAP_URL;
    }

    /* 天空屏幕图集:惰性加载(url 来自 prop,可能在 manifest fetch 后才到)。
     * url 变了就重载;加载失败**不报错**(gain 会被钉 0,画面无害回落成纯标题/星场)。
     * 用 NEAREST + CLAMP:1-bit 掩码不许插值(避免帧边渗色、保住颗粒硬边)。 */
    let screenAtlasLoading = false;
    const ensureScreenAtlas = (): void => {
      if (!gl || !prog) return;
      const url = propsRef.current.screenAtlasUrl ?? null;
      if (!url || url === screenAtlasUrlLoaded || screenAtlasLoading) return;
      screenAtlasLoading = true;
      const im = new Image();
      im.onload = () => {
        screenAtlasLoading = false;
        if (disposed || !gl) return;
        if (!screenAtlasTex) screenAtlasTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, screenAtlasTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        screenAtlasUrlLoaded = url;
        requestFrame();
      };
      im.onerror = () => {
        screenAtlasLoading = false;
        /* 缺资产不是错误:gain 钉 0 → 回落纯标题/星场。 */
      };
      im.src = url;
    };

    /* 隐藏字模贴图(灯球彩蛋):惰性加载,url 变了重载;失败**不报错**(size 保持 (0,0) →
     * shader 的 waterOrbText 回落 0)。用 LINEAR + CLAMP:字覆盖度进 body 后还要过
     * tonemap + 抖动量化,让边缘先软过渡、交给蓝噪声去颗粒化,与水波同一种语言。 */
    let textAtlasLoading = false;
    const ensureTextAtlas = (): void => {
      if (!gl || !prog) return;
      const url = propsRef.current.textAtlasUrl ?? null;
      if (!url || url === textAtlasUrlLoaded || textAtlasLoading) return;
      textAtlasLoading = true;
      const im = new Image();
      im.onload = () => {
        textAtlasLoading = false;
        if (disposed || !gl) return;
        if (!textAtlasTex) textAtlasTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, textAtlasTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        textAtlasSize = [im.width, im.height];
        textAtlasUrlLoaded = url;
        requestFrame();
      };
      im.onerror = () => {
        textAtlasLoading = false;
        /* 缺资产不是错误:size 保持 (0,0) → waterOrbText 回落 0。 */
      };
      im.src = url;
    };

    /* ── 涟漪求解器。preset / 波速 / 阻尼一变就整个重建(256² 两张纹理,便宜)。
     * 拿不到 `EXT_color_buffer_float` 时 `createRippleSolver` 返回 null ——
     * 那就是"没有涟漪",水面照常渲。 */
    const ensureSolver = (): void => {
      if (!gl || !prog) return;
      const p = propsRef.current;
      const rp = WATER_PRESETS[p.preset].ripple;
      if (!rp) {
        if (solver) {
          solver.dispose();
          solver = null;
          director.setRippleField(null);
        }
        solverKey = "";
        return;
      }
      const parts = rp.world.split(",").map(Number);
      const speed = p.overrides.ripSpeed ?? rp.speed;
      const damping = p.overrides.ripDamping ?? rp.damping;
      /* W9 档 4:涟漪纹理 256 → 128(4× 的填充率)。纹理边长进 key ——
       * 求解器的两张 FBO 是构造时分配的,换尺寸只能重建。重建会丢掉水面上
       * 现有的波,所以它排在阶梯的第 4 档:前面三档都没救回来才动它。 */
      const texSize = perf ? perf.currentTier().rippleTexSize : RIPPLE_TEX_SIZE;
      const key = [p.preset, rp.world, speed, damping, texSize].join("|");
      if (solver && key === solverKey) return;
      if (solver) solver.dispose();
      solver = createRippleSolver(gl, RIPPLE_SOLVE_SRC, {
        worldMin: [parts[0], parts[1]],
        worldSize: parts[2],
        waveSpeed: speed,
        damping,
        size: texSize,
      });
      solverKey = solver ? key : "";
      director.setRippleField(solver ? solver.field() : null);
      /* 换 preset 先丢一发默认冲击 —— 不然面板上"涟漪"那一栏什么都看不到。 */
      if (solver) {
        const im = rp.impulse.split(",").map(Number);
        solver.injectImpulse([im[0], im[1]], im[2], im[3]);
      }
      /* RippleSolver 的构造/步进会切走 program、FBO 与 viewport,收回来。 */
      gl.useProgram(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, size.w, size.h);
    };

    /* ── 环境列 LUT:每帧重建一张 1×256 R8(256 字节的上传,成本可以忽略),
     * 好处是"灯球注入 / 月晕"这条通道在站点上是活的,不是烘死的 PNG。 */
    const uploadEnvLut = (params: EnvColumnParams): void => {
      if (!gl) return;
      const lut = buildEnvColumnLut(params, ENV_LUT_SIZE);
      gl.activeTexture(gl.TEXTURE1);
      if (!envLutTex) {
        envLutTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, envLutTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindTexture(gl.TEXTURE_2D, envLutTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ENV_LUT_SIZE, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut);
      const l = locs.get("uShadeEnvLut");
      if (l) gl.uniform1i(l, 1);
      set2("uShadeEnvLutSize", ENV_LUT_SIZE, 1);
    };

    /* 混出来的一套 uniform 只在滚动进度/preset 变了才重算 —— 拖滚动条时每帧重算,
     * 静止时一次都不算。**端点原样返回**,所以停在 preset 上与黄金帧逐位相同。 */
    let blendKey = "";
    let blended: Record<string, number> = {};

    const draw = (): void => {
      if (!gl || !prog || !noiseTex) return;
      if (!palette) {
        fail("theme-token");
        return;
      }
      const p = propsRef.current;
      const frame = director.getFrameState();
      const from = WATER_PRESETS[director.from];
      const to = WATER_PRESETS[director.to];
      const u = director.flags.scrollCamera ? director.scroll : 0;

      const key = `${director.from}|${director.to}|${u}`;
      if (key !== blendKey) {
        blended = blendPresetUniforms(from, to, u);
        blendKey = key;
      }
      const gains = blendPresetOrbGains(from, to, u);

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, size.w, size.h);

      /* ① 底表:preset 默认值 ← 混合结果 ← 灯球增益 ← 面板覆盖。
       * `WATER_UNIFORM_DEFAULTS` 打底是必须的:某个 preset 没写的 uniform
       * 缺了就会拿到 0,画面直接崩(W1 踩过,纹理尺寸被清零 → NaN)。 */
      for (const [k, v] of Object.entries(WATER_UNIFORM_DEFAULTS)) setF(k, v);
      for (const [k, v] of Object.entries(blended)) setF(k, v);
      setF("uFieldOrbPatchGain", gains.uFieldOrbPatchGain);
      setF("uOrbBodyGain", gains.uOrbBodyGain);
      setF("uOrbSpecGain", gains.uOrbSpecGain);
      setF("uOrbPatchGain", gains.uOrbPatchGain);
      setF("uOrbSpecClip", gains.uOrbSpecClip);
      /* ①' 主光池(W11a)。形状与增益都跟着滚动插值 —— 三个 preset 的世界尺度
       * 差一个数量级,池半径不跟着走就会重演 W7「滚到 mid 灯球 22 斑变 0 斑」
       * 那一族(docs §17.2 坑 15)。增益端点是 night 0.04 / near·mid 0。 */
      const pool = blendPresetPool(from, to, u);
      for (const [k, v] of Object.entries(pool)) setF(k, v);
      /* ①'' 月光让位:灯球满能量时 night 的 uShadeSpecGain 从 1e4 让到 4000。
       * **必须在 ① 的 `blended` 之后写**,它就是要覆盖那一份;而 energy = 0 时
       * blendMoonSpecGain 退化成与 `blended.uShadeSpecGain` 同一个表达式,
       * 逐位相同 —— 那条红线在混合态上也成立。 */
      setF("uShadeSpecGain", blendMoonSpecGain(from, to, u, frame.orb.energy));
      for (const [k, v] of Object.entries(p.overrides)) {
        if (k.startsWith("u")) setF(k, v);
      }

      /* ② 编排器接管的五个:相机三项走滚动阻尼,风速走静置降风,
       * 曝光是点击包络**加**在 preset 的 uShadeExposure 上(不是倍率)。 */
      setF("uFieldCamHeight", frame.camHeight);
      setF("uFieldCamPitch", frame.camPitch);
      setF("uFieldFovY", frame.fovY);
      setF("uFieldWindDir", frame.wind.dirRad);
      setF("uFieldWindSpeed", frame.wind.speed);
      const baseExposure =
        p.overrides.uShadeExposure ?? blended.uShadeExposure ?? WATER_UNIFORM_DEFAULTS.uShadeExposure;
      setF("uShadeExposure", baseExposure + (frame.exposureBoost ?? 0));

      /* ③ 每帧量:分辨率、时间、抖动开关、两色板。 */
      set2("uRes", size.w, size.h);
      /* 定格在黄金帧那一刻(2.5 s)是**只改 uTime**,不去动 `director.time` ——
       * 编排器的时间还要驱动时间线取值,改它等于把整条交互也停了。 */
      /* W9 档 5「停更」:把水面时间钉在进入这一档的那一刻。
       * **冻的是 uTime,不是 director.update(dt)** —— 后者会把弹簧、阻尼、
       * 计数器一起冻住,那时页面看起来像挂了。波场是 uTime 的纯函数,
       * 抖动图案本来就是屏幕空间的静态蓝噪声,所以钉住 uTime 正好是
       * 「波场停更 + 抖动静态」这一句的字面实现。 */
      const tierNow = perf ? perf.currentTier() : null;
      if (tierNow && tierNow.freeze) {
        if (freezeTime < 0) freezeTime = frame.time;
      } else {
        freezeTime = -1;
      }
      setF("uTime", p.timeOverride ?? (freezeTime >= 0 ? freezeTime : frame.time));
      /* W9 档 2:把解析 LOD 提前 1.6× —— 短波分量更早淡出,每像素少算几组
       * 三角函数。乘在**最终生效值**上(preset 混合 → 面板覆盖 → 这里),
       * 三个 preset 的基准不同(near/mid 5.0、night 3.0),写绝对值会串味。 */
      if (tierNow && tierNow.lodBiasMul !== 1) {
        const lod =
          p.overrides.uFieldLodBias ?? blended.uFieldLodBias ?? WATER_UNIFORM_DEFAULTS.uFieldLodBias;
        setF("uFieldLodBias", lod * tierNow.lodBiasMul);
      }
      setF("uDitherQuantize", p.quantize ? 1 : 0);
      set3("uDitherInk", palette.ink);
      set3("uDitherPaper", palette.paper);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, noiseTex);
      const nl = locs.get("uDitherNoise");
      if (nl) gl.uniform1i(nl, 0);
      set2("uDitherNoiseSize", noiseSize[0], noiseSize[1]);

      /* ④ 灯球:CPU 解一次(O(64) 片镜子),shader 里只做 ≤24 次核求和。 */
      const cfg = { ...DEFAULT_ORB_LIGHT_CONFIG, envGain: p.overrides.envOrbGain ?? gains.envGain };
      const orbU = computeOrbUniforms(frame.orb, cfg, {
        camHeight: frame.camHeight,
        camPitch: frame.camPitch,
        fovY: frame.fovY,
        aspect: size.w / Math.max(size.h, 1),
      });
      activeSpots = orbU.activeSpots;
      setF("uOrbEnergy", frame.orb.energy);
      const ml = locs.get("uOrbLightMode");
      if (ml) gl.uniform1i(ml, p.lightMode);
      set3("uOrbCenter", orbU.center);
      setF("uOrbRadius", frame.orb.worldRadius);
      set2("uOrbPatchCenter", orbU.patchCenter[0], orbU.patchCenter[1]);
      setF("uOrbPatchRadius", orbU.patchRadius);
      setF("uOrbOmega", orbU.omega);
      setF("uOrbLightmapFrame", frame.orb.lightmapFrame);
      const sl = locs.get("uOrbSpots");
      if (sl) gl.uniform4fv(sl, orbU.spots);

      /* ④''' 模式 B 照度图集(B-4)。纹理就绪才写真实尺寸 → shader 里
       * `uOrbLightMode==1 && uOrbLightmapSize.x>=1` 才走 B;否则 (0,0) 回落 A。
       * lightMode / energy 两条闸门在 shader 与上面已各自把关,这里只管绑纹理。 */
      if (lightmapTex && lightmapSize[0] >= 1) {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, lightmapTex);
        const lml = locs.get("uOrbLightmap");
        if (lml) gl.uniform1i(lml, 4);
        set2("uOrbLightmapSize", lightmapSize[0], lightmapSize[1]);
        setF("uOrbLightmapCols", lightmapCols);
        setF("uOrbLightmapRows", lightmapRows);
        set4("uOrbLightmapRect", lightmapRect[0], lightmapRect[1], lightmapRect[2], lightmapRect[3]);
      } else {
        set2("uOrbLightmapSize", 0, 0);
      }

      /* ④' 聚焦渐晕(W10)。**只有 mid 有 B 态** —— near 冻结、night 归 W11,
       * 它们的 `focus` 块是 null,这里就把闸门钉死在 0(= 逐字节回到 A 态)。
       * 五个参数走 `WATER_UNIFORM_DEFAULTS`(= presets.ts 的 MID_FOCUS)打底 +
       * 面板覆盖,已经在 ① 里写过了,这里只写**每帧量**:
       *  · uOrbGround —— 球心的落点,直接从 orbU.center 取,不另抄几何;
       *  · uOrbSpinPhase —— 碎粒跟着球转慢慢挪。 */
      const hasFocus = WATER_PRESETS[p.preset].focus !== null;
      setF("uOrbFocus", hasFocus ? (frame.focus ?? 0) : 0);
      set2("uOrbGround", orbU.center[0], orbU.center[2]);
      setF("uOrbSpinPhase", frame.orb.spinPhase);
      /* ④'' 行⑪ 退场后退(W11b)。静息恒为 0 ⇒ shader 里 ×(1+0·K) 与 ×1.0
       * 逐位恒等,不退场时画面与 W11a 完全一致。 */
      setF("uOrbPoolRetreat", frame.orbRetreat ?? 0);

      /* ⑤ 环境列:preset 的底表按滚动混合,再叠上灯球倒影与(夜景的)月晕。
       * `envLight` 在 energy=0 时是 null —— 于是 LUT 与烘死的 PNG 逐字节相同。 */
      const envParams = blendEnvColumnParams(ENV_PRESETS[director.from], ENV_PRESETS[director.to], u);
      const lights: EnvLight[] = [];
      if (orbU.envLight) lights.push(orbU.envLight);
      if (p.moonHalo > 0) {
        lights.push({ sinElev: NIGHT_MOON_HALO.sinElev, width: NIGHT_MOON_HALO.width, gain: p.moonHalo });
      }
      envParams.lights = lights;
      uploadEnvLut(envParams);

      /* ⑥ 涟漪:关闭时把纹理尺寸写成 (0,0) —— `ripple.glsl.ts` 靠它走关闭分支,
       * 与"没接涟漪"逐字节相同。判尺寸不判采样值,理由同 light.glsl.ts 的模式 B。 */
      const rippleAmp = p.overrides.uRippleAmp ?? blended.uRippleAmp ?? 0;
      if (solver && rippleAmp > 0) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, solver.texture());
        const rl = locs.get("uRippleTex");
        if (rl) gl.uniform1i(rl, 2);
        set2("uRippleTexSize", solver.size, solver.size);
        set2("uRippleWorldMin", solver.worldMin[0], solver.worldMin[1]);
        setF("uRippleWorldSize", solver.worldSize);
      } else {
        set2("uRippleTexSize", 0, 0);
      }

      /* ⑦ 星空标题遮罩(B,可选)。默认 null → 完全不碰,shader 靠 uSkyTitleGain>0(默认 0)守卫。
       * 按屏幕 UV 采样 → 用 CLAMP + LINEAR;引用变了才 texImage2D 重传(canvas 内容变会换引用)。 */
      const mask = p.skyMask ?? null;
      if (mask && mask !== skyMaskSrc) {
        if (!skyMaskTex) skyMaskTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, skyMaskTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, mask);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        skyMaskSrc = mask;
        skyMaskSize = [mask.width, mask.height];
      }
      if (skyMaskTex) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, skyMaskTex);
        const tl = locs.get("uSkyTitleMask");
        if (tl) gl.uniform1i(tl, 3);
        set2("uSkyTitleMaskSize", skyMaskSize[0], skyMaskSize[1]);
      }

      /* ⑧ 天空「屏幕」动画图集(A,可选)。grid/rect 是静态几何(prop);相位/进度/增益走 overrides。
       * 未加载 or 缺 grid/rect → 强钉 uSkyScreenGain=0(在 ① overrides 之后,覆盖之)→ shader 精确回落。 */
      ensureScreenAtlas();
      const scGrid = p.screenGrid ?? null;
      const scRect = p.screenRect ?? null;
      if (screenAtlasTex && scGrid && scRect) {
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, screenAtlasTex);
        const sl = locs.get("uSkyScreenAtlas");
        if (sl) gl.uniform1i(sl, 5);
        set2("uSkyScreenGrid", scGrid[0], scGrid[1]);
        set4("uSkyScreenRect", scRect[0], scRect[1], scRect[2], scRect[3]);
      } else {
        setF("uSkyScreenGain", 0);
      }

      /* ⑨ 隐藏字模(灯球彩蛋,可选)。纹理就绪且给了 rect 才绑 → shader 里
       * `uOrbTextGain>0 && uOrbTextSize.x>=1` 才显字;否则尺寸钉 (0,0),waterOrbText
       * 回落 0。总闸门 uOrbTextGain 走 overrides(默认 0),已在 ① 里写过。 */
      ensureTextAtlas();
      const txRect = p.textRect ?? null;
      if (textAtlasTex && textAtlasSize[0] >= 1 && txRect) {
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, textAtlasTex);
        const txl = locs.get("uOrbText");
        if (txl) gl.uniform1i(txl, 6);
        set2("uOrbTextSize", textAtlasSize[0], textAtlasSize[1]);
        set4("uOrbTextRect", txRect[0], txRect[1], txRect[2], txRect[3]);
      } else {
        set2("uOrbTextSize", 0, 0);
      }

      if (perf) perf.begin("water");
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (perf) perf.end();
    };

    /* ── 验收钩子。只读,不改渲染行为。 ─────────────────────────────────── */
    let prevPixels: Uint8Array | null = null;
    const grabFrame = (): { hash: number; diff: number; time: number } => {
      const n = 4 * size.w * size.h;
      const px = new Uint8Array(n);
      if (gl) gl.readPixels(0, 0, size.w, size.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let diff = prevPixels ? 0 : -1;
      if (prevPixels) {
        for (let i = 0; i < n; i += 4) {
          if (
            px[i] !== prevPixels[i] ||
            px[i + 1] !== prevPixels[i + 1] ||
            px[i + 2] !== prevPixels[i + 2]
          ) {
            diff++;
          }
        }
      }
      prevPixels = px;
      let h = 2166136261 >>> 0;
      for (let i = 0; i < n; i++) {
        h ^= px[i];
        h = Math.imul(h, 16777619) >>> 0;
      }
      return { hash: h >>> 0, diff, time: director.getFrameState().time };
    };

    /* ── 一帧 ─────────────────────────────────────────────────────────── */
    const step = (now: number): void => {
      rafId = 0;
      if (disposed) return;
      const p = propsRef.current;

      const dt = lastMs ? Math.min((now - lastMs) / 1000, 0.1) : 0;
      lastMs = now;
      if (dt > 0) fps = fps ? fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;

      applyReduced();

      for (const [k, v] of Object.entries(p.flags)) {
        if (v !== undefined) director.setFlag(k, v);
      }

      /* 滚动映射区间跟着 preset 走。**默认 night → mid**;选 near 时接续成
       * mid → near —— near 是合法终点但不是默认(它一个参数都没为本卡动过)。 */
      const from: WaterPresetName = p.preset === "near" ? "mid" : "night";
      const to: WaterPresetName = p.preset === "night" ? "mid" : p.preset;
      const jumped = director.from !== from || director.to !== to;
      director.from = from;
      director.to = to;
      director.setScroll(p.scroll);
      /* 换 preset 是**跳转**不是滚动:直接把阻尼量吸附到目标,
       * 否则一按按钮画面会从上一个相机高度滑过去。 */
      if (jumped) director.scroll = director.scrollTarget;

      /* 行⑨ 聚焦态(W10)。**页面显式驱动**:`focus` 是一个 prop,不绑 energy、
       * 不绑滚动、不绑 IntersectionObserver。目标没变时 setFocus 直接 return,
       * 所以每帧调用不会重启那条 800 ms 的过渡。 */
      director.setFocus(p.focus);

      /* 灯球自动自转:用组件自己的每帧时钟推进(不经 props → 零 React 重渲、连续不跳格)。
       * 定格(reduced-motion)时 dt=0 不推进。orbSource() 读它当自转相位。 */
      const autoSpin = p.orbAutoSpin ?? 0;
      if (autoSpin > 0 && dt > 0 && !director.reducedMotion) {
        autoSpinPhase = (autoSpinPhase + autoSpin * dt) % 1;
        if (autoSpinPhase < 0) autoSpinPhase += 1;
      }

      director.update(dt);

      ensureSolver();
      /* **无论有没有求解器都要 drain**:near 没有涟漪,不 drain 的话队列会一直
       * 攒着,切回 mid 的那一帧会突然吐出一串陈旧冲击。 */
      const queued = director.reducedMotion ? [] : director.drainImpulses();
      if (solver) {
        for (const im of queued) {
          if (!solver.injectImpulse(im.world, im.strength, im.radius)) outsideField++;
        }
        /* 固定 dt 步进,不吃真实帧间隔 —— CFL 是按固定 dt 算的,一卡帧就炸。 */
        if (!director.reducedMotion && p.timeOverride === null && !(perf && perf.currentTier().freeze)) {
          if (perf) perf.begin("ripple");
          solver.stepFixed(0.016);
          if (perf) perf.end();
        }
        if (gl && prog) {
          gl.useProgram(prog);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      }

      draw();
      if (pendingGrabs > 0) {
        pendingGrabs--;
        grabs.push(grabFrame());
      }

      /* W9:回读 timer query、推进阶梯。**必须在 draw 之后** —— begin/end 是
       * 在 draw 里发的,这一帧的 query 到这里才刚入队(要几帧后才读得到)。 */
      if (perf) {
        perf.endFrame(dt);
        const tid = perf.currentTier().id;
        if (tid !== tierApplied) {
          tierApplied = tid;
          applyRenderScale();   // 只有档位真的换了才动 canvas.width
        }
      }

      if (now - statsAt > 200) {
        statsAt = now;
        emitStats();
      }

      /* 灯球屏幕位**每帧**报出去(不限流)—— DOM 叠加层靠它逐帧跟手,拖拽才贴着鼠标。
       * 只传四个数,不构造 stats 对象,开销可忽略。 */
      const onOrb = p.onOrbFrame;
      if (onOrb) {
        const o = director.getFrameState().orb;
        onOrb(o.screen[0], o.screen[1], o.energy, o.radiusNdc);
      }

      /* ② 定格:渲完这一帧就**不再排下一帧**。面板改了参数才补一帧。 */
      if (!director.reducedMotion) rafId = requestAnimationFrame(step);
    };

    /** 补渲一帧。已经排了就不重复排;跑着 rAF 循环的时候本来就会来。 */
    function requestFrame(): void {
      if (disposed || rafId) return;
      rafId = requestAnimationFrame(step);
    }
    function start(): void {
      if (disposed || sceneError) return;
      requestFrame();
    }

    let pendingGrabs = 0;
    const grabs: { hash: number; diff: number; time: number }[] = [];
    const handle: WaterSceneHandle = {
      director,
      perf,
      requestFrame,
      grabFrame,
      stats(): WaterSceneStats {
        return {
          counters: director.stats(),
          activeSpots,
          orbScreen: [director.getFrameState().orb.screen[0], director.getFrameState().orb.screen[1]],
          orbRadiusNdc: director.getFrameState().orb.radiusNdc,
          camHeight: director.getFrameState().camHeight,
          orbEnergy: director.getFrameState().orb.energy,
          focus: director.focus,
          scroll: director.scroll,
          windFactor: director.windFactor,
          outsideField,
          fps,
          rippleReady: solver !== null,
          frozen: director.reducedMotion,
          perf: perf ? perf.sample() : null,
          error: sceneError,
        };
      },
    };
    handleRef.current = handle;
    propsRef.current.onReady?.(handle);

    /* 拿不到 WebGL2 / 着色器炸了:不进 rAF,只把错误报给面板。 */
    if (sceneError) emitStats();

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      themeObserver.disconnect();
      mq.removeEventListener("change", onMq);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      if (solver) solver.dispose();
      if (gl) {
        if (noiseTex) gl.deleteTexture(noiseTex);
        if (envLutTex) gl.deleteTexture(envLutTex);
        if (skyMaskTex) gl.deleteTexture(skyMaskTex);
        if (lightmapTex) gl.deleteTexture(lightmapTex);
        if (screenAtlasTex) gl.deleteTexture(screenAtlasTex);
        if (textAtlasTex) gl.deleteTexture(textAtlasTex);
        if (vao) gl.deleteVertexArray(vao);
        if (prog) gl.deleteProgram(prog);
        /* 主动放掉 GPU 上下文 —— 浏览器同时只肯给几个 WebGL 上下文,
         * 反复挂载/卸载这个页面不释放的话第 16 个就拿不到了。 */
        const lose = gl.getExtension("WEBGL_lose_context") as { loseContext(): void } | null;
        lose?.loseContext();
      }
      handleRef.current = null;
      propsRef.current.onReady?.(null);
    };
    /* 只跑一次:props 走 propsRef,不进依赖 —— 拖滑块重建 WebGL 上下文是荒唐的。 */
  }, []);

  /* 每次渲染之后:把最新 props 推进 ref,再补渲一帧。
   * **定格(reduced-motion)下这是唯一的重绘来源** —— 那时 rAF 循环已经停了,
   * 不补这一帧的话面板上所有滑块都是死的。 */
  useEffect(() => {
    propsRef.current = props;
    handleRef.current?.requestFrame();
  });

  return (
    <canvas
      ref={canvasRef}
      className={props.className}
      /* 触摸设备上不要让浏览器把 pointermove 当成滚动手势吃掉 */
      style={{ touchAction: "none", display: "block" }}
    />
  );
}

/** `uOrbSpots[]` 的长度,页面面板显示"×/24"时用。 */
export const WATER_SCENE_MAX_SPOTS = ORB_MAX_SPOTS;
/** 涟漪纹理边长,面板显示用。 */
export const WATER_SCENE_RIPPLE_SIZE = RIPPLE_TEX_SIZE;

export type { RippleField };
