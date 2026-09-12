"use client";

/**
 * /lab/water —— 奥伯拉丁抖动水面的原型预览页(不在站点导航内)。
 *
 * **W8 之前**这里挂的是 W1 的 `WaterDither` + `CampfireDither`(一个早期的
 * 单文件 shader 原型)。W8 换成 `WaterScene` —— 它把 W2~W7 六张卡的产出
 * (field / shade / dither / light / ripple 五个着色器模块 + 光斑求解器 +
 * 涟漪求解器 + 交互编排器)真的接了起来。
 *
 * 旧的 `src/components/lab/water-dither.tsx` **原地保留为快照**,按
 * `docs/water-dither-shader.md` §3 的归档体例 —— 它记录的是 W1 那条路,
 * 删掉等于把"为什么不走那条路"的证据一起删了。篝火与本页无关,一并摘下。
 *
 * 面板不是装饰:三个 preset 与跑分用的是**同一份参数**
 * (`src/components/lab/water/presets.ts`),拖出来的画面就是黄金帧那张。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useT, type TKey } from "@/i18n";
import {
  WATER_PRESETS,
  WATER_UNIFORM_DEFAULTS,
  blendPresetOrbGains,
  blendPresetUniforms,
} from "@/components/lab/water/presets";
import {
  WATER_PERF_BUDGET,
  WATER_QUALITY_TIERS,
} from "@/components/lab/water/perf";
import type { WaterDirectorFlags, WaterPresetName } from "@/components/lab/water/water-director";
import {
  WaterScene,
  type WaterSceneHandle,
  type WaterSceneStats,
} from "@/components/lab/water/water-scene";
import { DiscoBall } from "@/components/home/disco-ball";
import orbMeta from "../../../../public/orb/orb-loop.json";

/* ── 表 ──────────────────────────────────────────────────────────────────── */

type SliderSpec = readonly [key: string, label: TKey, min: number, max: number, step: number];

/** 波场与着色。**每一条都是 preview.frag 里真的声明了的 uniform。** */
const FIELD_SLIDERS: readonly SliderSpec[] = [
  ["uFieldChop", "waterLab.sChop", 0, 1, 0.05],
  ["uFieldChopLen", "waterLab.sChopLen", 0.1, 4, 0.05],
  ["uFieldChopBias", "waterLab.sChopBias", 0.35, 0.8, 0.01],
  ["uShadeHorizonJitter", "waterLab.sHorizonJitter", 0, 0.012, 0.0005],
  ["uShadeSkyGlowGain", "waterLab.sSkyGlow", 0, 1.5, 0.05],
  ["uShadeSkyGain", "waterLab.sSkyGain", 0.3, 1.4, 0.01],
  ["uFieldWander", "waterLab.sWander", 0, 0.6, 0.01],
  ["uFieldSpread", "waterLab.sSpread", 0.05, 0.6, 0.01],
  ["uFieldSpectralSlope", "waterLab.sSlope", -0.4, 1.6, 0.05],
  ["uFieldAmp", "waterLab.sAmp", 0.2, 3, 0.05],
  ["uFieldPatchMin", "waterLab.sPatchMin", 0, 1, 0.02],
  ["uFieldPatchDrift", "waterLab.sPatchDrift", 0, 0.12, 0.005],
  ["uFieldFetchLen", "waterLab.sFetchLen", 0, 12, 0.25],
  ["uFieldLodBias", "waterLab.sLodBias", 0.4, 8, 0.2],
  ["uShadeContrast", "waterLab.sContrast", 2, 16, 0.5],
  ["uShadePivot", "waterLab.sPivot", 0.1, 0.8, 0.005],
  ["uDitherAniso", "waterLab.sDitherAniso", 0, 1, 0.05],
  ["uDitherPixel", "waterLab.sDitherPixel", 1, 5, 1],
];

/** 灯球。**球位(y / 两个半径)不在这里** —— W8 起它跟着滚动进度走(行⑧)。 */
const ORB_SLIDERS: readonly SliderSpec[] = [
  ["uFieldOrbPatchGain", "waterLab.sOrbPatchGain", 0, 1.5, 0.05],
  // W11a 把 night 的 body 增益标到 6.0 —— 上界跟着抬到 12,不然定标值顶在头上没法往上试
  ["uOrbBodyGain", "waterLab.sOrbBodyGain", 0, 12, 0.1],
  ["uOrbSpecGain", "waterLab.sOrbSpecGain", 0, 8, 0.1],
  ["envOrbGain", "waterLab.sEnvOrbGain", 0, 0.3, 0.005],
];

/**
 * W11a 主光池的五个旋钮。**只有 night 的 preset 把增益开到非零** ——
 * 在 near/mid 上拖增益也看得见效果(池心跟着球走),但那两个构图不该有池,
 * 定标值就是 0(见 presets.ts 的 `pool` 块)。
 */
const POOL_SLIDERS: readonly SliderSpec[] = [
  ["uOrbPoolGain", "waterLab.sPoolGain", 0, 0.12, 0.002],
  ["uOrbPoolRadius", "waterLab.sPoolRadius", 2, 60, 0.5],
  ["uOrbPoolFlat", "waterLab.sPoolFlat", 0, 0.95, 0.01],
  ["uOrbPoolFar", "waterLab.sPoolFar", 0.3, 6, 0.1],
  ["uOrbPoolNear", "waterLab.sPoolNear", 0.2, 3, 0.05],
];

/**
 * W10 聚焦渐晕的五个旋钮。**闸门 `uOrbFocus` 不在这里** —— 它是一个
 * 独立的 state,由下面那个「聚焦 / 展示」按钮与滑块驱动,再经
 * `WaterScene` 的 `focus` prop 交给 `WaterDirector.setFocus()` 缓动。
 */
const FOCUS_SLIDERS: readonly SliderSpec[] = [
  ["uOrbPoolR", "waterLab.sFocusPool", 0.6, 8, 0.1],
  ["uOrbAmbient", "waterLab.sFocusAmbient", 0.2, 1, 0.01],
  ["uOrbGrain", "waterLab.sFocusGrain", 0.2, 8, 0.1],
  ["uOrbGrainBias", "waterLab.sFocusGrainBias", 0.1, 0.9, 0.01],
  ["uOrbFarKeep", "waterLab.sFocusFarKeep", 0, 1, 0.01],
];

const RIPPLE_SLIDERS: readonly SliderSpec[] = [
  ["uRippleAmp", "waterLab.sRippleAmp", 0, 10, 0.25],
  ["ripSpeed", "waterLab.sRipSpeed", 0.1, 4, 0.05],
  ["ripDamping", "waterLab.sRipDamping", 0.99, 0.9995, 0.0005],
  ["uRippleLodBias", "waterLab.sRippleLod", 0.4, 6, 0.1],
];

const PRESET_ORDER: readonly WaterPresetName[] = ["near", "mid", "night"];
const PRESET_LABEL: Record<WaterPresetName, TKey> = {
  near: "waterLab.presetNear",
  mid: "waterLab.presetMid",
  night: "waterLab.presetNight",
};
const PRESET_NOTE: Record<WaterPresetName, TKey> = {
  near: "waterLab.noteNear",
  mid: "waterLab.noteMid",
  night: "waterLab.noteNight",
};

/** 耦合矩阵的十条(W7 七条 + W8 行⑧ + W11b 行⑩⑪)。key 就是字段名。 */
const FLAG_ROWS: readonly (readonly [keyof WaterDirectorFlags, TKey])[] = [
  ["pointerRipple", "waterLab.flagPointerRipple"],
  ["orbHoverEnergy", "waterLab.flagOrbHoverEnergy"],
  ["orbFollow", "waterLab.flagOrbFollow"],
  ["scrollCamera", "waterLab.flagScrollCamera"],
  ["clickImpulse", "waterLab.flagClickImpulse"],
  ["idleWind", "waterLab.flagIdleWind"],
  ["orbExit", "waterLab.flagOrbExit"],
  ["orbScrollPose", "waterLab.flagOrbScrollPose"],
  ["orbDrag", "waterLab.flagOrbDrag"],
  ["orbExitRetreat", "waterLab.flagOrbExitRetreat"],
];

const COUNTER_CELLS: readonly (readonly [keyof WaterSceneStats["counters"], TKey])[] = [
  ["pointerEvents", "waterLab.cntPointer"],
  ["injected", "waterLab.cntInjected"],
  ["suppressedByThreshold", "waterLab.cntThreshold"],
  ["suppressedByThrottle", "waterLab.cntThrottle"],
  ["suppressedOffSurface", "waterLab.cntOffSurface"],
  ["suppressedByGate", "waterLab.cntGate"],
  ["clicks", "waterLab.cntClicks"],
  ["drags", "waterLab.cntDrags"],
];

const ALL_FLAGS_ON: WaterDirectorFlags = {
  pointerRipple: true,
  orbHoverEnergy: true,
  orbFollow: true,
  scrollCamera: true,
  clickImpulse: true,
  idleWind: true,
  orbExit: true,
  orbScrollPose: true,
  orbDrag: true,
  orbExitRetreat: true,
};

/** 选中的 preset → 滚动映射区间。**默认 night → mid**,near 接续成 mid → near。 */
function scrollRange(p: WaterPresetName): { from: WaterPresetName; to: WaterPresetName } {
  return { from: p === "near" ? "mid" : "night", to: p === "night" ? "mid" : p };
}
/** 该 preset 静止时应该停在区间的哪一端。停在端点 = 与黄金帧逐位相同。 */
const restScroll = (p: WaterPresetName): number => (p === "night" ? 0 : 1);

/**
 * 精灵图里可见球径占帧框的比例(2·r / frame)。DOM 灯球的 `size` prop 给的是**帧框**,
 * 可见球径 = `size × 该比例`。从 `orb-loop.json` 取,不手抄进页面
 * ——灯球几何的单一真相在那份 JSON(见 disco-ball.tsx 的同一算法)。
 */
const ORB_DISC_RATIO = (2 * orbMeta.ball.r) / orbMeta.frame;

/**
 * /lab/water 放宽灯球拖拽范围(默认 0.35/0.25 是主页 HR 时间线的刻意手感 ——
 * 球只在时间线位置附近小幅微调)。调参台要能把球拖到画面任意处观察,所以给一个
 * 大范围;**只传给这一页的 WaterScene,主页不传,默认手感不受影响**。
 * 想设绝对位置仍可用面板的 Orb X 滑块(-1..1)。
 */
const LAB_TUNING = { dragRangeX: 1.6, dragRangeY: 1.0 } as const;

/* ── 页面 ────────────────────────────────────────────────────────────────── */

export default function WaterLabPage() {
  const t = useT();
  const [preset, setPreset] = useState<WaterPresetName>("mid");
  const [scroll, setScroll] = useState(restScroll("mid"));
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [flags, setFlags] = useState<WaterDirectorFlags>(ALL_FLAGS_ON);
  const [orbEnergy, setOrbEnergy] = useState(1);
  /* W10 聚焦态闸门。**页面显式驱动** —— 不绑 energy、不绑滚动、
   * 不绑 IntersectionObserver(理由见 contract.ts 的 WaterFrameState.focus)。
   * 组件那边过 800 ms power4.inOut,这里给的是**目标值**。 */
  const [focus, setFocus] = useState(0);
  const [orbX, setOrbX] = useState(-0.44);
  const [orbSpin, setOrbSpin] = useState(0.625);
  const [moonHalo, setMoonHalo] = useState(0);
  const [lightMode, setLightMode] = useState<0 | 1>(0);
  const [quantize, setQuantize] = useState(true);
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [stats, setStats] = useState<WaterSceneStats | null>(null);
  /** 面板显隐:面板默认展开,但会盖住偏左上的灯球/水面,收起后只留一个小按钮看全屏效果。 */
  const [panelOpen, setPanelOpen] = useState(true);
  const handleRef = useRef<WaterSceneHandle | null>(null);
  /** 灯球叠加层容器。位置每帧命令式写(见 onOrbFrame),不走 React state —— 拖动才不卡。 */
  const orbLayerRef = useRef<HTMLDivElement | null>(null);

  /* 滑块显示的"当前值":没被覆盖时就是滚动进度解出来的那一套 ——
   * 与组件里跑的是同一个 `blendPresetUniforms`,不另算一份。 */
  const range = scrollRange(preset);
  const resolved = useMemo(
    () => blendPresetUniforms(WATER_PRESETS[range.from], WATER_PRESETS[range.to], scroll),
    [range.from, range.to, scroll],
  );
  const orbGains = useMemo(
    () => blendPresetOrbGains(WATER_PRESETS[range.from], WATER_PRESETS[range.to], scroll),
    [range.from, range.to, scroll],
  );
  const ripple = WATER_PRESETS[preset].ripple;
  /** 只有 mid 有 B 态(near 冻结、night 归 W11),其余 preset 这一分区是灰的。 */
  const hasFocus = WATER_PRESETS[preset].focus !== null;

  const valueOf = useCallback(
    (key: string): number => {
      const ov = overrides[key];
      if (ov !== undefined) return ov;
      if (key === "envOrbGain") return orbGains.envGain;
      if (key === "uFieldOrbPatchGain") return orbGains.uFieldOrbPatchGain;
      if (key === "uOrbBodyGain") return orbGains.uOrbBodyGain;
      if (key === "uOrbSpecGain") return orbGains.uOrbSpecGain;
      if (key === "ripSpeed") return ripple ? ripple.speed : 0.45;
      if (key === "ripDamping") return ripple ? ripple.damping : 0.997;
      if (key === "uRippleAmp") return ripple ? ripple.amp : 0;
      return resolved[key] ?? WATER_UNIFORM_DEFAULTS[key] ?? 0;
    },
    [overrides, orbGains, ripple, resolved],
  );

  const onReady = useCallback((h: WaterSceneHandle | null) => {
    handleRef.current = h;
  }, []);
  /* HUD / 计数板:onStats 已在 WaterScene 里限流到 5 Hz,读数够用,直接 setState。 */
  const onStats = useCallback((s: WaterSceneStats) => setStats(s), []);

  /* 灯球屏幕位**每帧**命令式写(不经 React、走 onOrbFrame 而不是限流的 onStats)——
   * 这是拖拽贴着鼠标的关键。用 transform 平移:带 blur 光晕的层在 GPU 合成层里平移,
   * 每帧不重算模糊。vw/vh 因 main 是 fixed inset-0 满视口而成立;calc(... - 50%) 对齐球心。
   * 第四个参数 radiusNdc 这里用不到(size 走节流的 stats,拖动中不变),故不声明。 */
  const onOrbFrame = useCallback(
    (screenX: number, screenY: number, energy: number) => {
      const el = orbLayerRef.current;
      if (!el) return;
      const xv = ((screenX + 1) / 2) * 100;
      const yv = ((1 - screenY) / 2) * 100;
      el.style.transform = `translate(calc(${xv}vw - 50%), calc(${yv}vh - 50%))`;
      el.style.opacity = String(Math.min(1, energy));
    },
    [],
  );

  const pickPreset = (p: WaterPresetName): void => {
    setPreset(p);
    setScroll(restScroll(p));
    setOverrides({});
    /* 换 preset 就退回展示态:只有 mid 有 B 态,near 冻结、night 归 W11。
     * 组件那边也会把 uOrbFocus 钉在 0,这里同步是为了让面板读数不撒谎。 */
    setFocus(0);
  };

  const slider = ([key, label, min, max, step]: SliderSpec) => {
    const v = valueOf(key);
    const dirty = overrides[key] !== undefined;
    const digits = Math.abs(v) >= 10 ? 1 : Math.abs(v) >= 1 ? 2 : 4;
    return (
      <label key={key} className="grid grid-cols-[7.5rem_1fr_3.2rem] items-center gap-2">
        <span className={dirty ? "text-accent" : "text-muted"}>{t(label)}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          aria-label={t(label)}
          onChange={(e) =>
            setOverrides((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))
          }
        />
        <span className="text-right tabular-nums">{v.toFixed(digits)}</span>
      </label>
    );
  };

  const counters = stats?.counters;
  /* W9:降级档位。`null` = 交给阶梯自动跑;数字 = 钉住(调参时不希望它在背后动)。
   * 状态留在页面而不是组件里 —— 钉档位是**面板的意图**,不是渲染状态。 */
  const [pinnedTier, setPinnedTier] = useState<number | null>(null);
  const pinTier = useCallback((tier: number | null) => {
    setPinnedTier(tier);
    handleRef.current?.perf?.pin(tier);
  }, []);
  const perfOverBudget = (stats?.perf?.total ?? 0) > WATER_PERF_BUDGET.total;
  const invariantSum = counters
    ? counters.injected +
      counters.suppressedByThreshold +
      counters.suppressedByThrottle +
      counters.suppressedOffSurface +
      counters.suppressedByGate
    : 0;

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <WaterScene
        preset={preset}
        scroll={scroll}
        orbEnergy={orbEnergy}
        focus={focus}
        orbX={orbX}
        orbSpin={orbSpin}
        lightMode={lightMode}
        quantize={quantize}
        moonHalo={moonHalo}
        overrides={overrides}
        flags={flags}
        timeOverride={held ? 2.5 : null}
        forceReducedMotion={reduced}
        tuning={LAB_TUNING}
        dragPersist
        onReady={onReady}
        onStats={onStats}
        onOrbFrame={onOrbFrame}
        className="h-full w-full"
      />

      {/* ── 灯球 DOM 叠加层 ────────────────────────────────────────────────
          物理灯球本体(disco-ball 精灵图)叠在 WebGL 水面之上。水面只画球在水里的
          **倒影 / 光池**;这一层把球本身按同一套几何摆到光源处,于是看到的球与水面
          的光是同一颗。
          · 位置与半径取自 `stats.orbScreen` / `orbRadiusNdc` —— 与照亮水面用的是
            同一份(行⑧滚动插值之后的)几何,不在页面里重算一遍(坑 7:球位是
            派生量,抄第二遍必漂)。NDC→屏幕:x∈[-1,1] 右正 → 左偏移;y∈[-1,1] 上正 → 上偏移。
          · 可见球径 = `orbRadiusNdc × 视口高`;`size`(帧框)= 可见球径 / ORB_DISC_RATIO。
            main 是 fixed inset-0(满视口),故 1vh = 1% 视口高。
          · glow 与整体不透明度跟随 `orbEnergy`:energy=0 时球隐去,与「水面一点残光
            都没有」(闸门②)对齐。
          · pointer-events:none —— 涟漪/拖拽的指针事件必须落到水面 canvas。
          · 自转走 disco-ball 自己的时钟;水面高光相位由 orbSpin 单独驱动。两者的相位
            联动属主页 HR 时间线(交接书 T1/T2),本调参页不做。 */}
      {stats && !stats.error ? (
        <div
          ref={orbLayerRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 will-change-transform"
          /* transform / opacity 由 onStats 每帧命令式写(拖动跟手、零重渲染、GPU 合成平移)。
             top-0 left-0 让 transform 的 vw/vh 从视口左上起算;初值 opacity:0 免得挂载到
             首帧赋值之间闪在左上角。size(帧框)随 orbRadiusNdc 变,只在切 preset / 滚动时动。 */
          style={{ opacity: 0 }}
        >
          <DiscoBall
            size={`${(stats.orbRadiusNdc / ORB_DISC_RATIO) * 100}vh`}
            glow={Math.min(1, orbEnergy)}
            spinDuration={7}
            ringDuration={14}
          />
        </div>
      ) : null}

      {panelOpen ? (
      <section
        className="absolute top-4 left-4 max-h-[calc(100dvh-2rem)] w-[22rem] select-none
                   overflow-y-auto rounded-lg border border-border bg-background/85 p-4
                   font-mono text-caption leading-relaxed backdrop-blur-md"
        data-testid="water-panel"
      >
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-subheading">{t("waterLab.title")}</h1>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="shrink-0 rounded border border-border px-2 py-1 text-muted"
          >
            {t("waterLab.panelHide")}
          </button>
        </div>
        <p className="mt-1 text-muted">{t("waterLab.subtitle")}</p>

        {/* ── preset ─────────────────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PRESET_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === preset}
              data-preset={p}
              onClick={() => pickPreset(p)}
              className={`rounded border px-2 py-1 ${
                p === preset ? "border-accent text-accent" : "border-border text-muted"
              }`}
            >
              {t(PRESET_LABEL[p])}
            </button>
          ))}
        </div>
        <p className="mt-2 text-muted">{t(PRESET_NOTE[preset])}</p>

        {/* ── 状态行 ─────────────────────────────────────────────── */}
        <p className="mt-2 tabular-nums" data-testid="water-hud">
          {stats
            ? `${preset} · ${stats.camHeight.toFixed(2)} m · ${t("waterLab.cntSpots")} ` +
              `${stats.activeSpots} · ${t("waterLab.cntEnergy")} ${stats.orbEnergy.toFixed(2)} · ` +
              `${t("waterLab.cntFocus")} ${stats.focus.toFixed(2)} · ` +
              `${Math.round(stats.fps)} ${t("waterLab.cntFps")}${stats.frozen ? " · ❄" : ""}`
            : "…"}
        </p>
        {stats?.error ? (
          <p className="mt-1 text-accent">
            {stats.error === "no-webgl2"
              ? t("waterLab.errNoWebgl2")
              : stats.error === "theme-token"
                ? t("waterLab.errTheme")
                : stats.error === "noise"
                  ? t("waterLab.errNoise")
                  : t("waterLab.errShader")}
          </p>
        ) : null}
        {stats && !stats.rippleReady && ripple ? (
          <p className="mt-1 text-muted">{t("waterLab.rippleOff")}</p>
        ) : null}

        {/* ── 模式开关 ───────────────────────────────────────────── */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Toggle on={quantize} onClick={() => setQuantize((v) => !v)}>
            {quantize ? t("waterLab.quantize") : t("waterLab.continuous")}
          </Toggle>
          <Toggle on={held} onClick={() => setHeld((v) => !v)}>
            {held ? t("waterLab.freeze") : t("waterLab.play")}
          </Toggle>
          <Toggle on={reduced} onClick={() => setReduced((v) => !v)}>
            {t("waterLab.reducedMotion")}
          </Toggle>
          <Toggle on={lightMode === 1} onClick={() => setLightMode((m) => (m === 0 ? 1 : 0))}>
            {lightMode === 0 ? t("waterLab.modeA") : t("waterLab.modeB")}
          </Toggle>
          <Toggle on={false} onClick={() => setOverrides({})}>
            {t("waterLab.reset")}
          </Toggle>
        </div>

        {/* ── 滚动 ───────────────────────────────────────────────── */}
        <Section title={t("waterLab.sectionScroll")} />
        <label className="grid grid-cols-[7.5rem_1fr_3.2rem] items-center gap-2">
          <span className="text-muted">{t("waterLab.scrollProgress")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={scroll}
            aria-label={t("waterLab.scrollProgress")}
            data-testid="water-scroll"
            onChange={(e) => setScroll(parseFloat(e.target.value))}
          />
          <span className="text-right tabular-nums">{scroll.toFixed(2)}</span>
        </label>
        <p className="mt-1 text-muted">
          {range.from} → {range.to} · {t("waterLab.scrollHint")}
        </p>

        {/* ── 灯球 ───────────────────────────────────────────────── */}
        <Section title={t("waterLab.sectionOrb")} />
        <div className="grid gap-1.5">
          <Range
            label={t("waterLab.sOrbEnergy")}
            min={0}
            max={1.45}
            step={0.01}
            value={orbEnergy}
            onChange={setOrbEnergy}
          />
          <Range label={t("waterLab.sOrbX")} min={-1} max={1} step={0.01} value={orbX} onChange={setOrbX} />
          <Range
            label={t("waterLab.sOrbSpin")}
            min={0}
            max={1}
            step={0.005}
            value={orbSpin}
            onChange={setOrbSpin}
          />
          {ORB_SLIDERS.map(slider)}
          {POOL_SLIDERS.map(slider)}
          <Range
            label={t("waterLab.sMoonHalo")}
            min={0}
            max={0.12}
            step={0.005}
            value={moonHalo}
            onChange={setMoonHalo}
          />
          <div className="flex gap-2">
            <Toggle
              on={false}
              onClick={() => {
                const d = handleRef.current?.director;
                if (!d) return;
                if (d.exitElapsed >= 0) d.cancelOrbExit();
                else d.beginOrbExit();
                handleRef.current?.requestFrame();
              }}
            >
              {t("waterLab.triggerExit")}
            </Toggle>
          </div>
        </div>

        {/* ── mid 聚焦(W10)─────────────────────────────────────── */}
        <Section title={t("waterLab.sectionFocus")} />
        {hasFocus ? (
          <div className="grid gap-1.5">
            <Range
              label={t("waterLab.sFocus")}
              min={0}
              max={1}
              step={0.01}
              value={focus}
              onChange={setFocus}
            />
            {FOCUS_SLIDERS.map(slider)}
            <div className="flex gap-2">
              <Toggle on={focus >= 0.5} onClick={() => setFocus((v) => (v >= 0.5 ? 0 : 1))}>
                {focus >= 0.5 ? t("waterLab.focusOn") : t("waterLab.focusOff")}
              </Toggle>
            </div>
            <p className="text-muted">{t("waterLab.focusHint")}</p>
          </div>
        ) : (
          <p className="mt-1 text-muted">{t("waterLab.focusNone")}</p>
        )}

        {/* ── 涟漪 ───────────────────────────────────────────────── */}
        <Section title={t("waterLab.sectionRipple")} />
        <div className="grid gap-1.5">{RIPPLE_SLIDERS.map(slider)}</div>
        <p className="mt-1 text-muted">{t("waterLab.clickHint")}</p>

        {/* ── 波场与着色 ─────────────────────────────────────────── */}
        <Section title={t("waterLab.sectionField")} />
        <div className="grid gap-1.5">{FIELD_SLIDERS.map(slider)}</div>

        {/* ── 耦合矩阵 ───────────────────────────────────────────── */}
        <Section title={t("waterLab.sectionCoupling")} />
        <div className="flex flex-wrap gap-1.5">
          {FLAG_ROWS.map(([key, label]) => (
            <Toggle
              key={key}
              on={flags[key]}
              onClick={() => setFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              {t(label)}
            </Toggle>
          ))}
        </div>

        {/* ── 计数板 ─────────────────────────────────────────────── */}
        <Section title={t("waterLab.sectionCounters")} />
        <div className="grid grid-cols-4 gap-1.5 tabular-nums" data-testid="water-counters">
          {COUNTER_CELLS.map(([key, label]) => (
            <div key={key} className="rounded border border-border px-1.5 py-1">
              <div className={counters && counters[key] > 0 ? "text-accent" : ""}>
                {counters ? counters[key] : 0}
              </div>
              <div className="text-muted">{t(label)}</div>
            </div>
          ))}
          <div className="rounded border border-border px-1.5 py-1">
            <div>{stats ? stats.outsideField : 0}</div>
            <div className="text-muted">{t("waterLab.cntOutside")}</div>
          </div>
          <div className="rounded border border-border px-1.5 py-1">
            <div data-testid="water-spots">{stats ? stats.activeSpots : 0}</div>
            <div className="text-muted">{t("waterLab.cntSpots")}</div>
          </div>
          <div className="rounded border border-border px-1.5 py-1">
            <div>{stats ? stats.camHeight.toFixed(2) : "—"}</div>
            <div className="text-muted">{t("waterLab.cntCam")}</div>
          </div>
          <div className="rounded border border-border px-1.5 py-1">
            <div>{stats ? stats.windFactor.toFixed(2) : "—"}</div>
            <div className="text-muted">{t("waterLab.cntWind")}</div>
          </div>
        </div>
        <p className="mt-1.5 text-muted tabular-nums">
          pointerEvents {counters ? counters.pointerEvents : 0} = {invariantSum}
          {counters && counters.pointerEvents === invariantSum ? " ✓" : " ✗"}
        </p>
        {/* W9 性能条。**source 必须显示** —— cpu 那档量的是 rAF 帧间隔,
            不是 GPU 帧时间,拿它当 GPU 汇报就是在骗自己(见 perf.ts 文件头)。 */}
        <p className="mt-1.5 text-muted tabular-nums">
          {t("waterLab.perfLabel")}{" "}
          <span className={stats?.perf?.source === "gpu" ? "text-accent" : ""}>
            {stats?.perf ? stats.perf.source : "—"}
          </span>{" "}
          · ripple {stats?.perf ? stats.perf.ripple.toFixed(2) : "—"} ms · water{" "}
          {stats?.perf ? stats.perf.water.toFixed(2) : "—"} ms · {t("waterLab.perfTotal")}{" "}
          <span className={perfOverBudget ? "text-accent" : ""}>
            {stats?.perf ? stats.perf.total.toFixed(2) : "—"}
          </span>
          /{WATER_PERF_BUDGET.total} ms · {t("waterLab.perfTier")} {stats?.perf ? stats.perf.tier : 0}
          {stats?.perf?.pinned ? " (pin)" : ""} · ↓{stats?.perf ? stats.perf.overFrames : 0} ↑
          {stats?.perf ? stats.perf.underFrames : 0}
          {stats?.perf && stats.perf.disjointDrops > 0
            ? ` · disjoint ${stats.perf.disjointDrops}`
            : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="text-muted">{t("waterLab.perfPin")}</span>
          <Toggle on={pinnedTier === null} onClick={() => pinTier(null)}>
            {t("waterLab.perfAuto")}
          </Toggle>
          {WATER_QUALITY_TIERS.map((q) => (
            <Toggle key={q.id} on={pinnedTier === q.id} onClick={() => pinTier(q.id)}>
              {q.id}
            </Toggle>
          ))}
        </div>
        <div className="mt-2">
          <Toggle
            on={false}
            onClick={() => {
              handleRef.current?.director.resetCounters();
              handleRef.current?.requestFrame();
            }}
          >
            {t("waterLab.resetCounters")}
          </Toggle>
        </div>
      </section>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 left-4 rounded-lg border border-border bg-background/85
                     px-3 py-2 font-mono text-caption text-muted backdrop-blur-md"
        >
          {t("waterLab.panelShow")}
        </button>
      )}
    </main>
  );
}

/* ── 小部件 ──────────────────────────────────────────────────────────────── */

function Section({ title }: { title: string }) {
  return (
    <h2 className="mt-4 mb-1.5 border-t border-border pt-2 text-muted uppercase">{title}</h2>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded border px-2 py-1 ${
        on ? "border-accent text-accent" : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Range({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid grid-cols-[7.5rem_1fr_3.2rem] items-center gap-2">
      <span className="text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="text-right tabular-nums">{value.toFixed(2)}</span>
    </label>
  );
}
