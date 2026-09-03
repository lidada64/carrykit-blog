/**
 * env-column.ts —— 环境列 LUT (W3)
 *
 * 水面看到的「环境」在这个项目里只有一个自由度:**反射方向的仰角**。
 * 水平面 + 无限远环境 → 方位角不参与,一根 1×N 的列就够了。
 *
 * ── 为什么是 LUT 而不是解析式 ────────────────────────────────────────────
 * W1 的 spike 里 envColumn() 是 `mix(shore, sky, smoothstep(0, edge, e))`。
 * 换成查表**不是为了好看,是为了接口**:W5 的灯球要往环境里注入一个光源
 * (它在水里的倒影就是环境列上多出来的一个亮斑),改一张 LUT 比改一串解析
 * 参数干净得多 —— 见 `EnvColumnParams.lights`,W5 只需要往数组里塞一项。
 *
 * ── 边界锐度 0.08:这是暗划线的成因,不是审美选择 ────────────────────────
 * 暗划线来自**波面斜率把反射方向扫过树线那条边**:波脊朝上一点 → 反射方向抬高
 * → 采到亮天空;波谷朝下一点 → 反射方向压低 → 采到暗树线。所以一条暗划线的
 * 存在与否,取决于「斜率能扫过的仰角区间」与「岸线→天空过渡带宽度」谁更大。
 *
 *   field.glsl.ts 的契约:|∇h| 的 p99 ≈ 0.12 → 反射方向仰角摆动 ≈ 2·0.12 = 0.24 rad。
 *
 * 第一版把过渡带铺到 0.44 rad(比摆动幅度还宽),结果每个像素采到的都是过渡带
 * 中段的同一个灰,**对比度被整片抹平**。实测要压到 **0.08 左右**(约为斜率摆动
 * 幅度的 1/3),才能让「扫过 / 没扫过」成为一个二元事件,暗划线才立得起来。
 * 再小就会让边界本身产生阶梯(LUT 只有 256 格,0.08 rad ≈ 17 格)。
 *
 * ── 编码约定 ────────────────────────────────────────────────────────────
 * 值域 [0, ENV_LUT_SCALE] 线性映射到 8-bit(地平线眩光要能超过 1.0,所以
 * SCALE = 2.0);域是**反射方向的 sin(仰角)**,不是仰角本身 —— 低仰角处
 * sin θ ≈ θ,眩光带与树线边界都在低仰角,精度正好花在该花的地方,而且
 * shader 端省掉一次 asin。
 */

/** LUT 宽度。1×256,R8。 */
export const ENV_LUT_SIZE = 256;
/** 8-bit 编码的值域上限;shader 端 uShadeEnvLutScale 乘回来。 */
export const ENV_LUT_SCALE = 2.0;
/** 域下界(sin 仰角)。波面法线最多把反射方向压到 −0.2 左右。 */
export const ENV_LUT_MIN = -0.2;
/** 域上界(sin 仰角)。 */
export const ENV_LUT_MAX = 1.0;

/** 注入到环境列上的一个光源(W5 的灯球 / 月亮的软晕都走这里)。 */
export interface EnvLight {
  /** 中心仰角的 sin 值 */
  sinElev: number;
  /** 高斯半宽(sin 仰角单位) */
  width: number;
  /** 峰值亮度(叠加在底色上) */
  gain: number;
}

export interface EnvColumnParams {
  /** 岸线 / 树线暗部亮度 */
  shore: number;
  /** 岸线以下(远岸阴影、对岸山体)的亮度,一般 ≤ shore */
  below: number;
  /** 天顶亮度 */
  sky: number;
  /** 紧贴地平线上方的天空亮度。与 sky 之间按 sin 仰角线性过渡 */
  skyHorizon: number;
  /** 岸线→天空的边界所在仰角(sin) */
  horizon: number;
  /** 边界锐度:smoothstep 全宽(sin 仰角)。见文件头,实测 0.08 左右 */
  edge: number;
  /** 地平线眩光带峰值(叠加) */
  glowGain: number;
  /** 眩光带高斯半宽(sin 仰角) */
  glowWidth: number;
  /** 眩光带中心仰角(sin),一般略高于 horizon */
  glowElev: number;
  /** 注入的光源。W5 的灯球从这里进来,不用改任何解析式 */
  lights: EnvLight[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 环境列的解析定义。**这是唯一的真相来源**:LUT 由它采样出来,
 * shader 端只查表不重算,所以改这里就等于改所有 preset 的环境。
 */
export function envColumnValue(sinElev: number, p: EnvColumnParams): number {
  // ① 岸线暗部 → 天空:一条锐边。暗划线的物理来源。
  const half = 0.5 * p.edge;
  const dark = sinElev < p.horizon ? p.below + (p.shore - p.below) * smoothstep(p.horizon - 0.35, p.horizon, sinElev) : p.shore;
  // ② 天空自身的竖直渐变:地平线附近亮、天顶暗(夜景尤其明显)
  const skyT = smoothstep(p.horizon, 0.85, sinElev);
  const skyL = p.skyHorizon + (p.sky - p.skyHorizon) * skyT;
  let v = dark + (skyL - dark) * smoothstep(p.horizon - half, p.horizon + half, sinElev);
  // ③ 地平线眩光带:天光在地平线附近的散射堆积,奥伯拉丁那张的横向强亮带
  if (p.glowGain > 0) {
    const d = (sinElev - p.glowElev) / Math.max(p.glowWidth, 1e-4);
    v += p.glowGain * Math.exp(-d * d);
  }
  // ④ 注入光源(W5 的灯球倒影 / 月亮)
  for (const l of p.lights) {
    const d = (sinElev - l.sinElev) / Math.max(l.width, 1e-4);
    v += l.gain * Math.exp(-d * d);
  }
  return Math.max(0, v);
}

/** 采样成 1×256 的 R8 数据,直接喂 gl.texImage2D(R8) 或写成灰度 PNG。 */
export function buildEnvColumnLut(p: EnvColumnParams, size: number = ENV_LUT_SIZE): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const e = ENV_LUT_MIN + ((ENV_LUT_MAX - ENV_LUT_MIN) * i) / (size - 1);
    const v = envColumnValue(e, p) / ENV_LUT_SCALE;
    out[i] = Math.round(clamp(v, 0, 1) * 255);
  }
  return out;
}

/**
 * 三个 preset 的环境列。
 *
 * mid/near 是白天中景/近景:亮天空 + 暗树线,edge 0.08。
 * night 是奥伯拉丁那张:天空整体压暗到 0.30(**不能压到接近 0**,否则 1-bit
 * 抖动出来是纯黑一片、band 0~6 全丢),地平线眩光带 +0.55 把对比度峰钉在
 * 地平线那一带;树线更暗(0.02),让月光路径的亮点有东西可衬。
 */
export const ENV_PRESETS: Record<"mid" | "near" | "night", EnvColumnParams> = {
  mid: {
    shore: 0.10,
    below: 0.02,
    sky: 0.92,
    skyHorizon: 0.66,
    horizon: 0.33,
    edge: 0.08,
    glowGain: 0.0,
    glowWidth: 0.05,
    glowElev: 0.03,
    lights: [],
  },
  near: {
    shore: 0.10,
    below: 0.02,
    sky: 0.95,
    skyHorizon: 0.66,
    horizon: 0.36,
    edge: 0.08,
    glowGain: 0.0,
    glowWidth: 0.06,
    glowElev: 0.04,
    lights: [],
  },
  night: {
    shore: 0.02,
    below: 0.0,
    sky: 0.3,
    skyHorizon: 0.5,
    horizon: 0.006,
    edge: 0.05,
    glowGain: 0.55,
    glowWidth: 0.035,
    glowElev: 0.02,
    lights: [],
  },
};
