/**
 * contract.ts —— 水面模块之间唯一的共享文件 (W5 建立)
 *
 * 计划文档 §3 定义了 `WaterFrameState` 与 `OrbState`,但文件一直没建。这里按那份
 * 定义落地,并补上**实际算得下去所必需**的字段(每个都在下面写明为什么加)。
 *
 * ── 一条红线 ────────────────────────────────────────────────────────────
 * 这些字段全部由 **GSAP 时间线**(或演示驱动)在 rAF 里**写**,由 WebGL 层**读**。
 * 单向、零回读。**任何字段都不许来自 `getBoundingClientRect()` /
 * `offsetWidth` / `getComputedStyle()`** —— 那是强制回流,主页 8 拍的动效预算
 * (计划 §5:主线程 JS <2ms、Layout/Repaint = 0)一帧都经不起。
 * 球心位置从时间线的插值量直接算,不问 DOM 要。
 *
 * ── uniform 命名 ────────────────────────────────────────────────────────
 * W2 → uField*　W3 → uShade*　W4 → uDither*　**W5 → uOrb***　W6 → uRipple*
 *
 * ── 法线量级约定 ────────────────────────────────────────────────────────
 * `|∇h|` 的 p99 ≈ 0.12(field.glsl.ts 与 shade.glsl.ts 都按这个量级对齐)。
 */

/** 灯球每帧的状态。**唯一**从 DOM/GSAP 侧流向 WebGL 侧的结构。 */
export interface OrbState {
  /**
   * 球心的 NDC 坐标,x/y ∈ [-1, 1],y 向上(与 `gl_FragCoord` 归一后一致)。
   * **从 GSAP 时间线直接读**:球的 transform 是时间线插出来的,同一个数就是球心,
   * 不需要也不许 `getBoundingClientRect()`。
   */
  screen: [number, number];
  /** 球在屏幕上的半径,以 NDC 的**纵向**半高为单位(1.0 = 半个屏幕高)。 */
  radiusNdc: number;
  /**
   * 总闸门。入场淡入、退场淡出(HR-9 之后 800ms ease-out → 0)都走它。
   * **`energy === 0` 时水面必须没有任何残光** —— 不是「差不多看不见」,
   * 是与灯球未接入时**逐字节相同**(见 docs/water-orb-coupling.md §5 的回归测试)。
   *
   * **W7 把上界从 1.0 放宽到 1.45**(docs/water-interaction-spec.md §3.2):
   * 「指针悬停灯球 → energy 1.0 → 1.45」这条耦合要求它能超过 1。
   * 安全性来自 `light.glsl.ts` —— 三条出口全是 `uOrbEnergy * (...)` 的**线性**
   * 乘子,没有任何地方假设它 ≤1;而下界那条「0 必须精确是 0」一点没动。
   * 静息态仍是 1.0,所以三个 preset 的黄金帧一位不变。
   */
  energy: number;
  /** 0..1,与 `ball-loop` 的帧号同相(0 = 循环首帧)。 */
  spinPhase: number;
  /** `= Math.floor(spinPhase * 120)`,路线 B(`ball-waterlight` 序列)用。 */
  lightmapFrame: number;
  /**
   * **计划 §3 之外新增。** 球的世界半径(米)。
   *
   * 为什么必须有:`screen` + `radiusNdc` 只给出了球在**视锥里的方向与张角**,
   * 而灯球照度要与 y=0 的水面求交,必须知道球心到相机的**真实距离**。
   * 距离由 `d = worldRadius / sin(atan(radiusNdc · tan(fovY/2)))` 反解出来 ——
   * 少了 worldRadius 这一步就无解。
   *
   * 放在 per-frame 的 OrbState 而不是场景常量里,是因为 HR-8 的「缩小 / 咬合」
   * 是 CSS scale:屏幕半径在变。到底读成「球在远离」(worldRadius 不变)还是
   * 「球在原地变小」(worldRadius 跟着变),该由发布器决定 —— 两种都表达得了。
   */
  worldRadius: number;
}

/** 涟漪场(W6 产出)。W5 不使用,先留下形状,W6 落地时填。 */
export interface RippleField {
  tex: WebGLTexture;
  /** 纹理覆盖的世界区域左下角(场坐标,米) */
  worldMin: [number, number];
  /** 覆盖边长(米) */
  worldSize: number;
}

/** 一帧水面的全部输入。W8 的 `water-scene.tsx` 每帧组装一个。 */
export interface WaterFrameState {
  /** 秒。reduced-motion 下恒为 8.0(定格) */
  time: number;
  /** 相机离水面高度(米):近景 0.35 / 中景 1.6 / 夜景 4.0 */
  camHeight: number;
  /** 俯角(弧度)。负值 = 抬头(夜景 -0.1413) */
  camPitch: number;
  /**
   * **计划 §3 之外新增。** 垂直视场角(弧度)。
   * 逆投影(`waterSurfacePoint`)与灯球的 NDC→世界换算都要它,而 `horizonY`
   * 只是它与 camPitch 的**派生量**,反推会丢符号。三个 preset:0.553/0.61/0.61。
   */
  fovY: number;
  /**
   * 地平线的 NDC y。**派生量**,= `tan(camPitch) / tan(fovY/2)`;
   * 近景 preset 算出来是 1.234(在画面外)。留在结构里是给编排层做构图判断用的,
   * 着色器不吃它。
   */
  horizonY: number;
  wind: { dirRad: number; speed: number };
  orb: OrbState;
  /** W6 未落地时为 null —— 消费方必须能在 null 下正常渲染。 */
  ripple: RippleField | null;
  /**
   * **计划 §3 之外新增(W7)。** 点击落水时的短暂曝光提升,**加**在
   * preset 的 `uShadeExposure` 上(不是倍率)。60 ms attack / 1.8 s decay,
   * 曲线在 `water-director.ts` 的 `exposureBoost()`。
   *
   * 为什么必须有:耦合矩阵「点击水面 → 大冲击 + 短暂曝光提升」的后半句在
   * `WaterFrameState` 里没有任何落点 —— 涟漪只改高度场,改不了曝光。
   * 做成**可选**字段是为了让 W5/W6 已有的组装点(黄金帧、预览台)不用改签名;
   * `undefined` 与 `0` 语义相同,消费方 `?? 0` 即可。
   */
  exposureBoost?: number;
  /**
   * **计划 §3 之外新增(W11b)。** 退场时光池的后退量 0..1 —— 0 = 池子在原位,
   * 1 = 池心已沿视线退到地平线附近、半径缩到 35%。写进 `uOrbPoolRetreat`。
   *
   * 为什么不是 energy 的派生量:退场那 800 ms 里 energy 走 `(1−u)²`(半程只剩
   * 25%),后退走 `1−(1−u)²`(半程已走 75%)—— **后退必须跑在变暗前面**,
   * 否则池子还没挪就黑了。两条曲线互补但不是同一条,所以各占一个字段。
   *
   * 同样做成**可选**:W5~W10 已有的组装点不用改签名,消费方 `?? 0` 即可。
   */
  orbRetreat?: number;
  /**
   * **计划 §3 之外新增(W10)。** 聚焦态的闸门 0..1 —— 0 = 展示态(A),
   * 1 = 聚焦态(B),中间是过渡。写进 `uOrbFocus`。
   *
   * **由页面显式调用驱动**(`WaterDirector.setFocus()`),不绑 energy、
   * 不绑滚动、不绑 IntersectionObserver:聚焦是**叙事**决定的,不是
   * 视口位置决定的。energy 与它互不统属 —— energy 管往水里加多少光,
   * focus 管没被照到的地方压多暗(见 `light.glsl.ts` 的第四条通道)。
   *
   * 与 `exposureBoost` 一样做成**可选**:W5/W6 已有的组装点(黄金帧、
   * 预览台)不用改签名,`undefined` 与 `0` 语义相同,消费方 `?? 0` 即可。
   */
  focus?: number;
}

/**
 * 灯球照度通道的**场景常量**(不随帧变)。与 OrbState 分开,因为这些值一旦定下
 * 就必须与 Blender 那边的 `ball-waterlight`(docs/blender-assets.md B-4)对齐 ——
 * 改它等于要重渲资产,而 OrbState 每帧都在变。
 */
export interface OrbLightConfig {
  /** 镜片数。**必须与 B-4 渲染时球上的镜片数一致**,否则 A/B 切换会跳变 */
  facetCount: number;
  /** uniform 数组能装下的光斑数(常数上界,shader 里的循环按它展开) */
  maxSpots: number;
  /** 主光方向的仰角(弧度)。**必须与 B-4 一致** */
  mainLightElev: number;
  /** 主光方向的方位角(弧度),0 = 从球的正后方(+y_field)打来。**必须与 B-4 一致** */
  mainLightAz: number;
  /**
   * 光斑的角半径 = 镜片尺寸 / 球半径(无量纲)。光斑世界半径 = 它 × 光程。
   * 0.12 ⇒ 镜片边长约 0.12R,球面上 64 片时镜片实际边长 ≈ 0.44R,
   * 这里取小是因为镜片本身还有曲率、光锥比几何尺寸窄。
   */
  spotSpread: number;
  /** 光斑强度的总增益(1/d² 归一之后) */
  intensity: number;
  /** 波幅通道的作用半径倍率:相对于所有光斑的 RMS 展布 */
  patchRadiusScale: number;
  /**
   * 注入环境列那一项的峰值增益(energy=1 时)。灯球在水里的倒影 + 天空里的光晕
   * 都是它 —— 见 `env-column.ts` 的 `EnvColumnParams.lights`。
   */
  envGain: number;
}

/**
 * `uOrbSpots[]` 的长度,也是 shader 里那个循环的**常数上界**。
 *
 * 定在 contract.ts 而不是 light.glsl.ts / orb-light.ts,是因为 GLSL 的数组长度与
 * CPU 端打包的 Float32Array 长度必须**同一个数**,分开写迟早会漂。
 * 24:64 片镜子里同时既被主光照到、反射又落在水面上的通常是 12~18 片,
 * 24 留了余量;再大只是白跑循环(未用的槽位强度写 0)。
 */
export const ORB_MAX_SPOTS = 24;

/** 一个光斑。打包进 `uOrbSpots[]` 的 vec4:(x, y, 1/半径, 强度)。 */
export interface OrbSpot {
  /** 光斑中心,**场坐标**(与 field.glsl.ts 的 `p` 同一个系,米) */
  center: [number, number];
  /** 世界半径(米) */
  radius: number;
  /** 峰值强度(已含 1/d² 与 cos 因子,未含 energy) */
  intensity: number;
}

/** 发布器算好、直接写进 uniform 的一帧灯球数据。 */
export interface OrbUniforms {
  /** `uOrbSpots[]` 的扁平数组,长度 = maxSpots × 4 */
  spots: Float32Array;
  /** 球心的场坐标 + 高度:(x, 离水面高度, y_field) */
  center: [number, number, number];
  /** 波幅斑块中心(场坐标)与半径(米) */
  patchCenter: [number, number];
  patchRadius: number;
  /** 球在水面处张开的立体角(sr)= πR²/d²。Beckmann 必须乘它,见 shade.glsl.ts ② */
  omega: number;
  /** 实际有效的光斑数(诊断用;shader 的循环仍是常数上界) */
  activeSpots: number;
  /** 注入环境列的那一项(灯球在水里的倒影 + 天空里的光晕)。energy=0 时为 null */
  envLight: { sinElev: number; width: number; gain: number } | null;
}
