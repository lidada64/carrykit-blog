/**
 * shade.glsl.ts —— W3 着色与对比度带
 *
 * 只管**亮度分布**:菲涅耳分层 + 环境列查表 + 亚像素粗糙度驱动的宽高光。
 * 不碰波形(W2 的 `field.glsl.ts`),不碰抖动(W4 的)。
 *
 * 契约:
 *  · uniform 一律 `uShade` 前缀,函数一律 `water` 前缀。
 *  · 入口两个:
 *      float waterShadeSurface(vec3 nField, vec3 rd, float sigma2, vec2 p)  // 水面像素
 *      float waterShadeSky(vec3 rd)                                 // 地平线以上
 *      float waterTonemap(float lum)                                // 曝光/对比度
 *  · 吃 field.glsl.ts 的 `waterNormalRough` 输出(N 与 sigma2)与
 *    `waterSurfacePoint` 输出的 rd 与 p。
 *  · **W5 起依赖 light.glsl.ts**(拼装顺序 FIELD + LIGHT + SHADE):
 *    `waterOrbIrradiance` / `waterOrbLightDir` / `waterOrbSpecular`。
 *    第四个参数 `p` 就是为它们加的 —— 灯球照度是位置相关的。
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

/* —— 天空一侧的地平线辉光(只作用于地平线以上的像素)——
 * 奥伯拉丁那条地平线:亮核只有十几像素,往上却是**一大片逐渐溶解的网点**。
 * 想靠加宽环境列里的 glowWidth 做出这片溶解是走不通的 —— 水面在掠射角下
 * 反射到的正是地平线**上方**那一小段仰角,环境列一加宽,水面反射的环境亮度
 * 跟着整体抬高,前景平坦度从 0.08 直接崩到 0.54(实测 glowWidthUp=0.03 时
 * 总分 0.267)。上下不对称也救不了:两边采的是同一段仰角。
 *
 * 所以这一项**只加在天空像素上**,和 uShadeSkyGain 一样是构图旋钮不是物理量。
 * 真实大气里水面当然也会反射到这片辉光,但那点贡献在 1-bit 量化后看不见,
 * 而它对前景平坦度的破坏是致命的。 */
uniform float uShadeSkyGlowGain;   // 峰值(叠加在环境列之上)
uniform float uShadeSkyGlowWidth;  // 高斯半宽(sin 仰角)。0.03 ≈ 53 px @1080p/fov0.61

/* —— 地平线起伏 ——
 * 参考图的地平线亮带是**一段一段错开**的:边界不是一条直线,而是一串长短不一
 * 的水平台阶。我们的是刀切一样直,这就是「太死板」。
 *
 * 根因不在抖动,在几何:解析 LOD 到了地平线附近把**所有**波分量都淡掉了
 * (淡掉的能量只转进 σ²,而 σ² 只喂 Beckmann 高光,不参与环境列查表),
 * 于是远处水面是一个**数学上完美的平面**,反射出来的边界当然是直线。
 *
 * 这里给环境列的查表仰角加一个**只随方位角变化**的低频起伏,天空与水面两侧
 * 用同一个值 —— 相当于远处的长涌与地平线上的霾。幅度只有 ±0.003(≈5 px),
 * 所以只在**环境列梯度陡的地方**(就是地平线)看得出来,其余位置查表结果不变。
 * 这是「只扰动该扰动的那一处」,不是全局加噪。 */
uniform float uShadeHorizonJitter;      // 幅度(sin 仰角)。0 = 关闭
uniform float uShadeHorizonJitterScale; // 方位角上的频率(1/rad)。越大台阶越短

const float WATER_SHADE_PI = 3.14159265;

/* field.glsl.ts 的法线在「场坐标」(x, up, y_field) 里,而 rd 在相机世界系
 * (x, up, z) 里,两者第三轴反号 —— 逆投影里 p.y = -rd.z。差这一个符号的话
 * 掠射几何整套是镜像的(高光会跑到光源的反侧),所以在这里统一到相机系。 */
vec3 waterFieldToView(vec3 n){ return vec3(n.x, n.y, -n.z); }

/* 自带的一维值噪声。故意不复用 field.glsl.ts 的 waterVNoise —— 拼装顺序是
 * FIELD+SHADE,借来能编过,但那会让本模块单独测不了。 */
float waterShadeHash1(float x){ return fract(sin(x * 91.7) * 43758.5453); }
float waterShadeNoise1(float x){
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(waterShadeHash1(i), waterShadeHash1(i + 1.0), f);
}

/** 地平线起伏(sin 仰角的偏移)。天空与水面共用,保证两侧的台阶是对齐的。 */
float waterHorizonJitter(vec3 dir){
  if (uShadeHorizonJitter <= 0.0) return 0.0;
  float az = atan(dir.x, -dir.z) * uShadeHorizonJitterScale;
  /* 参考图的地平线不是平滑起伏,是**一段一段的水平台阶**:段内齐平,段与段之间
   * 突然错开。所以主项用 floor 后的哈希(段内恒定、边界突变),再叠一层更细的
   * 平滑噪声让段内不至于死平。只用平滑噪声会变成一条软趴趴的波浪线。 */
  float step = waterShadeHash1(floor(az));
  float fine = waterShadeNoise1(az * 3.7 + 5.1);
  float n = 0.62 * step + 0.38 * fine;
  return uShadeHorizonJitter * (n - 0.5) * 2.0;
}

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
 *
 * ── W5 修订:多了一个 vec2 p(场坐标)────────────────────────────────
 * 灯球的照度是**位置相关**的(光斑落在水面的某几处),而原签名只有法线和视线,
 * 拿不到"这个像素在水面的哪里"。所以加了 p —— 调用方本来就有它
 * (waterSurfacePoint 的输出),没有额外成本。
 *
 * 灯球分三路进这条链,**不在 tonemap 前后加一坨平的亮度**:
 *  · (1-F)·(body + BodyGain·E(p)) —— **光斑落点**:光束打进水体又散射出来的漫射池。
 *    它是漫射的,所以进 body;E(p) 是位置相关的,这就是要 p 的原因。
 *  · F·(env + spec + SpecGain·D_orb) —— **球在水里的像**被波面打散成的镜面光路,
 *    和月光路径同一个机制,出现在球的镜像方向上,**与光斑落点无关、不乘 E(p)**
 *    (为什么不乘见 light.glsl.ts 的 waterOrbSpecular)。
 *  · env 里还有一份:灯球倒影/光晕由 env-column.ts 的 lights 注入 LUT,这里不写代码。
 *
 * ── W10 修订:第四条通道是**乘法** ──────────────────────────────────────
 * waterOrbFocusDim(p) 乘在 body 上(不是加在 lum 上):
 *      lum = (1−F)·(body + BodyGain·E)·**dim** + F·(env + spec + SpecGain·D_orb)
 * mid 的前景 tonemap 输出算出来是 1.70、被 clamp 到 1 —— 往饱和白上加光是零
 * 收益,只有把没被照到的地方**压暗**才有对比。理由与四条约束见 light.glsl.ts。
 * uOrbFocus = 0 时它精确返回 1.0,整条链逐位不变。
 *
 * uOrbEnergy = 0 时 waterOrbIrradiance 精确返回 0.0,
 * uShadeBody + 0.0 与 env + spec + 0.0 在 IEEE 下逐位不变 ——
 * 这是 §5 那条"md5 逐字节相同"验收的落点。
 */
float waterShadeSurface(vec3 nField, vec3 rd, float sigma2, vec2 p){
  vec3 N = normalize(waterFieldToView(nField));
  vec3 V = -rd;
  float F = waterFresnel(dot(N, V));
  vec3  R = reflect(-V, N);
  float env  = waterEnvColumn(R.y + waterHorizonJitter(R));
  float spec = waterSpecular(N, V, waterLightDir(), sigma2);
  float orbBody = uOrbBodyGain * waterOrbIrradiance(p);
  float orbSpec = uOrbSpecGain * waterOrbSpecular(N, V, waterOrbLightDir(p), sigma2);
  /* W10 聚焦渐晕:**乘在 body 上**,不加在 lum 上。
   * 加在 lum 上会把这条式子摊平成 lum = 分层 + 一坨常数,菲涅耳分层立刻不再是
   * 对比度曲线的唯一来源(见上面 ①)——前景平坦度与对比度带会一起失效。
   * uOrbFocus = 0 时 waterOrbFocusDim 精确返回 1.0,x × 1.0 ≡ x,逐位不变。 */
  float body = (uShadeBody + orbBody) * waterOrbFocusDim(p);
  return (1.0 - F) * body + F * (env + spec + orbSpec);
}

/** 地平线以上:同一张环境列,按视线仰角查,再叠一层天空专属的地平线辉光。 */
float waterShadeSky(vec3 rd){
  float e = rd.y + waterHorizonJitter(rd);
  float v = waterEnvColumn(e) * uShadeSkyGain;
  if (uShadeSkyGlowGain > 0.0){
    float d = e / max(uShadeSkyGlowWidth, 1e-4);
    v += uShadeSkyGlowGain * exp(-d * d);
  }
  return v;
}

/** 曝光 / 对比度。支点可调:夜景在 0.5 上做对比度会把暗天空顶到中灰(W1 病灶)。 */
float waterTonemap(float lum){
  return clamp((lum - uShadePivot) * uShadeContrast + uShadePivot + uShadeExposure, 0.0, 1.0);
}
`;
