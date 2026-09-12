/**
 * field.glsl.ts —— W2 透视水面场
 *
 * 从 `spike-a.glsl.ts` 拆出来的**波场层**:逆投影 + 各向异性重力-毛细波 +
 * 解析 LOD + 亚像素粗糙度 σ²。只管波纹的形状与密度,不管颜色、不管抖动。
 *
 * 契约(计划 §3):
 *  · uniform 一律 `uField` 前缀,函数一律 `water` 前缀 —— 五个模块拼装时 grep 不撞车。
 *  · 对外三个入口:
 *      bool  waterSurfacePoint(vec2 ndc, float aspect, out vec2 p, out vec3 rd)
 *      float waterHeight(vec2 p, float t)
 *      void  waterNormalRough(vec2 p, float t, float footprint, out vec3 N, out float sigma2)
 *  · `|∇h|` 的 p99 ≈ 0.12 —— W3 的桩法线按这个量级对齐,不要改。
 *
 * 唯一的例外是 `orbPatch()`:它是 **W5 的** 函数,定义在 `light.glsl.ts`,
 * 这里只留前置声明。`waterPatchAmp` 一个字都没动。
 *
 * **W6 的 `waterRipple()` 走的是另一条路**:RIPPLE 段拼在 FIELD **之前**,
 * 所以这里既不需要前置声明,也能直接用它的 `uRippleAmp` 写关闭分支。
 * 为什么不照 orbPatch 那样前向声明,见 `ripple.glsl.ts` 文件头。
 *
 * ── W2 相对 spike-a 的三处改动(「不呆板」三件套,全部在波幅上做,不碰亮度)──────
 *
 *  ① 风阵斑块 `waterPatchAmp` —— 暗纹成片地强弱,一块密得发黑、旁边一块近镜面。
 *     **必须调波幅不调亮度**:波幅低 → 斜率小 → 反射方向跨不过环境列的岸线边界 →
 *     自己就变亮变平。这条链是 W3 那条单峰对比度曲线的物理来源,直接调亮度会把它打断。
 *  ② 长尾振幅权重 `waterTailWeight` —— 24 个分量的振幅乘一个重尾随机权重,
 *     少数分量显著更强 → 长横划与碎点并存,而不是长度整齐划一。
 *  ③ 局部方向摆动 `waterWander` —— 波脊不全平行,隔 ~2m 缓慢转 ±uFieldWander 弧度。
 *     摆动的**空间频率**必须低(uFieldWanderScale ≤ 0.3),否则相干度直接掉下 0.85。
 *
 * 三件套各自的关闭方式(用于「拆模块没拆坏」的对照跑分):
 *     ① uFieldPatchMin = uFieldPatchMax = 1.0
 *     ② uFieldTail = 0.0
 *     ③ uFieldWander = 0.0
 * 三个都关时(且 uFieldSpectralSlope = 0.9),本模块与 spike-a 的波场逐字等价。
 */
export const SRC = `
// —— 相机 / 逆投影 ——
uniform float uFieldCamHeight;   // 相机离水面高度(米)
uniform float uFieldCamPitch;    // 俯角(弧度)
uniform float uFieldFovY;        // 垂直视场角(弧度)

// —— 波场 ——
uniform float uFieldWindDir;     // 风向(弧度)。注意:0 会让波脊沿 z 排列,在屏幕上是
                                 // 向灭点收敛的**竖线**;要横纹必须 π/2。W1 踩过。
uniform float uFieldWindSpeed;   // 0..1,只影响相速度
uniform float uFieldSpread;      // 方向散布半角(弧度),越小越各向异性
uniform float uFieldAmp;         // 振幅总缩放
uniform float uFieldSpectralSlope; // 振幅谱斜率 n:a ∝ (lambda/0.1)^n。
                                 // 0.9 = W1/W2 沿用的默认(长波主导,主导波长偏粗);
                                 // 调小 → 振幅推向短波,划线变细变密;0 = 各波长等幅。
                                 // 见 docs/water-reference-metrics.md §10:near 的
                                 // λ 偏粗 3× 就是这个常数写死导致的,preset 调参够不着。
uniform float uFieldWarp;        // 低频域扭曲强度(0 = 笔直波脊)
uniform float uFieldFetchLen;    // 风区长度(米):离近岸多远波才长起来。0 = 关闭
uniform float uFieldLodBias;     // LOD 淡出提前量:>1 更早淡出 → 远端更平

// —— ① 风阵斑块 ——
uniform float uFieldPatchScale;  // 斑块空间频率(1/m)。0.35 → 斑块横跨 2~5 m
uniform float uFieldPatchMin;    // 镜面区残留波幅(1.0 = 关闭斑块)
uniform float uFieldPatchMax;    // 风阵区波幅上限(>1 让强区更强,同时补回被压掉的平均波幅)
uniform float uFieldPatchEdge;   // 边界锐度(smoothstep 半宽),越小越「成片」
uniform float uFieldPatchBias;   // 风阵覆盖率的阈值。0.5 = 一半水面起风;调小 = 起风的更多
uniform float uFieldPatchDrift;  // 0 = 静态斑块;0.03 ≈ 20s 走一个斑块
uniform float uFieldOrbPatchGain;// 灯球光斑处的额外波幅增益(W5 接上 orbPatch 后生效)

// —— ② 长尾划线 ——
uniform float uFieldTail;        // 0 = 各分量等权;1 = 全量重尾权重

// —— ③ 局部方向摆动 ——
uniform float uFieldWander;      // 幅度(弧度),硬上限 0.15
uniform float uFieldWanderScale; // 空间频率(1/m),越小尺度越大

/* —— ④ 波脊断裂(短波脊)——
 * ①②③ 全开之后 mid 上部仍然是一片**贯穿全幅的平行横线**(像梳子)。
 * 根因:uFieldSpread=0.15 时 24 个分量几乎共向,干涉图案退化成只随 y 变化的
 * 一维函数 —— 波脊长度实际上是无限的。真实风浪的波脊只有几个波长长。
 *
 * 修法不能靠加大方向散布(那会一起打掉相干度与梯度角)。这里用一个
 * **各向异性包络**:沿波脊方向快变、跨波脊方向慢变,把每条横线切成
 * 随机长度的划,而完全不动波的方向。 */
uniform float uFieldChop;        // 0 = 关闭(长波脊,与 W2 等价);1 = 全量断裂
uniform float uFieldChopLen;     // 沿波脊方向的断裂尺度(米)。0.55 ≈ 半米一断
uniform float uFieldChopAniso;   // 跨波脊 / 沿波脊 的尺度比。
                                 // >1 断口会沿传播方向连成竖帘;<1 才是短波脊
uniform float uFieldChopMin;     // 断口处残留波幅(0 = 断得干净)
uniform float uFieldChopMax;     // 未断处波幅。**必须 >1**,理由同 uFieldPatchMax
uniform float uFieldChopEdge;    // 断口边界锐度(smoothstep 半宽)
uniform float uFieldChopBias;    // 存活阈值。0.5 = 一半波脊留下;调大 = 划更短更疏。
                                 // 实拍中景照里暗划的**空隙比划本身长**,所以要 >0.5

const float WATER_PI    = 3.14159265;
const float WATER_G     = 9.81;
const float WATER_SIGMA = 7.28e-5;   // 表面张力 / 密度,毛细项用
/* 分量数。6 个固定正弦会织出**周期性点阵**(看起来像布纹不像水),而相干度/游程/
 * 梯度角这些指标全都看不出周期性(W1 实测那种图能拿 0.97 分)。24 个由哈希决定
 * 波长/方向/相位的分量,干涉图案才是随机的。 */
const int   WATER_COMPONENTS = 24;
const float WATER_LAMBDA_MIN = 0.018;   // 1.8 cm
const float WATER_LAMBDA_MAX = 0.320;   // 32 cm

float waterHash11(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
float waterHash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float waterVNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(waterHash21(i),             waterHash21(i + vec2(1,0)), u.x),
             mix(waterHash21(i + vec2(0,1)), waterHash21(i + vec2(1,1)), u.x), u.y);
}

/* ── W5 的前置声明 ──────────────────────────────────────────────────────────
 * 用户的构想:灯球照到的地方水面既更亮、也更「活」。亮度走 W5 的照度通道,
 * **波幅**走这里。
 *
 * W5 已落地:定义在 light.glsl.ts,这里只留**前置声明**(GLSL ES 3.00 支持)。
 * 拼装顺序 HEAD + FIELD + **LIGHT** + SHADE + DITHER + TAIL —— LIGHT 在 FIELD
 * 之后,而 waterPatchAmp 在 FIELD 里就要调它,所以必须有这一行。
 * 反过来把 LIGHT 提到 FIELD 前面不行:LIGHT 用的是 FIELD 的世界坐标约定,
 * 而 SHADE 又要用 LIGHT 的照度 —— 一条链上只允许有一处前向声明,放最上游最省事。
 *
 * 不要因为它没有 water 前缀就改名——名字是跟 W5 对齐的。
 * uOrbEnergy = 0 时 light.glsl.ts 的实现**精确返回 0.0**,于是下面
 * amb + uFieldOrbPatchGain * 0.0 与灯球接入前逐位相同(见 §5 的 md5 回归)。 */
float orbPatch(vec2 p, float t);

/* ── ① 风阵斑块 ─────────────────────────────────────────────────────────────
 * smoothstep 是关键:留成平滑渐变就看不出「一块一块」,必须压成有边界的斑块。
 * uFieldPatchEdge 越小,过渡带越窄,越像真实风阵掠过水面的那条边。
 *
 * 注意这里返回的是**波幅倍率**,会同时缩放 h、grad 与 sigma2 —— 三者保持一致,
 * 才不会出现「波看着平了但高光还在闪」。
 *
 * 两个必须记住的实测数字(W2 扫参得到,别照抄任务书里的起手值):
 *  · **波幅 → 对比度几乎是个阈值,不是比例。** 暗划线来自波面斜率把反射方向扫过
 *    环境列的岸线边界;斜率不够就一次都扫不过去,画面直接变白。实测 mix(0.15, 1.0)
 *    的斑块把峰值带 RMS 从 50 打到 **0**(连续灰度下不足 1/255),不是打到六成。
 *    所以 uFieldPatchMax 必须 **>1**:强区要比"没有斑块时"更强,弱区才有降的余地。
 *  · waterVNoise 的分位数是 p05 0.15 / p50 0.50 / p95 0.85,以 0.5 为阈值只有约
 *    34% 的面积能被 smoothstep 顶到 1.0。要让大部分水面起风,阈值得压到 0.4 以下
 *    ——这就是 uFieldPatchBias 存在的理由。 */
float waterPatchAmp(vec2 p, float t){
  vec2 q = p * uFieldPatchScale;
  vec2 dr = vec2(t * uFieldPatchDrift, 0.0);
  float n = 0.62 * waterVNoise(q + dr)
          + 0.38 * waterVNoise(q * 2.7 + dr * 2.7 + 19.7);
  float amb = mix(uFieldPatchMin, uFieldPatchMax,
                  smoothstep(uFieldPatchBias - uFieldPatchEdge,
                             uFieldPatchBias + uFieldPatchEdge, n));
  return clamp(amb + uFieldOrbPatchGain * orbPatch(p, t), 0.0, 2.2);
}

/* ── ② 长尾振幅权重 ─────────────────────────────────────────────────────────
 * pow(u, -0.5) 在 (0,1] 上是重尾的:少数分量拿到 3× 权重,多数在 1× 附近。
 * 密集区里那几个强分量连成很长的横划,弱分量只在别处断成碎点。
 * 0.6 是归一系数:clamp(pow(u,-0.5),0.4,3) 的期望约 1.667,乘 0.6 让平均波幅不变
 * ——否则开启 ② 等于偷偷把 uFieldAmp 调大了 67%,对照实验就不干净。 */
float waterTailWeight(float fi){
  float w = clamp(pow(max(waterHash11(fi + 21.7), 1e-3), -0.5), 0.4, 3.0) * 0.6;
  return mix(1.0, w, uFieldTail);
}

/* ── ③ 局部方向摆动 ─────────────────────────────────────────────────────────
 * 空间频率必须低(尺度 ≥2m)。频率一高就等于把波脊揉碎,相干度崩。
 * 严格说 dir 随 p 变化会让 dot(dir,p)*k 的梯度多一项 ∇dir·p·k,这里忽略:
 * uFieldWander ≤0.15 且尺度 ≥2m,该项比主项小两个数量级。 */
float waterWander(vec2 p){
  if (uFieldWander <= 0.0) return 0.0;
  return uFieldWander * (waterVNoise(p * uFieldWanderScale + 77.3) - 0.5) * 2.0;
}

/* ── ④ 波脊断裂 ─────────────────────────────────────────────────────────────
 * 在**跟着风向转的坐标系**里采噪声:波沿 dir=(cos θ, sin θ) 传播,
 * 波脊则沿 (sin θ, −cos θ)。沿波脊那一轴除以小尺度(快变 → 划被切断),
 * 跨波脊那一轴除以更小的尺度 × aniso(<1,让相邻波脊的断口互相错开)。
 *
 * aniso 的取值是有物理意义的,不是随便调的:
 *  · aniso > 1 → 断口沿传播方向连成**竖帘**,在屏幕上是向灭点收敛的竖条,
 *    比原来的梳子还难看(和 W1 那个 uWindDir=0 的坑是同一类错误)
 *  · aniso ≈ 0.4~0.6 → 跨波脊 2~4 个波长就换一套断口,才是「短波脊」
 *
 * 返回的同样是**波幅倍率**,和 waterPatchAmp 相乘 —— 两层调制,一层管
 * 「哪片水面起风」(米级),一层管「每条波脊有多长」(分米级)。 */
float waterChopAmp(vec2 p){
  if (uFieldChop <= 0.0) return 1.0;
  float s = sin(uFieldWindDir), c = cos(uFieldWindDir);
  float along  = dot(p, vec2(s, -c));   // 沿波脊
  float across = dot(p, vec2(c,  s));   // 跨波脊(= 传播方向)
  float L = max(uFieldChopLen, 1e-3);
  vec2 q = vec2(along / L, across / max(L * uFieldChopAniso, 1e-3));
  float n = 0.62 * waterVNoise(q) + 0.38 * waterVNoise(q * 2.3 + 11.3);
  float e = smoothstep(uFieldChopBias - uFieldChopEdge, uFieldChopBias + uFieldChopEdge, n);
  return mix(1.0, mix(uFieldChopMin, uFieldChopMax, e), uFieldChop);
}

/**
 * 波场核心。返回高度,并输出斜率梯度与「被 LOD 淡掉的那部分」的斜率方差 sigma2。
 * footprint = 该像素在世界空间覆盖的尺度(米),由调用方用 fwidth 求出;
 * 传 0 表示不做 LOD(纯高度查询)。
 */
float waterWaveField(vec2 p, float t, float footprint, out vec2 grad, out float sigma2){
  /* 风区(fetch)衰减:近岸被挡风,波长起不来。实拍中景照片的分带 RMS 在 band5→6
   * 一带内掉了 10 倍——这种断崖不是菲涅耳能给出的(菲涅耳是平滑曲线),
   * 而是近岸那条真实存在的静水带。少了这一项,前景平坦度卡在 0.22 上不去。 */
  float fetch = uFieldFetchLen > 0.0 ? smoothstep(0.0, uFieldFetchLen, abs(p.y)) : 1.0;

  /* 低频域扭曲:只推弯波脊,不揉碎。扭曲噪声的**频率**比强度更要紧:第一版在
   * p*0.7(米级)上采样,只是把整片波场平移,波脊照样笔直;要打断成短划,
   * 必须在几个波长的尺度(~0.25m)上变化。 */
  vec2 wp = p + uFieldWarp * 0.012 * vec2(
      waterVNoise(p * 4.0 + vec2(t * 0.05, 0.0)) - 0.5,
      waterVNoise(p * 4.0 + vec2(0.0, t * 0.04) + 31.4) - 0.5);

  // 两层波幅调制:斑块管「哪片水面起风」(米级),断裂管「每条波脊多长」(分米级)
  float gust = waterPatchAmp(p, t) * waterChopAmp(p);   // 不能叫 patch —— GLSL ES 3.00 保留字
  float wander = waterWander(p);

  float h = 0.0;
  grad = vec2(0.0);
  sigma2 = 0.0;

  for (int i = 0; i < WATER_COMPONENTS; i++){
    float fi = float(i);
    // 波长在 [1.8cm, 32cm] 内对数均匀随机,方向在风向 ±uFieldSpread 内随机,相位随机。
    float lambda = WATER_LAMBDA_MIN * pow(WATER_LAMBDA_MAX / WATER_LAMBDA_MIN, waterHash11(fi + 1.7));
    float k = 2.0 * WATER_PI / lambda;
    // 重力-毛细色散:短波(<1.7cm)靠表面张力跑得更快,细浪与长浪不同步
    float omega = sqrt(WATER_G * k + WATER_SIGMA * k * k * k);
    float th = uFieldWindDir + uFieldSpread * (waterHash11(fi + 9.3) * 2.0 - 1.0) + wander;
    vec2 dir = vec2(cos(th), sin(th));
    // 振幅谱 a ∝ lambda^uFieldSpectralSlope,按分量数归一,再乘风区、斑块、长尾三个权重
    float a = 0.0042 * pow(lambda / 0.10, uFieldSpectralSlope) * (6.0 / float(WATER_COMPONENTS))
            * uFieldAmp * fetch * gust * waterTailWeight(fi);

    // 解析 LOD:一个波长内不足 4 px 时开始淡出,到 2 px(奈奎斯特)完全消失。
    // 淡掉的能量不丢,转成 sigma2 —— 这是远处「不糊成噪点又不丢反光」的关键。
    float w = 1.0;
    if (footprint > 0.0){
      float r = footprint / lambda * uFieldLodBias;
      w = 1.0 - smoothstep(0.25, 0.5, r);
      float slopeVar = 0.5 * (a * k) * (a * k);
      sigma2 += (1.0 - w) * slopeVar;
      if (w <= 0.001) continue;
    }

    float ph = dot(dir, wp) * k - omega * t * uFieldWindSpeed + waterHash11(fi + 4.1) * 6.2831853;
    h += w * a * sin(ph);
    grad += w * a * k * cos(ph) * dir;
  }

  /* ── ⑤ 涟漪(W6)────────────────────────────────────────────────────────
   * waterRipple 定义在 ripple.glsl.ts,拼装顺序里 RIPPLE 在 FIELD **之前**
   * (不是 orbPatch 那种前向声明 —— 理由见 ripple.glsl.ts 文件头:涟漪这条链
   * 没有环,而且 uRippleAmp 必须在这里之前声明,下面那个分支才写得出来)。
   *
   * 三条,每条都是有意的:
   *  · **加在 gust 之外**。gust = 斑块×断裂,调的是**波幅倍率**;涟漪是
   *    **加性高度**。石子砸进镜面般平静的水面照样有涟漪 —— 若相乘,
   *    uFieldPatchMin=0 的镜面区里涟漪会整片消失,而那恰恰是最该看见它的地方。
   *  · **用 p 不用 wp**。wp 是被低频域扭曲推过的坐标,那是波场自己的形状噪声;
   *    涟漪钉在真实世界坐标上,不该跟着扭。
   *  · **h 与 grad 同时加**。只加高度会出现"看得见涟漪但法线不动"——
   *    W3 之后所有对比度都来自法线扫过环境列,不动法线等于什么也没发生。
   *
   * 这个分支是 §4.1「涟漪关闭时逐字节回归」的落点:uRippleAmp = 0 时
   * 整段不进,h 与 grad 的求值序列与 W5 定稿**逐条指令相同**。
   * 写成 h += waterRipple(...).x 在 IEEE 下也是恒等的(x + 0.0 == x),
   * 但那要赌编译器不会因为循环后面多了指令而重排循环体 —— docs §11 坑 7
   * 之后这种赌不值得打。 */
  if (uRippleAmp > 0.0){
    vec3 rip = waterRipple(p, footprint);
    h += rip.x;
    grad += rip.yz;
  }
  return h;
}

/** 只要高度(涟漪耦合 / 调试用)。不做 LOD。 */
float waterHeight(vec2 p, float t){
  vec2 g; float s2;
  return waterWaveField(p, t, 0.0, g, s2);
}

/** 法线 + 亚像素粗糙度。W3 的 Beckmann 分布吃 sigma2。 */
void waterNormalRough(vec2 p, float t, float footprint, out vec3 N, out float sigma2){
  vec2 grad;
  waterWaveField(p, t, footprint, grad, sigma2);
  N = normalize(vec3(-grad.x, 1.0, -grad.y));
}

/**
 * 逆投影:屏幕 NDC → 水平面(y=0)世界坐标。
 * 绕 X 轴下俯 uFieldCamPitch:y' = y·cosφ + z·sinφ,z' = -y·sinφ + z·cosφ(前向 z=-1)。
 * 地平线落在 ndc.y = tan(pitch)/tan(fov/2) —— 三个 preset 就靠这条式子定构图。
 * 返回 false 表示该像素在地平线以上(天空),此时 p 未定义。
 */
bool waterSurfacePoint(vec2 ndc, float aspect, out vec2 p, out vec3 rd){
  float tanH = tan(uFieldFovY * 0.5);
  vec3 d = normalize(vec3(ndc.x * tanH * aspect, ndc.y * tanH, -1.0));
  float cp = cos(uFieldCamPitch), sp = sin(uFieldCamPitch);
  rd = normalize(vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp));
  if (rd.y >= -1e-4){ p = vec2(0.0); return false; }
  float tHit = uFieldCamHeight / (-rd.y);
  p = vec2(rd.x, -rd.z) * tHit;
  return true;
}
`;
