/**
 * presets.ts —— 三个 preset 的**唯一真相来源**(W8 建立)
 *
 * W3~W7 期间参数散在三处:`golden/w3/run.mjs` 的 `PRESETS`(跑分)、
 * `scripts/gen-water-preview.mjs` 的 `DEFAULTS`(预览台)、以及各处零星的复写。
 * W8 把它们收敛到本文件,然后让上面两处**反过来 import 它**——
 * 抄一遍就是 docs §11 坑 7 那一族(产物与源悄悄漂移,而且沉默失效)。
 *
 * 现在的依赖方向:
 *
 *   presets.ts ──► golden/w3/run.mjs        (跑分 / 黄金帧)
 *              ──► scripts/gen-water-preview.mjs (预览台)
 *              ──► src/components/lab/water/water-scene.tsx (站点组件)
 *              ──► golden/w3/build.ts       (只用来跑防漂移断言)
 *
 * ── ⚠️ 只许 `import type` ────────────────────────────────────────────────
 * `golden/w3/run.mjs` 与 `scripts/gen-water-preview.mjs` 用**裸 node**
 * `import()` 本文件(Node 22 原生擦除类型),而裸 node 解析不了 `./contract`
 * 这种省略扩展名的**值**导入。类型导入会被整条擦掉,所以没有这个问题。
 * 同样的约束写在 `orb-light.ts` / `water-director.ts` / `ripple.ts` 文件头。
 * 要用别处的常量,请在本文件重新声明,并在 `golden/w3/build.ts` 加一致性断言。
 */
import type { WaterPresetName } from "./water-director";

/* ────────────────────────────────────────────────────────────────────────
 * 相机
 * ──────────────────────────────────────────────────────────────────────── */

/** 一个 preset 的相机。与 `water-director.ts` 的 `WaterCameraStop` 同形。 */
export interface WaterPresetCamera {
  camHeight: number;
  camPitch: number;
  fovY: number;
}

/**
 * 三个 preset 的相机。**这是相机的唯一定义处** —— 下面 `set` 里的
 * `uFieldCamHeight/Pitch/FovY` 直接引用它,不再写第二遍数字。
 * `water-director.ts` 的 `WATER_CAMERA_STOPS` 是它的第二份拷贝(那边只许
 * import type),`golden/w3/build.ts` 有断言兜底。
 */
export const WATER_PRESET_CAMERAS: Record<WaterPresetName, WaterPresetCamera> = {
  near: { camHeight: 0.35, camPitch: 0.335, fovY: 0.553 },
  mid: { camHeight: 1.6, camPitch: 0.37, fovY: 0.61 },
  night: { camHeight: 4.0, camPitch: -0.1413, fovY: 0.61 },
};

/* ────────────────────────────────────────────────────────────────────────
 * 灯球球位(W5 定标,W8 变成滚动插值的端点)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * 一个 preset 的灯球球位。**三个相机的几何差太多,一套球位不可能同时对** ——
 * W7 挖出来的「滚动到 mid 灯球从 22 斑变成 0 斑」正是因为球位没跟着滚动走
 * (根因见 `water-director.ts` 的 `WATER_ORB_STOPS`)。
 */
export interface WaterPresetOrbPose {
  /** 球心的 NDC y */
  screenY: number;
  /** 球在屏幕上的半径(NDC 纵向半高为单位) */
  radiusNdc: number;
  /** 球的世界半径(米)。**它和 radiusNdc 一起定出球心的世界坐标** */
  worldRadius: number;
}

/**
 * 三个 preset 的球位。**唯一定义处**;`water-director.ts` 的 `WATER_ORB_STOPS`
 * 是拷贝,`golden/w3/build.ts` 有断言。每个数的由来:
 *
 * · **near** —— 相机只有 0.35 m 高,`worldRadius` 0.22 会把球心解到**水面以下**
 *   (视线向下,距离越远越低)。0.07 m 的小球在 1.8 m 外、水面上 0.15 m,
 *   光斑尺度跟着缩到分米级,和这个构图里其它一切一样小。
 * · **mid** —— 地平线在 ndc.y=1.234(画面外),画面里任何位置都在地平线以下,
 *   球只能"低低地悬在湖面上",y 顶到 0.80 已是几何允许的最高处。
 *   `radiusNdc` 0.16→0.10 是实测挑的:0.16 时球只有 4.2 m 远,光斑落在 3~8 m,
 *   而 mid 的暗划线带在 8~24 m —— 光斑几乎全落在本来就是饱和白的前景上,
 *   照度通道只改到 817 个像素(0.04%)。0.10 时球退到 6.8 m,光斑落进暗划线带,
 *   改到 11435 个(0.55%);0.08 更远,52k(2.51%)但总分掉到 0.911。取 0.10。
 * · **night** —— 唯一**抬头**的构图(camPitch −0.14,地平线在 ndc.y=−0.45),
 *   球真的在天上。`worldRadius` 必须大:4 m 高、几乎平视,画面下缘对应的水面
 *   已经在 24.3 m 之外。0.35 m 的球解出来只有 6.5 m 远、5.8 m 高,光斑全落在
 *   画框下缘之外(实测三条通道一个像素都没改到画面)。1.8 m 的球在 36 m 外、
 *   13.7 m 高,光斑铺在 20~90 m,正好落在可见水面上。
 *   **W11a 把它推到 2.6 m**(球退到 48.4 m 外):光斑从贴着画面下缘的
 *   y 920~1079(三分之一在画外)抬到 y 860~1010,整片进框。
 *
 *   **这是零光度代价的位移,不是"把灯调远调暗"。** 光斑峰值强度
 *   ∝ h²/t²(见 orb-light.ts 的 `inten`):球心高度 h 与光程 t **都**正比于
 *   `worldRadius`(几何相似 —— NDC 位置与 NDC 半径都没动,整个构型只是等比
 *   放大),h²/t² 因此不变。实测:22 个斑的强度分布(峰值 0.385 / 中位 0.05)
 *   在 1.8 → 2.6 前后**一位不差**,变的只有落点。
 *
 * `radiusNdc` 的 0.16 是 `orb-light.ts` 的 `orbDemoSource()` 默认值 ——
 * W5 时 near/night 没有覆盖它,这里把那个隐含默认写成显式的数。
 */
export const WATER_PRESET_ORB_POSES: Record<WaterPresetName, WaterPresetOrbPose> = {
  near: { screenY: 0.8, radiusNdc: 0.16, worldRadius: 0.07 },
  mid: { screenY: 0.8, radiusNdc: 0.1, worldRadius: 0.22 },
  night: { screenY: 0.42, radiusNdc: 0.16, worldRadius: 2.6 },
};

/* ────────────────────────────────────────────────────────────────────────
 * preset 本体
 * ──────────────────────────────────────────────────────────────────────── */

/** 灯球那一组:三条着色通道的增益 + 环境注入。球位见 `WATER_PRESET_ORB_POSES`。 */
export interface WaterPresetOrb {
  /** 波幅通道:灯球照到的地方水更「活」。**调的是波幅不是亮度** */
  uFieldOrbPatchGain: number;
  /** 漫射池增益:光斑落点进 (1−F)·body 的那一路 */
  uOrbBodyGain: number;
  /** 镜面光路增益:球在水里的像被波面打散的那一路,进 F·spec */
  uOrbSpecGain: number;
  uOrbPatchGain: number;
  uOrbSpecClip: number;
  /** 注入环境列的峰值增益(energy=1 时)。**near 必须 0**,见下面注释 */
  envGain: number;
  /**
   * 灯球满能量时月光镜面增益让到多少(W11a)。`null` = 不让位。
   *
   * 用户选了「灯球压过月光」。但硬门是 **`uOrbEnergy = 0` 时 night 必须逐字节
   * 等于现在的定稿**,所以不能把 night 的 `uShadeSpecGain` 直接写成 4000 ——
   * 那样连不开灯球的黄金帧都变了。做法是让它成为 energy 的函数,由 CPU 侧
   * 按 energy 插值:`moonSpecGainFor()` 是**唯一实现处**,三个消费端都调它。
   */
  moonSpecGainLit: number | null;
}

/**
 * 主光池那一组(W11a 定标)。**只有 night 有** —— near 已冻结,
 * mid 的前景早被 tonemap 顶成饱和白,往上加光是零收益(见 W10 的渐晕那一段)。
 *
 * 五个数就是 `light.glsl.ts` 的 `waterOrbMainPool` 那五个 uniform。
 * 池心 `uOrbCenter.xz` 不在这里:它是球心的**派生量**,shader 直接从
 * `uOrbCenter` 取,写死一份就会漂(docs §11 坑 7)。
 */
export interface WaterPresetPool {
  /** 主光池峰值照度。0 = 关(`waterOrbMainPool` 第一行就返回 0.0) */
  uOrbPoolGain: number;
  /** 池的横向世界半径(米) */
  uOrbPoolRadius: number;
  /** 平顶比例 0..1:d < 它的部分恒为 1.0,它到 1 之间是三次裙边 */
  uOrbPoolFlat: number;
  /** 远侧(背离相机)沿视线的拉长倍数 */
  uOrbPoolFar: number;
  /** 近侧(朝向相机)的拉长倍数。**必须 < 1**,见 WATER_PRESETS.night.pool */
  uOrbPoolNear: number;
}

/** 涟漪那一组(W6 定标)。`near` 为 null —— 用户明确要求 near 保持关闭。 */
export interface WaterPresetRipple {
  /** "x,y,边长":纹理覆盖的世界区域左下角与边长(米) */
  world: string;
  steps: number;
  dt: number;
  /** 波速 c(m/s) */
  speed: number;
  damping: number;
  /** 消费端增益(uRippleAmp) */
  amp: number;
  probe: string;
  /** "x,y,强度,半径":默认冲击 */
  impulse: string;
}

/**
 * 聚焦渐晕那一组(W10 定标)。**只有 mid 有** ——
 * near 已冻结(用户明确要求),night 归 W11。
 *
 * 五个数就是预览台「mid 聚焦」分区的五个滑块;`uOrbFocus` 本身是**闸门**
 * 不是参数,不放在这里(它由页面/编排器驱动,静息值恒为 0)。
 * `uOrbGround` 也不在这里:它是球心落点的**派生量**,由 CPU 侧从
 * `computeOrbUniforms().center` 直接取,写死一份就会漂(docs §11 坑 7)。
 */
export interface WaterPresetFocus {
  /** 光池半径(米) */
  uOrbPoolR: number;
  /** 池外残留系数(乘在 body 上)。有效 body = uShadeBody × 它 */
  uOrbAmbient: number;
  /** 碎粒频率(1/米) */
  uOrbGrain: number;
  /** 碎粒阈值(waterVNoise 的分位数) */
  uOrbGrainBias: number;
  /** 远景带保护系数:远处只压到这个比例 */
  uOrbFarKeep: number;
}

export interface WaterPreset {
  /** `scripts/water-metrics.mjs --baseline` 用的参考图名 */
  baseline: string;
  /** 环境列 LUT 的产物路径(`golden/w3/build.ts` 生成) */
  lut: string;
  camera: WaterPresetCamera;
  /** 直接写进 uniform 的一组数。键名就是 GLSL 里的 uniform 名 */
  set: Record<string, number>;
  orb: WaterPresetOrb;
  ripple: WaterPresetRipple | null;
  /** W10 聚焦态。`null` = 这个 preset 没有 B 态(near 冻结 / night 归 W11) */
  focus: WaterPresetFocus | null;
  /** W11a 主光池。`null` = 这个 preset 不开主光池(near 冻结 / mid 前景已饱和) */
  pool: WaterPresetPool | null;
}

/**
 * mid 的聚焦态定标值。**唯一定义处** —— 下面 `WATER_PRESETS.mid.focus` 与
 * `WATER_UNIFORM_DEFAULTS` 都引用它,不再写第二遍数字(抄一遍就是 docs §11 坑 7)。
 */
const MID_FOCUS: WaterPresetFocus = {
  uOrbPoolR: 2.6,
  uOrbAmbient: 0.58,
  uOrbGrain: 2.0,
  uOrbGrainBias: 0.42,
  uOrbFarKeep: 0.28,
};

/**
 * night 的主光池定标值(W11a)。**唯一定义处** —— `WATER_PRESETS.night.pool`
 * 与 `WATER_UNIFORM_DEFAULTS` 都引用它(后者把增益压回 0 当"关闭"态)。
 *
 * 每个数的由来见 `WATER_PRESETS.night.pool` 那一段。
 */
const NIGHT_POOL: WaterPresetPool = {
  uOrbPoolGain: 0.04,
  uOrbPoolRadius: 20,
  uOrbPoolFlat: 0.35,
  uOrbPoolFar: 2.6,
  uOrbPoolNear: 0.55,
};

const NEAR_CAM = WATER_PRESET_CAMERAS.near;
const MID_CAM = WATER_PRESET_CAMERAS.mid;
const NIGHT_CAM = WATER_PRESET_CAMERAS.night;

/**
 * 三个 preset 的**全部**参数。注释里的每个数都是扫参 + 对着实拍照肉眼比对
 * 挑出来的,改之前先读 `docs/water-reference-metrics.md` §13。
 *
 * **near 冻结** —— 用户明确要求 near 保持现状,W8 一个数都没动。
 */
export const WATER_PRESETS: Record<WaterPresetName, WaterPreset> = {
  mid: {
    baseline: "mid",
    lut: "golden/w3/env-mid.png",
    camera: MID_CAM,
    set: {
      uDitherPixel: 2,
      uDitherAniso: 0.8,
      uFieldCamHeight: MID_CAM.camHeight,
      uFieldCamPitch: MID_CAM.camPitch,
      uFieldFovY: MID_CAM.fovY,
      uFieldFetchLen: 7.0,
      uFieldLodBias: 5.0,
      uFieldAmp: 1.5,
      /* W2 的默认散布是 0.25;W3 收到 0.15 —— 波脊更平行 → 峰值带暗划线更长更疏,
       * featureCoverage 28.5→24.7(基线 19.6±5)。这是 W3 唯一改动的 W2 参数,
       * 渲染台默认值仍留 0.25 不动。 */
      uFieldSpread: 0.15,
      /* ④ 波脊断裂(见 docs §13)。spread 0.15 让 24 个分量几乎共向,干涉图案退化成
       * 只随 y 变化的一维函数 —— 上部那片贯穿全幅的平行横线就是这么来的。
       * len 0.85m / aniso 0.5 / bias 0.62 是扫参 + 肉眼比对实拍照选的:
       * 实拍里暗划的**空隙比划本身长**,所以 bias 必须 >0.5。 */
      uFieldChop: 1.0,
      uFieldChopLen: 0.85,
      uFieldChopAniso: 0.5,
      uFieldChopBias: 0.62,
      uFieldChopMin: 0.02,
      uFieldChopMax: 1.7,
      uFieldChopEdge: 0.14,
      uShadeEnvLutScale: 2.0,
      uShadeEnvLutMin: -0.2,
      uShadeEnvLutMax: 1.0,
      uShadeBody: 0.62,
      uShadeEnvGain: 1.0,
      uShadeSpecGain: 0.0,
      uShadeLightOmega: 6.8e-5,
      uShadeLightElev: 0.35,
      uShadeLightAz: 0.0,
      uShadeSigmaFloor: 2e-4,
      uShadeSpecClip: 1.5,
      uShadeExposure: 0.1,
      uShadeContrast: 8.0,
      uShadePivot: 0.48,
      uShadeSkyGain: 1.0,
    },
    /* W5 灯球。**默认不开** —— `set` 里没有 uOrbEnergy,渲染台默认 0,
     * 于是 orbPatch / waterOrbIrradiance 精确返回 0.0,输出与 W4 定稿逐字节相同。
     *
     * 增益是**显示量纲**不是物理量(同 uShadeSpecGain=1e4 的道理)。
     * body 要到 3.0 才推得动:mid 的 tonemap 是 contrast 8 / pivot 0.48,
     * 前景早被顶成饱和白,光斑只能在**峰值带的暗划线**里显形 ——
     * 那里 F≈0.74,(1−F)·gain·E 要 >0.17 才把一条暗划翻成白。 */
    orb: {
      uFieldOrbPatchGain: 0.9,
      uOrbBodyGain: 3.0,
      uOrbSpecGain: 2.5,
      uOrbPatchGain: 1.0,
      uOrbSpecClip: 1.5,
      /* mid 的注入仰角解出来是 0.526,远在岸线边界(0.33±0.04)之上,
       * 落在天空段,所以安全 —— near 的 0.328 正好压在边界上,那一档必须归零。 */
      envGain: 0.1,
      /** mid 的月光是关的(uShadeSpecGain = 0),没有什么可让位的。 */
      moonSpecGainLit: null,
    },
    /* ── W6 涟漪 ────────────────────────────────────────────────────────────
     * 覆盖 8 m 见方、左下角 (−4, 2)。这块地不是随手划的:mid 的可见水面从
     * **y≈2.0 m**(画面下缘)一直到 **24.8 m**(上缘),峰值带 4 落在 **4.55 m**。
     * 8 m 的方块正好盖住峰值带那一片暗划线,再往远处铺纯属浪费纹素。
     *
     * c = 0.45 m/s 不是拍脑袋:10 cm 波长的重力-毛细相速度
     * sqrt(g/k + (σ/ρ)k) = 0.40 m/s,取 0.45。Δx = 8/256 = 31.25 mm
     * ⇒ C = 0.45×0.016/0.03125 = **0.230**,离 0.7 的 CFL 上限还有 3 倍余量。
     *
     * amp 4.0 是消费端增益。1.0 时涟漪只翻动 640 个像素(0.03%)——
     * 涟漪的斜率 a·k ≈ 0.018,而波场自己的 |∇h| p99 是 0.12,差 6 倍。 */
    ripple: {
      world: "-4,2,8",
      steps: 60,
      dt: 0.016,
      speed: 0.45,
      damping: 0.997,
      amp: 4.0,
      probe: "10,20,30,40,50,60",
      impulse: "0,6,0.006,0.15",
    },
    /* ── W10 聚焦态(B 态)──────────────────────────────────────────────────
     * `uOrbFocus` 从 0 推到 1 就在 A/B 之间过渡;闸门本身不在这里(见类型注释)。
     *
     * · **池半径 2.6 m** —— 球解出来在 (−1.12, 6.85) m、离水面 0.75 m。
     *   池子在世界空间量,近边宽、远端压扁是逆投影自己给的。
     * · **池外系数 0.58** ⇒ 有效 body = 0.62 × 0.58 = **0.36**。
     *   mid 的 tonemap 只在 lum ∈ [0.41, 0.53] 之间给得出中间调
     *   ((lum−0.48)×8+0.58 落在 (0,1) 的区间),0.36 稳稳在下界外 = 纯墨;
     *   0.28 也是纯墨但把远景一起吃掉,0.45 已经开始返灰。
     * · **碎粒 2.0 /m、阈值 0.42** —— 迪斯科球把光打碎成一地亮斑,池子内部
     *   不该是一块均匀的亮。waterVNoise 的 p50 是 0.50,阈值压到 0.42 让约
     *   六成面积保持全亮,其余降到 mix 的下界 0.55(不是 0 —— 归零会把池子
     *   劈成死黑死白两片)。
     * · **远景保护 0.28** —— 远处只压到 28% 的力度。这一条是 §3 验收②的落点,
     *   而且它和 light.glsl.ts 的 WATER_ORB_FAR_SPAN 是**一起扫出来的**:
     *   起点放在球的落点、跨度 4 个池半径、保护 0.45 那一版,
     *   band 2/3/4 的 RMS 从 35.2/43.2/47.0 掉到 **7.6/8.0/5.5** ——
     *   整条对岸带死成一片纯墨,正是任务书说的"全暗那一版"。
     *   把爬升挪到光池近边、保护压到 0.28 之后是 **38.0/43.6/16.3**:
     *   band 2/3(对岸)原样保住,band 4(池子前面那一段)按预期沉下去。 */
    focus: MID_FOCUS,
    /** **mid 没有主光池**:前景 tonemap 输出算出来是 1.70、被 clamp 到 1,
     *  往饱和白上加光是零收益 —— mid 的 B 态走的是 W10 那条**乘法**渐晕。 */
    pool: null,
  },

  near: {
    baseline: "near",
    lut: "golden/w3/env-near.png",
    camera: NEAR_CAM,
    set: {
      /* W3 之后重调(见 docs §10):near 的参考特征本来就接近方形(dashAspect 1.5),
       * 却沿用了 mid 的横向拉伸抖动。aniso 归零后 dashAspect 3.17→2.00 进区间。 */
      uDitherPixel: 2,
      uDitherAniso: 0.0,
      uFieldCamHeight: NEAR_CAM.camHeight,
      uFieldCamPitch: NEAR_CAM.camPitch,
      uFieldFovY: NEAR_CAM.fovY,
      uFieldFetchLen: 1.5,
      uFieldLodBias: 5.0,
      uFieldAmp: 1.5,
      uShadeEnvLutScale: 2.0,
      uShadeEnvLutMin: -0.2,
      uShadeEnvLutMax: 1.0,
      uShadeBody: 0.62,
      uShadeEnvGain: 1.0,
      uShadeSpecGain: 0.0,
      uShadeLightOmega: 6.8e-5,
      uShadeLightElev: 0.35,
      uShadeLightAz: 0.0,
      uShadeSigmaFloor: 2e-4,
      uShadeSpecClip: 1.5,
      uShadeExposure: 0.06,
      uShadeContrast: 12.0,
      uShadePivot: 0.575,
      uShadeSkyGain: 1.0,
    },
    /* near 的对比度是 12、支点 0.575 —— 前景本来就被顶到饱和白,再加照度会整片糊掉。
     * 所以近景的灯球主要靠**波幅通道**表现(照到的地方波更活 → 反而更暗更有结构),
     * 照度增益压到 mid 的三分之一。
     *
     * **两个悬崖,都是实测**:
     *  · uFieldOrbPatchGain 0.30 → 覆盖率 38.2 / band 5(基线 38.5 / 5);
     *    0.45 → 覆盖率 72.6 / band 3,总分 0.810。和 docs §13.1 那条
     *    "near 一加波脊断裂覆盖率就从 38.5 飙到 78" 是同一个悬崖。
     *  · envGain 必须 0:near 的注入仰角解出来是 **0.328**,而 near 的岸线边界
     *    在 0.36、过渡带 ±0.04 —— 注入的高斯正好压在**产生暗划线的那条边**上,
     *    等于全画面改环境列。实测只开这一项(三条着色通道全关)就把
     *    峰值带从 5 打到 3、覆盖率打到 73.5。这是 docs §9 坑 9 的同类。 */
    orb: {
      uFieldOrbPatchGain: 0.3,
      uOrbBodyGain: 1.5,
      uOrbSpecGain: 1.5,
      uOrbPatchGain: 1.0,
      uOrbSpecClip: 1.2,
      envGain: 0.0,
      /** near 的月光也是关的,而且 near 已冻结 —— W11a 一个数都没动它。 */
      moonSpecGainLit: null,
    },
    /** **near 没有涟漪**:用户明确要求 near 不做下一步,W6 也没给它 ripple 块。 */
    ripple: null,
    /** **near 没有聚焦态**:已冻结,W10 一个参数都没动它。 */
    focus: null,
    /** **near 没有主光池**:已冻结,W11a 一个参数都没动它。 */
    pool: null,
  },

  night: {
    baseline: "night",
    lut: "golden/w3/env-night.png",
    camera: NIGHT_CAM,
    set: {
      uDitherPixel: 2,
      uDitherAniso: 0.0,
      uFieldCamHeight: NIGHT_CAM.camHeight,
      uFieldCamPitch: NIGHT_CAM.camPitch,
      uFieldFovY: NIGHT_CAM.fovY,
      uFieldFetchLen: 7.0,
      /* lod 1.0→3.0 / amp 0.6→1.2:更早淡出 = 更多波能转进 σ²,月光路径变宽,
       * 同时近场可见的波反而更少 —— 前景平坦度不降反升。见 docs §13。 */
      uFieldLodBias: 3.0,
      uFieldAmp: 1.2,
      // ④ 波脊断裂。夜景的尺度是米级(月光路径横跨几十米),不是 mid 的分米级
      uFieldChop: 1.0,
      uFieldChopLen: 3.0,
      uFieldChopAniso: 0.5,
      uFieldChopBias: 0.62,
      uFieldChopMin: 0.02,
      uFieldChopMax: 1.7,
      uFieldChopEdge: 0.14,
      uShadeEnvLutScale: 2.0,
      uShadeEnvLutMin: -0.2,
      uShadeEnvLutMax: 1.0,
      uShadeBody: 0.02,
      uShadeEnvGain: 1.0,
      /* 高光:gain 1e5→1e4、clip 4.0→1.2、月亮仰角 0.08→0.18。
       * 原来的组合让 D·ω·gain 高出饱和阈值两个数量级,整条月光路径糊成一坨实心白,
       * 中间还留一条**笔直的竖亮线**(平面镜对点光源的解析解)。压下来之后
       * 波幅/断裂对 σ² 的调制才显出来,路径碎成一段一段的横划。 */
      uShadeSpecGain: 10000.0,
      uShadeLightOmega: 6.8e-5,
      uShadeLightElev: 0.18,
      uShadeLightAz: 0.0,
      uShadeSigmaFloor: 2e-4,
      uShadeSpecClip: 1.2,
      /* 对比度 8.0→2.5:这是「地平线太死板」的主因。contrast 8 把几乎所有像素
       * 顶到 0 或 1,抖动没有中间调可用,过渡带不到 1px → 刀切一样的直线。
       * 压到 2.5 才留出那片溶解的网点带(奥伯拉丁的「错落感」)。
       *
       * uShadeSkyGain 1.0→0.85:天顶那片网点太密。这一项只缩放天空像素查到的
       * **环境列**部分,不碰 uShadeSkyGlowGain 那层辉光,所以地平线附近的溶解带
       * 原样保留,只有远离地平线的高空变稀。分数不变(0.930)。 */
      uShadeExposure: 0.0,
      uShadeContrast: 2.5,
      uShadePivot: 0.22,
      uShadeSkyGain: 0.85,
      // 天空一侧的地平线辉光 + 地平线起伏(只有夜景需要)
      uShadeSkyGlowGain: 0.6,
      uShadeSkyGlowWidth: 0.03,
      uShadeHorizonJitter: 0.004,
      uShadeHorizonJitterScale: 22.0,
    },
    /* ── W11a 重标定:**推翻 W5 写在这里的那句「靠镜面闪出效果」** ────────────
     * 原注释是:「夜景对灯球最敏感,一点漫射池就看得见,所以 body 增益反而要
     * 压小,靠镜面闪出效果。」**两半都是错的**,实测:
     *
     * ① **镜面那一路在 night 上是几何性死的。** 单开 uOrbSpecGain=2.0,全画面
     *    maxΔ ≤ 4/255。画面下缘那点水在 24.2 m 外,看相机仰角 9.4°、看灯球
     *    46.8°,半程向量偏离法线 36.7° ⇒ tan²θ_h = 0.554,而 σ² 只有
     *    2e-4~1e-2 ⇒ exp(−0.554/σ²) ≈ e⁻⁵⁵ = 0。而且球的镜像点在水下 13.37 m,
     *    相机看它是俯角 26.7°,**镜像本身就在画框外**;球挂在 NDC y=0.42 时
     *    即使推到无穷远,反射点也只收敛到 14.3 m,进不了 24.2 m 的画框。
     *    完整推导写在 light.glsl.ts 文件头。**uOrbSpecGain 在 night 上是死键。**
     * ② **body 那一路不是"一点就看得见",是弱一个量级。** 1.6 × 峰值斑 0.385
     *    × (1−F)=0.43 → Δlum 0.265,只有最强那一斑翻白;中位斑(0.05)只有
     *    Δlum 0.028。整片水面平均灰度只被抬 +0.24%,1-bit 抖动之后 42335 px
     *    的变化只剩 2704 px —— 94% 的信号被暗场里的量化扔掉了。
     *
     * 所以 W11a:**body 1.6 → 6.0**(中位斑也推得动),并补一个**主光池**
     * (下面的 `pool`)把"球体本身泼下来的那片弱光"补上。uOrbSpecGain 保持 2.0
     * **不是因为它有用**,是因为动它会改 near/mid 的滚动插值端点而收益为零。
     *
     * 夜空本体只有 0.10~0.17,0.05 的注入是"看得见但不抢戏"。夜景是三个 preset
     * 里唯一该开环境注入的:注入仰角 0.449 远离地平线(0.0),掠射的水面采不到,
     * 只在天上给出那圈软晕。 */
    orb: {
      uFieldOrbPatchGain: 0.5,
      uOrbBodyGain: 6.0,
      uOrbSpecGain: 2.0,
      uOrbPatchGain: 1.0,
      uOrbSpecClip: 0.9,
      envGain: 0.05,
      /* 用户选了「灯球压过月光」:满能量时月光镜面增益从 1e4 让到 **4000**。
       * 不能直接把上面 set 里的 uShadeSpecGain 写成 4000 —— 那样连**不开灯球**
       * 的黄金帧都变了,而 energy=0 逐字节等于 night-t2.5.png 是本卡的红线。
       * 插值实现只有一处:`moonSpecGainFor()`,energy=0 时它恒等返回 1e4。 */
      moonSpecGainLit: 4000,
    },
    /* ── W6 涟漪 ────────────────────────────────────────────────────────────
     * 夜景的尺度和 mid 差一个数量级,而且**涟漪只可能出现在前景**,这不是
     * 调参能改的:夜景 4 m 机位、几乎平视,画面下缘对应 **24.2 m**,
     * 而峰值带 7 落在 **262 m**。262 m 处一个像素的世界跨度约 9.5 m ——
     * 要让涟漪在那里活下来,Δx 得 ≥6 m,即 256 格要铺 1.6 km。
     * 所以夜景的涟漪落在 band 8~9(24~50 m),峰值带上一个像素都不会改。
     *
     * 覆盖 40 m、左下角 (−20, 24),Δx = 0.15625 m。
     * c = 2.0 m/s 是 ~2 m 波长的重力波相速度 sqrt(gλ/2π) = 1.77,取 2.0。
     * C = 2.0×0.016/0.15625 = **0.205**。
     *
     * **冲击必须比 mid 大一个量级**:32 m 处屏幕尺度只有 ~53 px/m,
     * mid 那种 0.15 m 半径的雨点在这里是 8 px,一个抖动单元都填不满。
     * 2.5 m 半径 / 6 cm 幅度 → 屏幕上 546×102 px 的一块扰动,读得出来。 */
    ripple: {
      world: "-20,24,40",
      steps: 60,
      dt: 0.016,
      speed: 2.0,
      damping: 0.997,
      amp: 4.0,
      probe: "10,20,30,40,50,60",
      impulse: "0,32,0.06,2.5",
    },
    /** **night 的聚焦态仍然没有。** W11a 做的是主光池(加法),不是渐晕(乘法)。 */
    focus: null,
    /* ── W11a 主光池 ───────────────────────────────────────────────────────
     * 镜片斑之外那份"球体本身泼下来的弱光"。**只有 night 开。**
     *
     * · **峰值 0.040** —— 量纲是照度,和 uOrbSpots 的 w 同一档。乘上
     *   uOrbBodyGain 6.0 得 0.24,再 ×(1−F)≈0.43 → Δlum 0.10。night 的 tonemap
     *   是 contrast 2.5 / pivot 0.22,Δlum 0.10 换算成输出是 +0.26 —— 刚好把
     *   暗场里"抖不出白点"的那一片推进抖得出白点的区间(目标白点密度 18~29%,
     *   月光路径是 15~35%)。再大一档(0.06)池心整片翻白、又变回 W3 那种实心板。
     * · **横向半径 20 m / 平顶 0.35** —— 球在 48.4 m 外,画框下缘的水面在
     *   24.2 m。20 m 的横向半径在那个距离上大约铺满画幅的四成宽,平顶让池心
     *   那一块是均匀的亮(迪斯科球下面本来就有一摊亮),裙边占 65% 的半径 ——
     *   1-bit 下这条裙边就是那圈溶解的网点带,不是刀切边。
     * · **远 2.6 / 近 0.55(必须不对称)** —— 对称拉长会把池子近边拖进前景,
     *   前景平坦度从 0.155 掉到 0.286 **直接 FAIL**。参考图里"光在水上是一道
     *   竖着的路",那条路是往地平线方向拖的,不是往脚下拖:近侧要比圆更收。
     *
     * **这组参数的代价是明知故犯的。** night 开灯球:加权总分 **0.866**、
     * 前景平坦度 **0.155 PASS**;对照现状 0.930(不开灯球时仍是 0.930 不变)。
     * 掉的 0.064 全在前景平坦度上 —— 基线是"一片没有第二个光源的空湖",
     * 加一个光池必然掉这项。这和 mid 的波脊断裂(0.951→0.913)是同一类
     * **故意的交换**:分数只能证伪,不能证真(docs §13.1)。 */
    pool: NIGHT_POOL,
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * uniform 默认值
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `preview.frag` 里**真的声明了**的 uniform 的默认值。
 *
 * W8 之前这张表在 `scripts/gen-water-preview.mjs` 里各写一份;现在预览台与
 * `water-scene.tsx` 都从这里取。缺一个键就会拿到 0,画面直接崩
 * (W1 踩过:纹理尺寸 uniform 被清零 → NaN)。
 *
 * 不在表里的每帧量:`uRes` / `uTime` / `uOrb{Center,Spots,Patch*,Omega}` /
 * `uRipple{TexSize,WorldMin,WorldSize}` —— 由求解器每帧直接写。
 */
export const WATER_UNIFORM_DEFAULTS: Record<string, number> = {
  uFieldCamHeight: MID_CAM.camHeight,
  uFieldCamPitch: MID_CAM.camPitch,
  uFieldFovY: MID_CAM.fovY,
  uFieldWindDir: 1.5708,
  uFieldWindSpeed: 1.0,
  uFieldSpread: 0.25,
  uFieldAmp: 1.5,
  uFieldSpectralSlope: 0.9,
  uFieldWarp: 1.0,
  uFieldFetchLen: 7.0,
  uFieldLodBias: 5.0,
  uFieldPatchScale: 0.65,
  uFieldPatchMin: 0.15,
  uFieldPatchMax: 2.0,
  uFieldPatchEdge: 0.06,
  uFieldPatchBias: 0.4,
  uFieldPatchDrift: 0.03,
  uFieldOrbPatchGain: 0.0,
  uFieldTail: 1.0,
  uFieldWander: 0.3,
  uFieldWanderScale: 0.25,
  uFieldChop: 0.0,
  uFieldChopLen: 0.85,
  uFieldChopAniso: 0.5,
  uFieldChopMin: 0.02,
  uFieldChopMax: 1.7,
  uFieldChopEdge: 0.14,
  uFieldChopBias: 0.62,
  uShadeEnvLutScale: 2.0,
  uShadeEnvLutMin: -0.2,
  uShadeEnvLutMax: 1.0,
  uShadeBody: 0.62,
  uShadeEnvGain: 1.0,
  uShadeSpecGain: 0.0,
  uShadeLightOmega: 6.8e-5,
  uShadeLightElev: 0.06,
  uShadeLightAz: 0.0,
  uShadeSigmaFloor: 2e-4,
  uShadeSpecClip: 1.5,
  uShadeExposure: 0.1,
  uShadeContrast: 8.0,
  uShadePivot: 0.48,
  uShadeSkyGain: 1.0,
  uShadeSkyGlowGain: 0.0,
  uShadeSkyGlowWidth: 0.03,
  uShadeHorizonJitter: 0.0,
  uShadeHorizonJitterScale: 22.0,
  uDitherPixel: 2,
  uDitherAniso: 0.8,
  uDitherQuantize: 1,
  /* W5 灯球:列在这里的只有"人可以拖"的旋钮 */
  uOrbLightMode: 0,
  uOrbEnergy: 0.0,
  uOrbBodyGain: 1.5,
  uOrbSpecGain: 1.5,
  uOrbPatchGain: 1.0,
  uOrbSigmaFloor: 2e-4,
  uOrbSpecClip: 1.5,
  uOrbLightmapFrame: 0,
  uOrbLightmapCols: 12,
  uOrbLightmapRows: 10,
  /* W10 聚焦渐晕:**uOrbFocus = 0 就是"没有聚焦态"**,`waterOrbFocusDim` 精确
   * 返回 1.0,乘上去逐位不变。其余四个是 mid 的定标值(见 WATER_PRESETS.mid.focus)——
   * 列在这里是因为缺一个键就会拿到 0,而 uOrbPoolR = 0 会让整片水面落在池外
   * (dist > 0 恒成立 → pool = 0),focus 一推上去就是全黑。
   * `uOrbGround` 是 vec2,不进这张 Record<string, number>:它由 CPU 侧每帧从
   * 球心直接写(同 uOrbCenter / uOrbPatchCenter 的处理)。 */
  uOrbFocus: 0.0,
  ...MID_FOCUS,
  uOrbSpinPhase: 0.0,
  /* W11a 主光池:**uOrbPoolGain = 0 就是"没有主光池"**,`waterOrbMainPool`
   * 第一行就精确返回 0.0,加上去逐位不变(同 uOrbFocus / uOrbEnergy 那两条闸门)。
   * 其余四个是 night 的定标值(见 WATER_PRESETS.night.pool)—— 列在这里是因为
   * 缺一个键就会拿到 0,而 **uOrbPoolRadius = 0 会让 d = length(e)/0 = inf**,
   * smoothstep(flat, 1, inf) 出来是 1、池子恒为 0:通道悄悄失效,不报错。
   * 展开顺序不能反:先铺 night 的形状,再把增益压回 0 当关闭态。 */
  ...NIGHT_POOL,
  uOrbPoolGain: 0.0,
  /* W11b 退场后退。**不是 preset 参数,是编排器行⑪的每帧量** ——
   * 列在这里只为「缺一个键就拿到 0」那条兜底;0 恰好也是静息值。 */
  uOrbPoolRetreat: 0.0,
  /* W6 涟漪:uRippleAmp = 0 就是"没有涟漪",与关闭时逐字节相同 */
  uRippleAmp: 0.0,
  uRippleLodBias: 1.5,
  uRippleEdgeFade: 8.0,
};

/**
 * 两个 preset 之间按滚动进度插出一整套 uniform。
 *
 * **端点必须原样返回,不许走插值** —— 浮点插值在 u=1 处会给出
 * `1.6000000000000001` 这种数,于是"停在端点时与黄金帧逐位相同"这条性质
 * 就没了(`water-director.ts` 的 `camera()` 里有同一条,理由写在那里)。
 *
 * 键取两边的并集;某一边没有的键用 `WATER_UNIFORM_DEFAULTS` 补 ——
 * 例如 `uShadeSkyGlowGain` 只有 night 有,mid 那端是默认的 0。
 */
export function blendPresetUniforms(
  from: WaterPreset,
  to: WaterPreset,
  u: number,
): Record<string, number> {
  if (!(u > 0)) return { ...from.set };
  if (u >= 1) return { ...to.set };
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(from.set), ...Object.keys(to.set)])) {
    const a = from.set[k] ?? WATER_UNIFORM_DEFAULTS[k] ?? 0;
    const b = to.set[k] ?? WATER_UNIFORM_DEFAULTS[k] ?? 0;
    out[k] = a + (b - a) * u;
  }
  return out;
}

/**
 * 灯球三条通道的增益按滚动进度插值。端点同样原样返回。
 *
 * **`envGain` 必须线性插到 0**,不能像半径那样走等比:near 那端就是 0,
 * 等比插值遇到 0 端会退化(见 `water-director.ts` 的 `impulseScale()`)。
 */
export function blendPresetOrbGains(
  from: WaterPreset,
  to: WaterPreset,
  u: number,
): WaterPresetOrb {
  if (!(u > 0)) return { ...from.orb };
  if (u >= 1) return { ...to.orb };
  const a = from.orb;
  const b = to.orb;
  const mix = (p: number, q: number): number => p + (q - p) * u;
  return {
    uFieldOrbPatchGain: mix(a.uFieldOrbPatchGain, b.uFieldOrbPatchGain),
    uOrbBodyGain: mix(a.uOrbBodyGain, b.uOrbBodyGain),
    uOrbSpecGain: mix(a.uOrbSpecGain, b.uOrbSpecGain),
    uOrbPatchGain: mix(a.uOrbPatchGain, b.uOrbPatchGain),
    uOrbSpecClip: mix(a.uOrbSpecClip, b.uOrbSpecClip),
    envGain: mix(a.envGain, b.envGain),
    /* `moonSpecGainLit` 是**离散的 null / 数**,插不了 —— 混合期间取
     * "有让位的那一端",两端都有就按 u 取近的那个。它只在端点上是定义良好的,
     * 中途的确切值没有意义:滚动到一半时月光和灯球都在插值,再插一层没有物理。 */
    moonSpecGainLit:
      a.moonSpecGainLit === null
        ? b.moonSpecGainLit
        : b.moonSpecGainLit === null
          ? a.moonSpecGainLit
          : u < 0.5
            ? a.moonSpecGainLit
            : b.moonSpecGainLit,
  };
}

/**
 * 灯球满能量时月光镜面增益让到多少 —— **这条插值的唯一实现处**(W11a)。
 *
 * `golden/w3/run.mjs`、`scripts/gen-water-preview.mjs`(经预览台内联)与
 * `water-scene.tsx` 三个消费端都调它,一个字都不许抄第二遍(docs §11 坑 7)。
 *
 * 两条必须守住的性质:
 *  · `moonSpecGainLit == null` ⇒ **原样返回 `set.uShadeSpecGain`**(near/mid);
 *  · `energy <= 0` ⇒ 也原样返回 —— IEEE 下 `a + (b−a)*0 ≡ a` 对有限数成立,
 *    但这里显式早退,免得将来有人把式子改成别的形式时悄悄破掉
 *    "energy=0 逐字节等于 night-t2.5.png" 那条红线。
 */
export function moonSpecGainFor(preset: WaterPreset, energy: number): number {
  const base = preset.set.uShadeSpecGain ?? WATER_UNIFORM_DEFAULTS.uShadeSpecGain;
  const lit = preset.orb.moonSpecGainLit;
  if (lit === null || !(energy > 0)) return base;
  const e = energy > 1 ? 1 : energy;
  return base + (lit - base) * e;
}

/**
 * 月光让位量按滚动进度插值(组件端用)。端点原样返回,理由同
 * `blendPresetUniforms` —— 停在端点时必须与黄金帧逐位相同。
 *
 * energy = 0 时两端都退化成各自的 `set.uShadeSpecGain`,于是这条式子与
 * `blendPresetUniforms` 给出的 `uShadeSpecGain` 是**同一个表达式**
 * (`a + (b−a)*u`),逐位相同 —— 闸门因此在混合态上也成立。
 */
export function blendMoonSpecGain(
  from: WaterPreset,
  to: WaterPreset,
  u: number,
  energy: number,
): number {
  const a = moonSpecGainFor(from, energy);
  if (!(u > 0)) return a;
  const b = moonSpecGainFor(to, energy);
  if (u >= 1) return b;
  return a + (b - a) * u;
}

/** 一端没有 `pool` 时借另一端的**形状**、把增益归零 —— 借形状是为了不让
 *  `uOrbPoolRadius = 0` 把 `d` 变成 inf(见 WATER_UNIFORM_DEFAULTS 的注释)。 */
function poolShapeOf(self: WaterPreset, other: WaterPreset): WaterPresetPool {
  if (self.pool) return self.pool;
  return { ...(other.pool ?? NIGHT_POOL), uOrbPoolGain: 0 };
}

/**
 * 主光池那一组按滚动进度插值(W11a)。端点原样返回。
 *
 * **增益必须线性插到 0**,不能等比:mid/near 那端就是 0,等比插值遇到 0 端
 * 会退化(同 `blendPresetOrbGains` 里 `envGain` 那条)。
 */
export function blendPresetPool(from: WaterPreset, to: WaterPreset, u: number): WaterPresetPool {
  const a = poolShapeOf(from, to);
  if (!(u > 0)) return { ...a };
  const b = poolShapeOf(to, from);
  if (u >= 1) return { ...b };
  const mix = (p: number, q: number): number => p + (q - p) * u;
  return {
    uOrbPoolGain: mix(a.uOrbPoolGain, b.uOrbPoolGain),
    uOrbPoolRadius: mix(a.uOrbPoolRadius, b.uOrbPoolRadius),
    uOrbPoolFlat: mix(a.uOrbPoolFlat, b.uOrbPoolFlat),
    uOrbPoolFar: mix(a.uOrbPoolFar, b.uOrbPoolFar),
    uOrbPoolNear: mix(a.uOrbPoolNear, b.uOrbPoolNear),
  };
}
