/**
 * water-director.ts —— W7 交互编排器
 *
 * 把「用户在干什么」翻译成「这一帧的水面是什么样」。每帧组装一个
 * `WaterFrameState`(contract.ts),外加一队待注入的涟漪冲击。
 *
 * ── 三条设计原则(docs/water-interaction-spec.md §1)────────────────────────
 *  ① **光是主语,水是谓语**。球对水的主要作用是**辐射度**的,不是力学的:
 *     球移动只改 `orb.screen`(照度通道跟着变),**不注入任何冲击**。
 *     只有指针划过水面、点击落水这类**事件**才注入冲击。
 *  ② **延迟即质感**。任何低于 80 ms 的响应都不像水 —— 本文件里没有一条
 *     耦合是直接赋值的:要么二阶弹簧,要么指数阻尼,要么包络。
 *  ③ **阈值即克制**。pointermove 一秒能来 120 个,全注入就是满屏是波。
 *     速度阈值 + 40 ms 节流把它压到 ≤25 个/秒,而且**挡掉多少有计数器**。
 *
 * ── 渲染器无关 ────────────────────────────────────────────────────────────
 * **本类不拥有 rAF、不拥有 WebGL、不拥有 RippleSolver。**
 * 调用方每帧 `update(dt)` → `getFrameState()` → 自己写 uniform;
 * `drainImpulses()` 取出这一帧要注入的冲击,自己喂给 `RippleSolver.injectImpulse`。
 * 仓库里还没有 `water-scene.tsx`(W8),预览台就是本卡的演示场。
 *
 * ── 零 DOM 读取(contract.ts 的红线)───────────────────────────────────────
 * 每帧一次布局读取都没有:
 *  · 画布的位置与尺寸由调用方在 **resize/ResizeObserver 里** `setViewport()` 一次,
 *    本类只读缓存;
 *  · 指针位置来自**事件对象**的 `clientX/clientY/timeStamp`;
 *  · 球位来自**时间线取值函数**(`WaterOrbSource`),不是量出来的;
 *  · 滚动进度来自 ScrollTrigger 的 `self.progress`(一个数),由 `setScroll()` 推进来。
 * 本文件里没有 `getBoundingClientRect` / `offsetWidth` / `getComputedStyle`
 * 这几个字符串 —— 这条是可 grep 的。
 *
 * ── 这个文件为什么一个值导入都没有 ────────────────────────────────────────
 * 和 `orb-light.ts` / `ripple.ts` 同一条约束:`scripts/gen-water-preview.mjs`
 * 用 `WaterDirector.toString()` 把整个类**原样内联**进预览台,让预览台跑的是
 * 同一份编排代码而不是抄一份(docs/water-reference-metrics.md §11 坑 7)。
 * 代价:**类里不许引用模块作用域的函数**;引用到的模块级**常量**必须在
 * 生成脚本里按值内联(见 gen-water-preview.mjs 的 INLINE_JS)。
 * 所以这里只许 `import type`。
 */
import type { OrbState, RippleField, WaterFrameState } from "./contract";

/** 三个 preset 的名字。滚动映射的默认区间是 night → mid。 */
export type WaterPresetName = "near" | "mid" | "night";

/**
 * 取值函数:给定时间(秒)返回一帧 `OrbState`。
 * 与 `orb-light.ts` 的 `OrbStateSource` 结构相同 —— 那边是发布器的入口,
 * 这边是编排器的入口,两边都不硬绑 GSAP。W8 接真时间线时传一个读时间线的闭包。
 */
export type WaterOrbSource = (timeSec: number) => OrbState;

/** 一次待注入的冲击。调用方喂给 `RippleSolver.injectImpulse(world, strength, radius)`。 */
export interface WaterImpulse {
  /** 场坐标(米),与 field.glsl.ts 的 `p` 同系 */
  world: [number, number];
  /** 峰值位移(米) */
  strength: number;
  /** 高斯 e 折半径(米) */
  radius: number;
  /** `hover` = 指针划过;`click` = 点击落水。两档的世界尺度差一个量级 */
  kind: "hover" | "click";
}

/** 画布在视口里的位置与尺寸。**只在 resize 时缓存一次**,每帧不再量。 */
export interface WaterViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 耦合矩阵每一条一个开关,预览台要能一条条关掉看差别。 */
export interface WaterDirectorFlags {
  /** 行①指针在水面移动 → 涟漪冲击注入 */
  pointerRipple: boolean;
  /** 行②指针悬停灯球 → uOrbEnergy 二阶弹簧 */
  orbHoverEnergy: boolean;
  /** 行③球随时间线移动 → 光斑路径(20 ms lerp 延迟) */
  orbFollow: boolean;
  /** 行④滚动 → camHeight / camPitch 阻尼跟随 */
  scrollCamera: boolean;
  /** 行⑤点击水面 → 大冲击 + 短暂曝光提升 */
  clickImpulse: boolean;
  /** 行⑥静置 >4 s → wind.speed 衰减 */
  idleWind: boolean;
  /** 行⑦球退场(HR-9 后)→ energy 800 ms ease-out → 0 */
  orbExit: boolean;
  /**
   * 行⑧滚动 → 球位(**W8 新增**)。
   *
   * W7 只把相机与冲击尺度接上了滚动,球位仍旧只来自时间线 —— 于是从夜景滚到
   * mid 时**灯直接熄了**:night 的球位是为 4 m 机位定的(worldRadius 1.8 m、
   * 球心 36 m 外、13.7 m 高),相机一降到 1.6 m,光斑全落到画框外,
   * `activeSpots` 从 22 掉到 0。**球位必须和相机共用同一个滚动进度量。**
   *
   * 关掉:球位完全由时间线(`orbSource`)给,滚动不再改它 —— 就是 W7 的行为,
   * 也是预览台那几个球位滑块要能拖动时该关的那一条。
   */
  orbScrollPose: boolean;
  /**
   * 行⑩指针拖拽灯球 → 球位偏移 + 松手二阶弹簧回位(**W11b 新增**)。
   *
   * 拖的是**相对时间线的偏移**,不是绝对球位:时间线还在推球(HR-8 里球会
   * 上浮、离场),把绝对位置交给指针会让「拖一下」变成「接管整条动画」。
   * 偏移被夹在 `tuning.dragRangeX/Y` 的矩形里,松手后按 ζ=0.8 ω=12 弹回 0。
   *
   * 关掉:`dragStart/dragMove` 不起作用,偏移恒为 0(且 `x + 0` 逐位不变)。
   */
  orbDrag: boolean;
  /**
   * 行⑪退场 → 光池后退(**W11b 新增**)。
   *
   * 行⑦只把 energy 拉到 0(整片光同时变暗)。用户要的是「光池后退+缩小+
   * 变暗收回海岸线」——后退与缩小在 shader 里(`uOrbPoolRetreat`),这一条是
   * 它的驱动。**必须显式驱动**:球沿屏幕升高时球心距离不变、仰角变大,
   * 它正下方的水面点反而离相机更**近**,几何自己给出的是「池子往脚下走」。
   *
   * 关掉:`uOrbPoolRetreat` 恒为 0,退场退化成 W7 的纯淡出。
   */
  orbExitRetreat: boolean;
}

/**
 * 阈值与节流的**证据**,不是断言。预览台把它显示出来。
 *
 * 不变式(每次 `pointerMove()` 只落进一个桶):
 * `pointerEvents === injected + suppressedByThreshold + suppressedByThrottle
 *                  + suppressedOffSurface + suppressedByGate`
 */
export interface WaterDirectorCounters {
  /** 收到的 pointermove 总数 */
  pointerEvents: number;
  /** 真的注入了冲击的次数 */
  injected: number;
  /** 被速度阈值挡掉(动得太慢,或第一个事件还没有速度) */
  suppressedByThreshold: number;
  /** 被 40 ms 节流挡掉 */
  suppressedByThrottle: number;
  /** 指针在地平线以上 / 逆投影无交点 —— 那里没有水面 */
  suppressedOffSurface: number;
  /** 被总闸门挡掉:reduced-motion、开关关掉、或该 preset 没有涟漪(near) */
  suppressedByGate: number;
  /** 点击注入的次数(不进上面的不变式) */
  clicks: number;
  /** 拖拽开始的次数(行⑩,W11b;同样不进上面的不变式) */
  drags: number;
}

/** 一档冲击的世界尺度。**必须跟着 preset 的相机尺度走**,见 docs/water-ripple.md §4。 */
export interface WaterImpulseScale {
  hoverRadius: number;
  hoverStrength: number;
  clickRadius: number;
  clickStrength: number;
}

/** 一个相机停靠点。滚动在两个停靠点之间插值。 */
export interface WaterCameraStop {
  camHeight: number;
  camPitch: number;
  fovY: number;
}

/**
 * 三个 preset 的相机。**与 `golden/w3/run.mjs` 的 `PRESETS[x].set` 逐字一致**
 * (那边是跑分参数,这边是编排端的插值端点)。两处各写一遍是上面那条
 * 「只许 import type」逼出来的;`golden/w3/build.ts` 有一条断言兜底。
 */
export const WATER_CAMERA_STOPS: Record<WaterPresetName, WaterCameraStop> = {
  near: { camHeight: 0.35, camPitch: 0.335, fovY: 0.553 },
  mid: { camHeight: 1.6, camPitch: 0.37, fovY: 0.61 },
  night: { camHeight: 4.0, camPitch: -0.1413, fovY: 0.61 },
};

/** 一个灯球球位停靠点。滚动在两个停靠点之间插值。 */
export interface WaterOrbStop {
  /** 球心的 NDC y */
  screenY: number;
  /** 球在屏幕上的半径(NDC 纵向半高为单位) */
  radiusNdc: number;
  /** 球的世界半径(米)。与 radiusNdc 一起定出球心到相机的真实距离 */
  worldRadius: number;
}

/**
 * 三个 preset 的球位(**W8 新增,行⑧的插值端点**)。
 * **与 `src/components/lab/water/presets.ts` 的 `WATER_PRESET_ORB_POSES`
 * 逐字一致** —— 那边是跑分/组件用的真相来源,这边是编排端的拷贝。
 * 两处各写一遍是文件头那条「只许 import type」逼出来的;
 * `golden/w3/build.ts` 的断言④会在漂移时红着脸失败。
 *
 * 每个数的由来见 presets.ts 的注释。一句话:**三个相机的几何差太多,
 * 一套球位不可能同时对** —— night 的 2.6 m 球在 mid 的 1.6 m 机位下
 * 光斑全在画框外,而 mid 的 0.22 m 球在 near 的 0.35 m 机位下球心在水面以下。
 *
 * **W11a 把 night 的 worldRadius 从 1.8 抬到 2.6**(球退到 48.4 m,光斑整片
 * 进框)。峰值强度 ∝ h²/t²、h 与 t 都正比于 worldRadius ⇒ 零光度代价,
 * 推导写在 presets.ts。这边不改就会被断言④拦下。
 */
export const WATER_ORB_STOPS: Record<WaterPresetName, WaterOrbStop> = {
  near: { screenY: 0.8, radiusNdc: 0.16, worldRadius: 0.07 },
  mid: { screenY: 0.8, radiusNdc: 0.1, worldRadius: 0.22 },
  night: { screenY: 0.42, radiusNdc: 0.16, worldRadius: 2.6 },
};

/**
 * 三个 preset 的冲击尺度。**click 两档就是 W6 定标出来的那两组**
 * (`golden/w3/run.mjs` 的 `PRESETS[x].ripple.impulse`):
 * mid `0,6,0.006,0.15` → 6 mm / 0.15 m;night `0,32,0.06,2.5` → 60 mm / 2.5 m。
 *
 * hover 档是 click 档的 **半径 ×0.4 / 强度 ×0.2**:指针划过是**连续**注入
 * (≤25 次/秒),单发必须比"砸一颗石子"轻一个档,否则一划一片白。
 * 比例的由来见 docs/water-interaction-spec.md §3.2(扫出来的,不是拍的)。
 *
 * **near 全 0**:用户明确要求 near 保持现状,W6 也没给它 ripple 块。
 */
export const WATER_IMPULSE_SCALES: Record<WaterPresetName, WaterImpulseScale> = {
  near: { hoverRadius: 0, hoverStrength: 0, clickRadius: 0, clickStrength: 0 },
  mid: { hoverRadius: 0.06, hoverStrength: 0.0012, clickRadius: 0.15, clickStrength: 0.006 },
  night: { hoverRadius: 1.0, hoverStrength: 0.012, clickRadius: 2.5, clickStrength: 0.06 },
};

/** 编排器的全部可调量。每个数的由来见 docs/water-interaction-spec.md §3。 */
export interface WaterDirectorTuning {
  /** 速度阈值(px/ms)。低于它不注入 */
  pointerSpeedMin: number;
  /** 速度上限(px/ms)。强度 ∝ min(v, 这个数) */
  pointerSpeedMax: number;
  /** 节流(ms)。从**上一次真的注入**算起 */
  pointerThrottleMs: number;
  /** 悬停灯球的二阶弹簧阻尼比 */
  hoverZeta: number;
  /** 悬停灯球的二阶弹簧固有频率(rad/s) */
  hoverOmega: number;
  /** 悬停时 energy 的目标倍率(静息 1.0) */
  hoverEnergy: number;
  /** 球位跟随的一阶时间常数(秒)。20 ms */
  followTau: number;
  /** 滚动阻尼:每个 60 fps 帧吃掉目标差的这个比例 */
  scrollDamping: number;
  /** 点击曝光包络的 attack(秒) */
  clickAttack: number;
  /** 点击曝光包络的指数衰减时间常数(秒)。1.8 s 处残留 5% */
  clickDecayTau: number;
  /** 点击曝光包络的峰值(加在 `uShadeExposure` 上,是加法不是倍率) */
  clickExposure: number;
  /** 静置多久开始降风(秒) */
  idleAfter: number;
  /** 降到基准风速的多少倍 */
  windIdleFactor: number;
  /** 从 1.0 降到 windIdleFactor 用多久(秒) */
  windDecay: number;
  /**
   * 恢复到 1.0 用多久(秒)。**必须 < idleAfter**,否则动一下鼠标风也回不满:
   * 一次交互只把静置计时清零,4 s 后又开始降。3 s < 4 s,留 1 s 余量。
   */
  windRecover: number;
  /** 球退场时长(秒) */
  exitDuration: number;
  /**
   * 行⑩ 拖拽偏移的矩形半宽 / 半高(NDC)。0.35 / 0.25 —— 球在 night 上的
   * 屏幕半径是 0.16,这个范围约等于「左右各能挪两个球、上下各一个半球」:
   * 够读出「我在拖它」,又不至于把球拖到画框外让光斑整片消失(W7 坑 12)。
   */
  dragRangeX: number;
  dragRangeY: number;
  /** 行⑩ 松手回位的二阶弹簧。与悬停那条同一组数(ζ=0.8 ω=12),观感统一 */
  dragZeta: number;
  dragOmega: number;
  /**
   * 聚焦态 A⇄B 的过渡时长(秒)。**与 lab/home 球退场那条对齐**
   * (docs/homepage-animation-plan.md,`motionTokens.ease.swipe = power4.inOut`)。
   */
  focusDuration: number;
  /** reduced-motion 下水面定格在这个时刻(contract.ts 的注释规定 8.0) */
  frozenTime: number;
  /** 单帧最大 dt(秒)。标签页切回来时 rAF 会给出好几秒 */
  maxDt: number;
  /** 待注入队列的上限。超了丢最旧的 —— 卡帧不该攒出一串冲击 */
  maxPendingImpulses: number;
}

/** 默认调参。生成脚本按值内联进预览台。 */
export const WATER_DIRECTOR_TUNING: WaterDirectorTuning = {
  pointerSpeedMin: 0.15,
  pointerSpeedMax: 2.0,
  pointerThrottleMs: 40,
  hoverZeta: 0.8,
  hoverOmega: 12,
  hoverEnergy: 1.45,
  followTau: 0.02,
  scrollDamping: 0.12,
  clickAttack: 0.06,
  clickDecayTau: 0.6,
  clickExposure: 0.04,
  idleAfter: 4.0,
  windIdleFactor: 0.6,
  windDecay: 30,
  windRecover: 3,
  exitDuration: 0.8,
  dragRangeX: 0.35,
  dragRangeY: 0.25,
  dragZeta: 0.8,
  dragOmega: 12,
  focusDuration: 0.8,
  frozenTime: 8.0,
  maxDt: 0.1,
  maxPendingImpulses: 16,
};

/** 十条全开(W7 的七条 + W8 的行⑧ + W11b 的行⑩⑪)。 */
export const WATER_DIRECTOR_FLAGS_ON: WaterDirectorFlags = {
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

/** 基准风(`gen-water-preview.mjs` 的 DEFAULTS 里 uFieldWindDir/Speed 同值)。 */
export const WATER_BASE_WIND = { dirRad: 1.5708, speed: 1.0 };

export interface WaterDirectorOptions {
  /** 滚动 0 端的 preset。默认 `night` */
  from: WaterPresetName;
  /** 滚动 1 端的 preset。默认 `mid`。**near 是合法终点,但不是默认** */
  to: WaterPresetName;
  /** 球的时间线取值函数。不给就用一个静态球位 */
  orbSource: WaterOrbSource | null;
  flags: Partial<WaterDirectorFlags>;
  tuning: Partial<WaterDirectorTuning>;
  /** 初始视口。也可以之后 `setViewport()` */
  viewport: WaterViewport;
  /** 基准风 */
  wind: { dirRad: number; speed: number };
  reducedMotion: boolean;
  /**
   * 松手后灯球是否**固定在当前位置**(不回弹)。默认 false = 主页手感:拖拽是相对
   * 时间线的临时偏移,松手按二阶弹簧回 0。/lab/water 传 true,让调参时球停在拖到的
   * 地方(偏移折叠进持久基准 `orbBaseOff*`)。
   */
  dragPersist: boolean;
}

/**
 * 交互编排器。**不拥有 rAF**。
 *
 * 典型接线(W8 的 water-scene.tsx 会长这样):
 * ```ts
 * const dir = new WaterDirector({ orbSource: readTimeline });
 * const un = dir.bindReducedMotion();
 * ro.observe(canvas);                       // → dir.setViewport(rect)  ← 唯一的布局读取
 * canvas.addEventListener("pointermove", (e) => dir.pointerMove(e.clientX, e.clientY, e.timeStamp));
 * ScrollTrigger.create({ onUpdate: (s) => dir.setScroll(s.progress) });
 * function frame(now) {                      // 调用方拥有 rAF
 *   dir.update((now - last) / 1000);
 *   for (const im of dir.drainImpulses()) solver.injectImpulse(im.world, im.strength, im.radius);
 *   render(dir.getFrameState());
 * }
 * ```
 *
 * ⚠️ **自足类**,见文件头 —— 方法里不许引用模块作用域的**函数**;
 * 引用到的模块级常量必须在 `gen-water-preview.mjs` 里按值内联。
 */
export class WaterDirector {
  from: WaterPresetName;
  to: WaterPresetName;
  flags: WaterDirectorFlags;
  tuning: WaterDirectorTuning;
  orbSource: WaterOrbSource | null;
  viewport: WaterViewport;
  baseWind: { dirRad: number; speed: number };

  /** 水面时间(秒)。reduced-motion 下恒为 `tuning.frozenTime` */
  time: number;

  /** 滚动进度:目标(事件推进来)与阻尼跟随的当前值 */
  scrollTarget: number;
  scroll: number;

  /** 悬停弹簧:位置 1.0 → hoverEnergy,速度 */
  hoverPos: number;
  hoverVel: number;
  orbHover: boolean;

  /** 生命周期闸门 0..1(入场/退场)。`energy = gate × hoverPos` */
  gate: number;
  /** 退场进度(秒);<0 = 没在退场 */
  exitElapsed: number;
  exitFrom: number;

  /** 球位的 20 ms 一阶跟随 */
  orbX: number;
  orbY: number;
  orbPosed: boolean;

  /* ── 行⑩ 拖拽(W11b)──────────────────────────────────────────────────
   * 拖的是**相对时间线的偏移**(NDC),不是绝对球位 —— 理由见 flags.orbDrag。
   * `dragGrab*` 是按下那一刻「指针 NDC − 当前偏移」,后续 `dragMove` 用
   * 指针 NDC 减掉它得到新偏移:这样按下时**不跳**,哪怕上一次的回位弹簧
   * 还没收敛完就又被抓住。 */
  dragging: boolean;
  dragOffX: number;
  dragOffY: number;
  dragVelX: number;
  dragVelY: number;
  dragGrabX: number;
  dragGrabY: number;
  /**
   * dragPersist 下松手固化的持久偏移(NDC)。screen = orbX/orbY(时间线) + 本量
   * + 拖动中的 dragOff。**默认路径(主页)恒为 0** —— 「没有拖拽时球位与时间线
   * 逐位相同」的回归门不受影响。
   */
  orbBaseOffX: number;
  orbBaseOffY: number;
  /** 见构造:松手是否固化位置(lab true / 主页 false) */
  dragPersist: boolean;

  /** 行⑪ 退场后退 0..1 → uniform uOrbPoolRetreat。静息恒为 0 */
  retreat: number;

  /** 点击曝光包络:自点击起的秒数;<0 = 没有活动的包络 */
  clickElapsed: number;

  /* ── 行⑨ 聚焦态(W10)────────────────────────────────────────────────
   * `focusTarget` 是页面推进来的目标(0 或 1,也接受中间值);
   * `focus` 是缓动之后的当前值,写进 `frame.focus` → uniform uOrbFocus。
   * `focusFrom` / `focusElapsed` 是这一段过渡的起点与已用时长。 */
  focusTarget: number;
  focus: number;
  focusFrom: number;
  /** 过渡已用秒数;<0 = 没有在过渡(已经停在目标上) */
  focusElapsed: number;

  /** 静置计时与风速倍率 */
  idleElapsed: number;
  windFactor: number;

  /** 指针状态(全部来自事件对象) */
  lastX: number;
  lastY: number;
  lastMs: number;
  hasPointer: boolean;
  lastInjectMs: number;

  reducedMotion: boolean;

  counters: WaterDirectorCounters;
  pending: WaterImpulse[];
  rippleField: RippleField | null;

  /** 复用的输出对象 —— 每帧零分配。**消费方不要持有引用**,它每帧被就地改写。 */
  frame: WaterFrameState;

  constructor(options?: Partial<WaterDirectorOptions>) {
    const o = options ?? {};
    this.from = o.from ?? "night";
    this.to = o.to ?? "mid";
    this.orbSource = o.orbSource ?? null;
    this.viewport = o.viewport ?? { left: 0, top: 0, width: 1920, height: 1080 };
    this.baseWind = o.wind ?? { dirRad: WATER_BASE_WIND.dirRad, speed: WATER_BASE_WIND.speed };

    this.flags = {
      pointerRipple: WATER_DIRECTOR_FLAGS_ON.pointerRipple,
      orbHoverEnergy: WATER_DIRECTOR_FLAGS_ON.orbHoverEnergy,
      orbFollow: WATER_DIRECTOR_FLAGS_ON.orbFollow,
      scrollCamera: WATER_DIRECTOR_FLAGS_ON.scrollCamera,
      clickImpulse: WATER_DIRECTOR_FLAGS_ON.clickImpulse,
      idleWind: WATER_DIRECTOR_FLAGS_ON.idleWind,
      orbExit: WATER_DIRECTOR_FLAGS_ON.orbExit,
      orbScrollPose: WATER_DIRECTOR_FLAGS_ON.orbScrollPose,
      orbDrag: WATER_DIRECTOR_FLAGS_ON.orbDrag,
      orbExitRetreat: WATER_DIRECTOR_FLAGS_ON.orbExitRetreat,
    };
    if (o.flags) {
      const given = o.flags as unknown as Record<string, boolean | undefined>;
      for (const k of Object.keys(given)) this.setFlag(k, Boolean(given[k]));
    }

    this.tuning = Object.assign({}, WATER_DIRECTOR_TUNING, o.tuning ?? {});

    this.dragPersist = o.dragPersist ?? false;

    this.reducedMotion = o.reducedMotion ?? false;
    this.time = this.reducedMotion ? this.tuning.frozenTime : 0;

    this.scrollTarget = 0;
    this.scroll = 0;
    this.hoverPos = 1;
    this.hoverVel = 0;
    this.orbHover = false;
    this.gate = 1;
    this.exitElapsed = -1;
    this.exitFrom = 1;
    this.orbX = 0;
    this.orbY = 0;
    this.orbPosed = false;
    this.dragging = false;
    this.dragOffX = 0;
    this.dragOffY = 0;
    this.orbBaseOffX = 0;
    this.orbBaseOffY = 0;
    this.dragVelX = 0;
    this.dragVelY = 0;
    this.dragGrabX = 0;
    this.dragGrabY = 0;
    this.retreat = 0;
    this.clickElapsed = -1;
    this.focusTarget = 0;
    this.focus = 0;
    this.focusFrom = 0;
    this.focusElapsed = -1;
    this.idleElapsed = 0;
    this.windFactor = 1;
    this.lastX = 0;
    this.lastY = 0;
    this.lastMs = 0;
    this.hasPointer = false;
    this.lastInjectMs = -1e9;
    this.pending = [];
    this.rippleField = null;
    this.counters = {
      pointerEvents: 0,
      injected: 0,
      suppressedByThreshold: 0,
      suppressedByThrottle: 0,
      suppressedOffSurface: 0,
      suppressedByGate: 0,
      clicks: 0,
      drags: 0,
    };

    const cam = WATER_CAMERA_STOPS[this.from];
    this.frame = {
      time: this.time,
      camHeight: cam.camHeight,
      camPitch: cam.camPitch,
      fovY: cam.fovY,
      horizonY: 0,
      wind: { dirRad: this.baseWind.dirRad, speed: this.baseWind.speed },
      orb: {
        screen: [0, 0],
        radiusNdc: 0.1,
        energy: 1,
        spinPhase: 0,
        lightmapFrame: 0,
        worldRadius: 0.22,
      },
      ripple: null,
      exposureBoost: 0,
      focus: 0,
      orbRetreat: 0,
    };
    this.update(0);
  }

  /* ── 输入 ──────────────────────────────────────────────────────────── */

  /**
   * 缓存画布的位置与尺寸。**调用方在 resize / ResizeObserver 里调一次**,
   * 那是整条链路上唯一允许 `getBoundingClientRect()` 的地方。
   */
  setViewport(vp: WaterViewport): void {
    this.viewport = { left: vp.left, top: vp.top, width: vp.width, height: vp.height };
  }

  /** 滚动进度 0..1。来自 ScrollTrigger 的 `self.progress`,不是量出来的。 */
  setScroll(p: number): void {
    this.scrollTarget = p < 0 ? 0 : p > 1 ? 1 : p;
  }

  /** 指针是否悬停在灯球上。由 DOM 的 pointerenter/leave 推进来。 */
  setOrbHover(on: boolean): void {
    this.orbHover = on;
    this.idleElapsed = 0;
  }

  /** HR-9 之后:球退场,800 ms ease-out 把 energy 拉到 0。 */
  beginOrbExit(): void {
    if (this.exitElapsed >= 0) return;
    this.exitFrom = this.gate;
    this.exitElapsed = 0;
  }

  /** 撤销退场(回滚滚动时用)。 */
  cancelOrbExit(): void {
    this.exitElapsed = -1;
    this.gate = 1;
  }

  /**
   * 行⑨ 聚焦态(W10):把 `uOrbFocus` 推向 `p`(0 = 展示态 A,1 = 聚焦态 B)。
   *
   * **只由页面显式调用** —— 不绑 energy、不绑滚动、不绑 IntersectionObserver。
   * 聚焦是叙事决定的:页面知道"现在该聚焦了",视口位置不知道。
   *
   * 过渡 `tuning.focusDuration`(800 ms),缓动 **power4.inOut** —— 与
   * `docs/homepage-animation-plan.md` 里 lab/home 球退场那条
   * (`motionTokens.ease.swipe`)同一条曲线。这里手写而不是 import GSAP:
   * `WaterDirector` 是**渲染器无关的自足类**(见类注释),它的源码要能被
   * `toString()` 内联进预览台,引不进任何模块。
   *
   * `prefers-reduced-motion` 下**不做过渡,直接跳到目标**(`snapAll()` 那条)。
   *
   * 重复调用同一个目标不会重启过渡;中途改目标会从**当前值**接着走,
   * 不是从 0/1 重来 —— 快速来回切时不会跳。
   */
  setFocus(p: number): void {
    const t = p < 0 ? 0 : p > 1 ? 1 : p;
    if (t === this.focusTarget) return;
    this.focusTarget = t;
    if (this.reducedMotion) {
      this.focus = t;
      this.focusElapsed = -1;
      this.compose();
      return;
    }
    this.focusFrom = this.focus;
    this.focusElapsed = 0;
  }

  /** 「聚焦 / 展示」切换。返回切换之后的目标值。 */
  toggleFocus(): number {
    const next = this.focusTarget >= 0.5 ? 0 : 1;
    this.setFocus(next);
    return next;
  }

  /** W6 的求解器把 `field()` 塞进来,`getFrameState().ripple` 直接给消费端。 */
  setRippleField(f: RippleField | null): void {
    this.rippleField = f;
  }

  setOrbSource(s: WaterOrbSource | null): void {
    this.orbSource = s;
  }

  /** 单条开关。预览台一条条关掉看差别。 */
  setFlag(name: string, on: boolean): void {
    if (Object.prototype.hasOwnProperty.call(this.flags, name)) {
      (this.flags as unknown as Record<string, boolean>)[name] = on;
    }
  }

  /**
   * `prefers-reduced-motion`。打开后:水面定格在 `frozenTime`、球光静态、
   * **不注入任何涟漪**,而且所有阻尼量**立刻吸附到目标** ——
   * 这样连续两帧逐像素差恒为 0(否则弹簧还在收敛,两帧就不一样)。
   */
  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    if (on) {
      this.time = this.tuning.frozenTime;
      this.pending = [];
      this.snapAll();
    }
  }

  /**
   * 接上系统设置并**监听变化**(用户中途改设置要生效)。返回退订函数。
   * 没有 `matchMedia`(SSR / Node 测试)时是个空操作。
   */
  bindReducedMotion(): () => void {
    const g = globalThis as unknown as {
      matchMedia?: (q: string) => {
        matches: boolean;
        addEventListener?: (t: string, h: (e: { matches: boolean }) => void) => void;
        removeEventListener?: (t: string, h: (e: { matches: boolean }) => void) => void;
      };
    };
    if (typeof g.matchMedia !== "function") return () => {};
    const mq = g.matchMedia("(prefers-reduced-motion: reduce)");
    this.setReducedMotion(Boolean(mq.matches));
    const onChange = (e: { matches: boolean }): void => {
      this.setReducedMotion(Boolean(e.matches));
    };
    if (typeof mq.addEventListener !== "function") return () => {};
    mq.addEventListener("change", onChange);
    return () => {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onChange);
    };
  }

  /**
   * 一个 pointermove。**只吃事件对象里的三个数**,不碰 DOM。
   *
   * 判定顺序(每次只落进一个计数桶,保证不变式成立):
   * 总闸门 → 速度阈值 → 40 ms 节流 → 逆投影是否打到水面 → 注入。
   */
  pointerMove(clientX: number, clientY: number, timeStampMs: number): void {
    this.counters.pointerEvents++;
    this.idleElapsed = 0;

    const prevX = this.lastX;
    const prevY = this.lastY;
    const prevMs = this.lastMs;
    const had = this.hasPointer;
    // 无论挡不挡,都要更新"上一个点",否则速度会算成一大跳
    this.lastX = clientX;
    this.lastY = clientY;
    this.lastMs = timeStampMs;
    this.hasPointer = true;

    const scale = this.impulseScale();
    /* **拖球时不下雨。** 拖拽中指针每一发 pointermove 也会走到这里;
     * 手里正拖着球还沿路砸出一串涟漪,读起来像"球在犁水",而设计原则①
     * 说得很清楚:球对水是**辐射度**的,不是力学的。算进 gate 桶,
     * 不变式(pointerEvents = 五个桶之和)照样成立。 */
    if (this.reducedMotion || this.dragging || !this.flags.pointerRipple ||
        !(scale.hoverStrength > 0)) {
      this.counters.suppressedByGate++;
      return;
    }

    const dtMs = timeStampMs - prevMs;
    if (!had || !(dtMs > 0)) {
      this.counters.suppressedByThreshold++;
      return;
    }
    const v = Math.hypot(clientX - prevX, clientY - prevY) / dtMs; // px/ms
    if (!(v > this.tuning.pointerSpeedMin)) {
      this.counters.suppressedByThreshold++;
      return;
    }
    if (timeStampMs - this.lastInjectMs < this.tuning.pointerThrottleMs) {
      this.counters.suppressedByThrottle++;
      return;
    }
    const w = this.clientToWater(clientX, clientY);
    if (!w) {
      this.counters.suppressedOffSurface++;
      return;
    }

    const gain = Math.min(v, this.tuning.pointerSpeedMax);
    this.push({
      world: w,
      strength: scale.hoverStrength * gain,
      radius: scale.hoverRadius,
      kind: "hover",
    });
    this.lastInjectMs = timeStampMs;
    this.counters.injected++;
  }

  /** 指针离开画布:清掉"上一个点",下次进来重新起速度。 */
  pointerLeave(): void {
    this.hasPointer = false;
  }

  /* ── 行⑩ 拖拽灯球(W11b)──────────────────────────────────────────────
   *
   * **命中判定不在这里。** 和 `setOrbHover()` 同一个分工:球在 DOM 层
   * (HR-8 的反色凹槽要 mix-blend-mode 作用在 img 上),谁在球上是**页面**
   * 用 pointerenter/pointerleave 知道的,编排器不做屏幕空间的碰撞检测 ——
   * 它连球的 DOM 尺寸都不该知道。调用方只在指针确实按在球上时调 dragStart。
   *
   * 三个方法都用 `clientX/clientY`,与 pointerMove/pointerDown 一致;
   * NDC 换算只用缓存的 viewport,一次布局读取都没有。 */

  /** 按住球。返回是否真的进入拖拽(开关关掉 / reduced-motion / 视口未知时不进)。 */
  dragStart(clientX: number, clientY: number): boolean {
    this.idleElapsed = 0;
    if (this.reducedMotion || !this.flags.orbDrag) return false;
    const n = this.clientToNdc(clientX, clientY);
    if (!n) return false;
    /* 抓取点 = 指针 NDC − 当前偏移。按下时 offset 不跳,回位弹簧没收敛完
     * 又被抓住也接得上(接住的是当时的偏移,不是 0)。 */
    this.dragGrabX = n[0] - this.dragOffX;
    this.dragGrabY = n[1] - this.dragOffY;
    this.dragVelX = 0;
    this.dragVelY = 0;
    this.dragging = true;
    this.counters.drags++;
    return true;
  }

  /** 拖动中。偏移 = 指针 NDC − 抓取点,夹在 dragRangeX/Y 的矩形里。 */
  dragMove(clientX: number, clientY: number): void {
    this.idleElapsed = 0;
    if (!this.dragging) return;
    const n = this.clientToNdc(clientX, clientY);
    if (!n) return;
    const rx = this.tuning.dragRangeX;
    const ry = this.tuning.dragRangeY;
    const ox = n[0] - this.dragGrabX;
    const oy = n[1] - this.dragGrabY;
    /* **矩形夹取,不是圆形。** 用户的话是"在一定范围内拖拽球体";矩形的边界
     * 在拖到头时给出一条直的滑轨(手感是"顶到边"),圆形边界会让球沿着弧线
     * 滑走 —— 那读起来像失控,不像有边界。 */
    this.dragOffX = ox < -rx ? -rx : ox > rx ? rx : ox;
    this.dragOffY = oy < -ry ? -ry : oy > ry ? ry : oy;
  }

  /** 松手。偏移按二阶弹簧(ζ=0.8 ω=12)回 0,速度从松手那一刻的 0 起算。 */
  dragEnd(): void {
    this.dragging = false;
    /* lab(dragPersist):把这次拖拽偏移折叠进持久基准,松手就停在原地(不回弹)。
     * dragOff 清零后,下面 update() 里的二阶弹簧因偏移已为 0 而不触发。
     * 主页(dragPersist=false)不折叠,照旧弹簧回时间线位。 */
    if (this.dragPersist) {
      this.orbBaseOffX += this.dragOffX;
      this.orbBaseOffY += this.dragOffY;
      this.dragOffX = 0;
      this.dragOffY = 0;
      this.dragVelX = 0;
      this.dragVelY = 0;
    }
  }

  /**
   * 点击水面:大冲击 + 短暂曝光提升(60 ms attack / 1.8 s decay)。
   * 不走速度阈值,也不走节流 —— 点击是**意图**,不是抖动。
   */
  pointerDown(clientX: number, clientY: number): boolean {
    this.idleElapsed = 0;
    if (this.reducedMotion || !this.flags.clickImpulse) return false;
    const scale = this.impulseScale();
    if (!(scale.clickStrength > 0)) return false;
    const w = this.clientToWater(clientX, clientY);
    if (!w) return false;
    this.push({ world: w, strength: scale.clickStrength, radius: scale.clickRadius, kind: "click" });
    this.clickElapsed = 0;
    this.counters.clicks++;
    return true;
  }

  /* ── 每帧 ──────────────────────────────────────────────────────────── */

  /**
   * 推进一帧。`dt` 是**秒**。调用方拥有 rAF。
   * dt 被夹到 `tuning.maxDt`:标签页切回来时 rAF 给的是好几秒,
   * 那时所有阻尼一步跳到目标,观感是"瞬移"。
   */
  update(dtSeconds: number): void {
    let dt = dtSeconds > 0 ? dtSeconds : 0;
    if (dt > this.tuning.maxDt) dt = this.tuning.maxDt;

    if (this.reducedMotion) {
      this.time = this.tuning.frozenTime;
      this.snapAll();
      this.compose();
      return;
    }

    this.time += dt;
    this.idleElapsed += dt;

    // 行④ 滚动 → 相机。阻尼 0.12/帧@60,换成与帧率无关的形式
    if (this.flags.scrollCamera) {
      const k = 1 - Math.pow(1 - this.tuning.scrollDamping, dt * 60);
      this.scroll += (this.scrollTarget - this.scroll) * k;
      /* **停下来就吸附到目标。** 指数阻尼永远只是渐近,`scroll` 会停在
       * 0.9999999…;于是 `camera()` 解出来的 camHeight 是 1.600000000000001,
       * 而 preset 是 1.6 —— 差 1e-15,肉眼看不见,但"编排层一接进来画面就
       * 与 preset 不再逐位相同"这件事本身就该消灭。5e-5 的门限对应
       * camHeight 上 1.2e-4 m,远小于一个纹素。 */
      if (Math.abs(this.scrollTarget - this.scroll) < 5e-5) this.scroll = this.scrollTarget;
    } else {
      this.scroll = 0;
    }

    // 行② 悬停 → energy 二阶弹簧(半隐式欧拉,ω·dt 大时细分)
    if (this.flags.orbHoverEnergy) {
      const target = this.orbHover ? this.tuning.hoverEnergy : 1;
      const w = this.tuning.hoverOmega;
      const z = this.tuning.hoverZeta;
      /* 细分到 ω·h ≤ 0.05。半隐式欧拉对阻尼振子有**数值阻尼**:直接用
       * dt=1/60(ω·h=0.2)跑出来的过冲只有 0.3%,而 ζ=0.8 的解析过冲是
       * exp(−πζ/√(1−ζ²)) = 1.5% —— 那等于文档里写 ζ=0.8、实际跑 ζ≈0.95。
       * 四次细分把它拉回 1.4%,每帧多 ~24 次浮点运算,可以忽略。 */
      const n = Math.max(1, Math.ceil((dt * w) / 0.05));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this.hoverVel += (w * w * (target - this.hoverPos) - 2 * z * w * this.hoverVel) * h;
        this.hoverPos += this.hoverVel * h;
      }
    } else {
      this.hoverPos = 1;
      this.hoverVel = 0;
    }

    /* 行⑦ 退场:800 ms ease-out(power2.out = 1-(1-t)²)
     * 行⑪ 退场后退(W11b):同一段进度,**互补的那一半**。
     *   gate    = exitFrom · (1−u)²    能量:半程时只剩 25%
     *   retreat = 1 − (1−u)²           后退:半程时已经走了 75%
     * 这个先后关系是刻意的 —— 后退必须**跑在变暗前面**,不然池子还没挪
     * 就已经黑了,「收回海岸线」这句话在画面上根本不存在(退场只有 800 ms,
     * 60 fps 下就 48 帧,谁先谁后是能看出来的)。 */
    if (this.exitElapsed >= 0 && this.flags.orbExit) {
      this.exitElapsed += dt;
      const u = Math.min(1, this.exitElapsed / this.tuning.exitDuration);
      const k = (1 - u) * (1 - u);
      this.gate = this.exitFrom * k;
      this.retreat = this.flags.orbExitRetreat ? 1 - k : 0;
    } else if (!this.flags.orbExit) {
      this.gate = 1;
      this.retreat = 0;
    } else if (this.exitElapsed < 0) {
      // 没在退场:后退必须精确归 0(shader 里 ×(1+0·K) 才是逐位恒等)
      this.retreat = 0;
    }

    /* 行⑨ 聚焦态:800 ms power4.inOut。
     * power4.inOut = u<0.5 ? 8u⁴ : 1 − 8(1−u)⁴ —— GSAP 的定义,这里手写
     * (自足类不许 import,见 setFocus 的注释)。到点后 focusElapsed 置 -1
     * 并**把 focus 精确写成目标值**:缓动函数在 u=1 处解析上就是 1,
     * 但浮点上 1 − 8·(1−1)⁴ 依赖 (1-u) 的舍入,显式赋值省掉这份不确定
     * ——「停在端点时与端点逐位相同」和 camera() 里那条是同一个理由。 */
    if (this.focusElapsed >= 0) {
      this.focusElapsed += dt;
      const u = Math.min(1, this.focusElapsed / this.tuning.focusDuration);
      if (u >= 1) {
        this.focus = this.focusTarget;
        this.focusElapsed = -1;
      } else {
        const e = u < 0.5 ? 8 * u * u * u * u : 1 - 8 * (1 - u) * (1 - u) * (1 - u) * (1 - u);
        this.focus = this.focusFrom + (this.focusTarget - this.focusFrom) * e;
      }
    }

    // 行⑤ 点击曝光包络:线性 attack,指数 decay
    if (this.clickElapsed >= 0) {
      this.clickElapsed += dt;
      if (this.clickElapsed > this.tuning.clickAttack + this.tuning.clickDecayTau * 8) {
        this.clickElapsed = -1;
      }
    }

    // 行⑥ 静置 >4 s → 风速缓降;一有交互就回升(快得多)
    if (this.flags.idleWind) {
      const idle = this.idleElapsed > this.tuning.idleAfter;
      if (idle) {
        const rate = (1 - this.tuning.windIdleFactor) / this.tuning.windDecay;
        this.windFactor = Math.max(this.tuning.windIdleFactor, this.windFactor - rate * dt);
      } else {
        const rate = (1 - this.tuning.windIdleFactor) / this.tuning.windRecover;
        this.windFactor = Math.min(1, this.windFactor + rate * dt);
      }
    } else {
      this.windFactor = 1;
    }

    /* 行⑩ 拖拽偏移(W11b)。拖动中偏移**直接跟指针**(1:1,没有滞后)——
     * 手上拖着的东西有延迟就是"卡",行③ 那 20 ms 是给时间线运动用的,不是
     * 给手用的。松手后按二阶弹簧回 0,细分策略与行② 悬停完全一致
     * (ω·h ≤ 0.05,理由见那一段:半隐式欧拉在 ω·dt=0.2 时把 ζ=0.8 跑成 ≈0.95)。 */
    if (!this.flags.orbDrag) {
      this.dragging = false;
      this.dragOffX = 0;
      this.dragOffY = 0;
      this.dragVelX = 0;
      this.dragVelY = 0;
      /* 关掉拖拽耦合 = 球回时间线位:持久基准也清零(顺带给 lab 一个「复位」途径:
       * 面板耦合矩阵里把 Orb drag 关一下再开)。 */
      this.orbBaseOffX = 0;
      this.orbBaseOffY = 0;
    } else if (!this.dragging && (this.dragOffX !== 0 || this.dragOffY !== 0 ||
               this.dragVelX !== 0 || this.dragVelY !== 0)) {
      const w = this.tuning.dragOmega;
      const z = this.tuning.dragZeta;
      const n = Math.max(1, Math.ceil((dt * w) / 0.05));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this.dragVelX += (w * w * (0 - this.dragOffX) - 2 * z * w * this.dragVelX) * h;
        this.dragVelY += (w * w * (0 - this.dragOffY) - 2 * z * w * this.dragVelY) * h;
        this.dragOffX += this.dragVelX * h;
        this.dragOffY += this.dragVelY * h;
      }
      /* **收敛后精确归零。** 二阶弹簧和指数阻尼一样只是渐近,偏移会停在
       * 1e-9 上;而"没有拖拽时球位与时间线逐位相同"是本卡的回归门
       * ——同 scroll 那条吸附(行④)。1e-5 NDC ≈ 1080p 下 0.005 px。 */
      if (Math.abs(this.dragOffX) < 1e-5 && Math.abs(this.dragVelX) < 1e-4) {
        this.dragOffX = 0;
        this.dragVelX = 0;
      }
      if (Math.abs(this.dragOffY) < 1e-5 && Math.abs(this.dragVelY) < 1e-4) {
        this.dragOffY = 0;
        this.dragVelY = 0;
      }
    }

    /* 行③ 球位 20 ms 一阶跟随。
     * 行⑧ 开着时 **y 的目标来自滚动插值**(相机与球位共用同一个 `this.scroll`),
     * x 仍然归时间线管 —— 球横穿画面是叙事,球离水面多高是构图。 */
    const src = this.sampleOrb();
    const pose = this.orbPose();
    const tx = src.screen[0];
    const ty = pose ? pose.screenY : src.screen[1];
    if (!this.orbPosed || !this.flags.orbFollow) {
      this.orbX = tx;
      this.orbY = ty;
      this.orbPosed = true;
    } else {
      const k = 1 - Math.exp(-dt / this.tuning.followTau);
      this.orbX += (tx - this.orbX) * k;
      this.orbY += (ty - this.orbY) * k;
    }

    this.compose();
  }

  /** 取出这一帧要注入的冲击,队列清空。调用方喂给 `RippleSolver.injectImpulse`。 */
  drainImpulses(): WaterImpulse[] {
    if (this.pending.length === 0) return [];
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** 这一帧的水面状态。**返回的对象每帧复用,不要持有引用。** */
  getFrameState(): WaterFrameState {
    return this.frame;
  }

  /** 当前滚动位置解出来的相机(插值结果)。 */
  camera(): WaterCameraStop {
    const a = WATER_CAMERA_STOPS[this.from];
    const b = WATER_CAMERA_STOPS[this.to];
    const u = this.flags.scrollCamera ? this.scroll : 0;
    // 端点原样返回,不走插值 —— 停在端点时与 preset 的相机**逐位相同**
    if (u <= 0) return { camHeight: a.camHeight, camPitch: a.camPitch, fovY: a.fovY };
    if (u >= 1) return { camHeight: b.camHeight, camPitch: b.camPitch, fovY: b.fovY };
    return {
      camHeight: a.camHeight + (b.camHeight - a.camHeight) * u,
      camPitch: a.camPitch + (b.camPitch - a.camPitch) * u,
      fovY: a.fovY + (b.fovY - a.fovY) * u,
    };
  }

  /**
   * 当前滚动位置解出来的**球位**(行⑧,W8)。开关关掉时返回 `null`,
   * 那时球位完全由时间线给 —— 就是 W7 的行为。
   *
   * **`worldRadius` 在对数空间插值**,理由与 `impulseScale()` 一模一样:
   * night→mid 的半径比是 1.8 / 0.22 = 8.2×,线性插值会让滚动的前 80% 都还
   * 停在夜景那个量级(球心几十米外),到 mid 端才骤降 —— 而球心距离
   * `d = R / sin(α)` 是**正比于 R** 的,所以"每滚 10% 距离缩同一个比例"
   * 才是匀速的观感。`screenY` / `radiusNdc` 是屏幕量,线性就对。
   *
   * 端点原样返回,不走插值 —— 停在端点时球位与 preset 的球位**逐位相同**
   * (同 `camera()` 里那条,理由写在那里)。
   */
  orbPose(): WaterOrbStop | null {
    if (!this.flags.orbScrollPose) return null;
    const a = WATER_ORB_STOPS[this.from];
    const b = WATER_ORB_STOPS[this.to];
    const u = this.flags.scrollCamera ? this.scroll : 0;
    if (u <= 0) return { screenY: a.screenY, radiusNdc: a.radiusNdc, worldRadius: a.worldRadius };
    if (u >= 1) return { screenY: b.screenY, radiusNdc: b.radiusNdc, worldRadius: b.worldRadius };
    return {
      screenY: a.screenY + (b.screenY - a.screenY) * u,
      radiusNdc: a.radiusNdc + (b.radiusNdc - a.radiusNdc) * u,
      worldRadius: Math.exp(
        Math.log(a.worldRadius) + (Math.log(b.worldRadius) - Math.log(a.worldRadius)) * u,
      ),
    };
  }

  /**
   * 当前滚动位置的冲击尺度。**在对数空间插值**:
   * night→mid 的半径比是 2.5 / 0.15 = 16.7×,线性插值会让滚动的前 80%
   * 都还停在夜景那一档的量级,到了 mid 端才骤降;等比插值才让"每滚 10%
   * 尺度缩同一个比例"。强度同理(40× 比)。
   */
  impulseScale(): WaterImpulseScale {
    const a = WATER_IMPULSE_SCALES[this.from];
    const b = WATER_IMPULSE_SCALES[this.to];
    const u = this.flags.scrollCamera ? this.scroll : 0;
    if (u <= 0) return { ...a };
    if (u >= 1) return { ...b };
    const geo = (p: number, q: number): number => {
      if (!(p > 0) || !(q > 0)) return p + (q - p) * u; // 有 0 端(near)就退回线性
      return Math.exp(Math.log(p) + (Math.log(q) - Math.log(p)) * u);
    };
    return {
      hoverRadius: geo(a.hoverRadius, b.hoverRadius),
      hoverStrength: geo(a.hoverStrength, b.hoverStrength),
      clickRadius: geo(a.clickRadius, b.clickRadius),
      clickStrength: geo(a.clickStrength, b.clickStrength),
    };
  }

  /** 点击曝光包络的当前值(0..clickExposure)。 */
  exposureBoost(): number {
    if (this.clickElapsed < 0 || !this.flags.clickImpulse || this.reducedMotion) return 0;
    const t = this.clickElapsed;
    const a = this.tuning.clickAttack;
    if (t < a) return this.tuning.clickExposure * (t / a);
    return this.tuning.clickExposure * Math.exp(-(t - a) / this.tuning.clickDecayTau);
  }

  /** 计数器快照(预览台每帧读它)。 */
  stats(): WaterDirectorCounters {
    return {
      pointerEvents: this.counters.pointerEvents,
      injected: this.counters.injected,
      suppressedByThreshold: this.counters.suppressedByThreshold,
      suppressedByThrottle: this.counters.suppressedByThrottle,
      suppressedOffSurface: this.counters.suppressedOffSurface,
      suppressedByGate: this.counters.suppressedByGate,
      clicks: this.counters.clicks,
      drags: this.counters.drags,
    };
  }

  resetCounters(): void {
    this.counters.pointerEvents = 0;
    this.counters.injected = 0;
    this.counters.suppressedByThreshold = 0;
    this.counters.suppressedByThrottle = 0;
    this.counters.suppressedOffSurface = 0;
    this.counters.suppressedByGate = 0;
    this.counters.clicks = 0;
    this.counters.drags = 0;
  }

  /* ── 内部 ──────────────────────────────────────────────────────────── */

  /**
   * 屏幕坐标 → NDC(x/y ∈ [−1,1],y 向上)。**只用缓存的 viewport**,不问 DOM 要。
   * 视口还没量过(width/height 为 0)时返回 null —— 那时任何换算都是垃圾。
   *
   * 拆出来是给行⑩ 拖拽用的:拖拽只需要 NDC(球位本来就是 NDC),
   * 不需要逆投影到水面。`clientToWater` 也走它,两条路的 NDC 定义因此只有一份。
   */
  clientToNdc(clientX: number, clientY: number): [number, number] | null {
    const vp = this.viewport;
    if (!(vp.width > 0) || !(vp.height > 0)) return null;
    return [((clientX - vp.left) / vp.width) * 2 - 1, 1 - ((clientY - vp.top) / vp.height) * 2];
  }

  /**
   * 屏幕坐标 → 水面场坐标。与 `field.glsl.ts` 的 `waterSurfacePoint`
   * 是同一套式子(预览台里那份 `ndcToWater` 也是)。
   * **只用缓存的 viewport**,不问 DOM 要。地平线以上返回 null。
   */
  clientToWater(clientX: number, clientY: number): [number, number] | null {
    const n = this.clientToNdc(clientX, clientY);
    if (!n) return null;
    const nx = n[0];
    const ny = n[1];
    const vp = this.viewport;
    const cam = this.camera();
    const tanH = Math.tan(cam.fovY * 0.5);
    const aspect = vp.width / vp.height;
    let dx = nx * tanH * aspect;
    let dy = ny * tanH;
    let dz = -1;
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx *= inv;
    dy *= inv;
    dz *= inv;
    const cp = Math.cos(cam.camPitch);
    const sp = Math.sin(cam.camPitch);
    const ry = dy * cp + dz * sp;
    const rz = -dy * sp + dz * cp;
    if (ry >= -1e-4) return null; // 地平线以上,没有交点
    const tHit = cam.camHeight / -ry;
    return [dx * tHit, -(rz * tHit)];
  }

  /** 排队一个冲击;超过上限就丢最旧的(卡帧不该攒出一串)。 */
  push(im: WaterImpulse): void {
    this.pending.push(im);
    while (this.pending.length > this.tuning.maxPendingImpulses) this.pending.shift();
  }

  /** 从时间线取一帧球位;没有取值函数时给一个静态球。 */
  sampleOrb(): OrbState {
    if (this.orbSource) return this.orbSource(this.time);
    return {
      screen: [-0.44, 0.42],
      radiusNdc: 0.1,
      energy: 1,
      spinPhase: 0,
      lightmapFrame: 0,
      worldRadius: 0.22,
    };
  }

  /** reduced-motion:所有阻尼量立刻吸附到目标,连续两帧才可能逐像素相同。 */
  snapAll(): void {
    this.scroll = this.flags.scrollCamera ? this.scrollTarget : 0;
    this.hoverPos = 1; // 球光静态:悬停不再抬 energy
    this.hoverVel = 0;
    this.windFactor = 1;
    this.clickElapsed = -1;
    // 行⑨ 聚焦态:reduced-motion 下不做过渡,直接停在目标上
    this.focus = this.focusTarget;
    this.focusElapsed = -1;
    if (this.exitElapsed >= 0 && this.flags.orbExit) {
      this.exitElapsed = this.tuning.exitDuration;
      this.gate = 0;
      // 行⑪:退场已经走完 → 后退量停在终点(不是 0,画面才是"已经收走了")
      this.retreat = this.flags.orbExitRetreat ? 1 : 0;
    } else if (!this.flags.orbExit) {
      this.gate = 1;
      this.retreat = 0;
    } else {
      this.retreat = 0;
    }
    /* 行⑩:reduced-motion 下拖拽偏移直接归零并松手 —— 回位弹簧本身就是动效。
     * 这一条是「连续两帧逐像素差恒为 0」那条验收的落点之一:弹簧还在收敛,
     * 两帧就不一样。 */
    this.dragging = false;
    this.dragOffX = 0;
    this.dragOffY = 0;
    this.dragVelX = 0;
    this.dragVelY = 0;
    const src = this.sampleOrb();
    const pose = this.orbPose();
    this.orbX = src.screen[0];
    this.orbY = pose ? pose.screenY : src.screen[1];
    this.orbPosed = true;
  }

  /** 把所有状态量写进复用的 `frame` 对象。**这里没有任何 DOM 读取。** */
  compose(): void {
    const cam = this.camera();
    const f = this.frame;
    f.time = this.time;
    f.camHeight = cam.camHeight;
    f.camPitch = cam.camPitch;
    f.fovY = cam.fovY;
    f.horizonY = Math.tan(cam.camPitch) / Math.tan(cam.fovY * 0.5);
    f.wind.dirRad = this.baseWind.dirRad;
    f.wind.speed = this.baseWind.speed * this.windFactor;

    const src = this.sampleOrb();
    /* 行⑧:球的**尺度**(屏幕半径 + 世界半径)跟着滚动走,不然滚到另一个
     * 相机高度时光斑整片落到画框外 —— 那正是 W7 挖出来的「灯直接熄」。 */
    const pose = this.orbPose();
    /* 行⑩:拖拽偏移**加在一阶跟随之后**,不是加在目标上 ——
     * 加在目标上会让手上的球也吃那 20 ms 滞后。没有拖拽时两个偏移精确为 0,
     * `x + 0` 在 IEEE 下逐位恒等(x 为 ±0 时符号也保得住,这里 x 不会是 −0)。 */
    f.orb.screen[0] = this.orbX + this.orbBaseOffX + this.dragOffX;
    f.orb.screen[1] = this.orbY + this.orbBaseOffY + this.dragOffY;
    f.orb.radiusNdc = pose ? pose.radiusNdc : src.radiusNdc;
    f.orb.spinPhase = this.reducedMotion ? 0 : src.spinPhase;
    f.orb.lightmapFrame = this.reducedMotion ? 0 : src.lightmapFrame;
    f.orb.worldRadius = pose ? pose.worldRadius : src.worldRadius;
    const e = src.energy * this.gate * (this.flags.orbHoverEnergy ? this.hoverPos : 1);
    f.orb.energy = e > 0 ? e : 0;

    f.ripple = this.rippleField;
    f.exposureBoost = this.exposureBoost();
    f.focus = this.focus;
    f.orbRetreat = this.retreat;
  }
}
