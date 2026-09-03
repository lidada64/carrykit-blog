/**
 * shade.glsl.ts —— W3 着色与对比度带
 *
 * 只管**亮度分布**:菲涅耳分层 + 环境列查表 + 亚像素粗糙度驱动的宽高光。
 * 不碰波形(W2 的 `field.glsl.ts`),不碰抖动(W4 的)。
 *
 * 契约:
 *  · uniform 一律 `uShade` 前缀,函数一律 `water` 前缀。
 *  · 入口两个:
 *      float waterShadeSurface(vec3 nField, vec3 rd, float sigma2)  // 水面像素
 *      float waterShadeSky(vec3 rd)                                 // 地平线以上
 *      float waterTonemap(float lum)                                // 曝光/对比度
 *  · 吃 field.glsl.ts 的 `waterNormalRough` 输出(N 与 sigma2)与
 *    `waterSurfacePoint` 输出的 rd,不需要别的输入。
 *
 * ── 三条不可改的物理 ────────────────────────────────────────────────────
 *
 * ① **菲涅耳分层是单峰对比度曲线的唯一来源。**
 *      lum = (1-F)·body + F·(env + spec),F0 = 0.02
 *    前景视角陡 → F≈0.03 → 只剩平坦水体色 → `foregroundFlatness` 自己就出来了;
 *    远处掠射 → F→1 → 环境列的树线/天空边界被波面斜率来回扫过 → 暗划线。
 *    **不要用手调 mask 去伪造这条曲线**:伪造出来的换个 preset 就崩(近景没有
 *    地平线、夜景水面只占画面下 27%,同一个 mask 不可能同时对)。
 *
 * ② **Beckmann 必须乘光源立体角 uShadeLightOmega。**
 *    D 是**微面法线的概率密度**,在立体角上积分为 1;要得到辐射亮度必须乘光源
 *    张开的立体角(月亮 ≈6.8e-5 sr)。W1 漏了这一项,小 σ² 处 D 峰值上万,
 *    近场直接烧成全白。
 *
 * ③ **σ² 来自 LOD 淡掉的那部分波,不是手填的粗糙度。**
 *    近处 σ²→0 → 高光叶片极窄 → 只有少数像素法线对得上 → **碎成颗粒**;
 *    远处 σ² 大 → 叶片宽 → 相邻像素都亮一点 → **并成一条宽带**。
 *    月光路径的形态就是这一条给的,不需要任何额外机制。
 *    σ² 需要一个下限 `uShadeSigmaFloor`:一是防 exp/除零,二是真实水面永远
 *    有采样不到的毛细涟漪,下限 ~2e-4(rms 斜率 0.014)对应很平静的水。
 */
export const SRC = `
// —— 环境列 LUT(env-column.ts 生成,1×256 R8)——
uniform sampler2D uShadeEnvLut;
uniform vec2  uShadeEnvLutSize;   // 由渲染台按纹理尺寸写入
uniform float uShadeEnvLutScale;  // 8-bit 解码上限(env-column.ts 的 ENV_LUT_SCALE,2.0)
uniform float uShadeEnvLutMin;    // 域下界 sin(仰角),−0.2
uniform float uShadeEnvLutMax;    // 域上界 sin(仰角),1.0

// —— 分层 ——
uniform float uShadeBody;         // 水体亮度(透射侧;前景看到的就是它)
uniform float uShadeEnvGain;      // 环境列整体增益(不改 LUT 形状,只改强度)

// —— 高光 ——
uniform float uShadeSpecGain;     // 镜面增益(光源亮度 / 显示尺度)
uniform float uShadeLightOmega;   // 光源立体角(sr)。月亮 6.8e-5。**不许省**
uniform float uShadeLightElev;    // 光源仰角(弧度)
uniform float uShadeLightAz;      // 光源方位角(弧度)。0 = 正前方 → 光路竖直居中
uniform float uShadeSigmaFloor;   // σ² 下限
uniform float uShadeSpecClip;     // 高光饱和上限(避免单像素冲到 1e3 影响 tonemap)

// —— tonemap ——
uniform float uShadeExposure;
uniform float uShadeContrast;
uniform float uShadePivot;        // 对比度支点。夜景要压低(天空别被顶到中灰)
uniform float uShadeSkyGain;      // 地平线以上像素的额外增益(构图用,水面不受影响)

const float WATER_SHADE_PI = 3.14159265;

/* field.glsl.ts 的法线在「场坐标」(x, up, y_field) 里,而 rd 在相机世界系
 * (x, up, z) 里,两者第三轴反号 —— 逆投影里 p.y = -rd.z。差这一个符号的话
 * 掠射几何整套是镜像的(高光会跑到光源的反侧),所以在这里统一到相机系。 */
vec3 waterFieldToView(vec3 n){ return vec3(n.x, n.y, -n.z); }

/** 光源方向(相机世界系)。az=0 → 正前方(-z),月光路径竖直穿过画面中轴。 */
vec3 waterLightDir(){
  float ce = cos(uShadeLightElev);
  return vec3(ce * sin(uShadeLightAz), sin(uShadeLightElev), -ce * cos(uShadeLightAz));
}

/**
 * 环境列查表。域是**反射方向的 sin(仰角)**。
 * 手写线性插值:渲染台把 LUT 绑成 NEAREST,直接 texture() 会把 0.08 rad 的
 * 树线边界切成 17 级台阶 —— 而这条边界正是暗划线的成因,阶梯会被 1-bit 抖动
 * 放大成横向色带。两次 texelFetch + mix 比换采样器状态干净。
 */
float waterEnvColumn(float sinElev){
  float n = max(uShadeEnvLutSize.x, 2.0);
  float u = (sinElev - uShadeEnvLutMin) / max(uShadeEnvLutMax - uShadeEnvLutMin, 1e-6);
  u = clamp(u, 0.0, 1.0) * (n - 1.0);
  float i0 = floor(u);
  float f  = u - i0;
  int   a  = int(i0);
  int   b  = int(min(i0 + 1.0, n - 1.0));
  float va = texelFetch(uShadeEnvLut, ivec2(a, 0), 0).r;
  float vb = texelFetch(uShadeEnvLut, ivec2(b, 0), 0).r;
  return mix(va, vb, f) * uShadeEnvLutScale * uShadeEnvGain;
}

/**
 * Beckmann 微面高光。σ² 是**斜率方差**(field.glsl.ts 累加的正是 Σ½(ak)²),
 * Beckmann 的 m² 就是斜率均方,直接吃,不要再开根号。
 */
float waterSpecular(vec3 N, vec3 V, vec3 L, float sigma2){
  float ndl = dot(N, L);
  if (ndl <= 0.0) return 0.0;
  vec3  H  = normalize(L + V);
  float ct = clamp(dot(N, H), 1e-3, 1.0);
  float s2 = max(sigma2, uShadeSigmaFloor);
  float c2 = ct * ct;
  float tan2 = (1.0 - c2) / c2;
  float D = exp(-tan2 / s2) / (WATER_SHADE_PI * s2 * c2 * c2);
  return min(uShadeSpecGain * D * uShadeLightOmega * ndl, uShadeSpecClip);
}

/** 菲涅耳(Schlick),F0 = 0.02 —— 水的折射率 1.33 给出的值,不许调。 */
float waterFresnel(float ndv){
  float m = 1.0 - clamp(ndv, 0.0, 1.0);
  float m2 = m * m;
  return 0.02 + 0.98 * (m2 * m2 * m);
}

/**
 * 水面像素的亮度。nField 直接来自 waterNormalRough(场坐标),rd 来自
 * waterSurfacePoint。返回的是 tonemap **之前**的线性亮度。
 */
float waterShadeSurface(vec3 nField, vec3 rd, float sigma2){
  vec3 N = normalize(waterFieldToView(nField));
  vec3 V = -rd;
  float F = waterFresnel(dot(N, V));
  vec3  R = reflect(-V, N);
  float env  = waterEnvColumn(R.y);
  float spec = waterSpecular(N, V, waterLightDir(), sigma2);
  return (1.0 - F) * uShadeBody + F * (env + spec);
}

/** 地平线以上:同一张环境列,按视线仰角查。夜景的地平线眩光带由此而来。 */
float waterShadeSky(vec3 rd){
  return waterEnvColumn(rd.y) * uShadeSkyGain;
}

/** 曝光 / 对比度。支点可调:夜景在 0.5 上做对比度会把暗天空顶到中灰(W1 病灶)。 */
float waterTonemap(float lum){
  return clamp((lum - uShadePivot) * uShadeContrast + uShadePivot + uShadeExposure, 0.0, 1.0);
}
`;
