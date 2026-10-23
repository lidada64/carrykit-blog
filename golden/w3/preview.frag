#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2  uRes;
uniform float uTime;

// —— 涟漪场(W6)——
uniform sampler2D uRippleTex;      // RG16F,R = 当前高度(米)
uniform vec2  uRippleTexSize;      // (0,0) = 纹理没绑上 → 本模块所有出口返回 0
uniform vec2  uRippleWorldMin;     // 纹理覆盖的世界区域左下角(场坐标,米)
uniform float uRippleWorldSize;    // 覆盖边长(米)
uniform float uRippleAmp;          // 显示幅度。**0 = 关闭**(逐字节回归的闸门)
uniform float uRippleLodBias;      // 走样淡出:像素 footprint 跨过 bias 个纹素时开始淡
uniform float uRippleEdgeFade;     // 区域边界的淡出宽度(纹素)

/**
 * 水面 p 处的涟漪。返回 (高度, ∂h/∂x, ∂h/∂y),单位米 / 无量纲。
 *
 * ── 三件必须处理的事(任务书 §3.2)────────────────────────────────────────
 *
 * ① **走样**。纹理钉在世界空间,透视之后远处一个像素跨很多纹素;直接采样
 *    会闪成噪点(和波场那 24 个分量不做 LOD 时一模一样的病)。
 *    波场用的是"一个波长内不足 4px 就淡出";涟漪没有单一波长,能表达的
 *    最短结构就是纹素,所以判据换成 **footprint / Δx**:
 *    像素跨 uRippleLodBias 个纹素时开始淡,跨到 2× 时归零。
 *
 *    淡掉的能量**不进 σ²**,和波场那边的做法不同。理由:σ² 在 shade 里是
 *    Beckmann 叶片的宽度,即"这个像素内**稳态**微面元斜率的方差"。涟漪是
 *    瞬态的、空间局部的 —— 把一个正在传播的环的能量塞进 σ²,会让波前扫过的
 *    地方永久变粗糙,而它下一帧就走了。而且远处涟漪被 LOD 淡掉时,画面本来
 *    就该回到"没有涟漪"的样子,不是"多了一片更糊的高光"。
 *
 * ② **纹理边界**。区域外直接 return 0(不是 REPEAT —— 那会在旁边复制出
 *    幽灵涟漪;也不是纯 CLAMP —— 那会沿边界拖出一条直线)。区域内侧再按
 *    uRippleEdgeFade 个纹素平滑淡到 0,和求解 pass 的吸收层配合,
 *    让"涟漪走到区域边缘"这件事看不出来。
 *
 * ③ **与斑块 / 断裂的关系**:waterPatchAmp / waterChopAmp 返回的是
 *    **波幅倍率**,涟漪是**加性高度**,两者不相乘。
 *    选择:**涟漪不被斑块压制**。物理理由 —— 斑块表达的是"这片水面没起风",
 *    风浪起不来不代表石子砸不出涟漪;镜面般平静的水面上,一圈涟漪反而是
 *    最显眼的。工程理由 —— 若相乘,uFieldPatchMin=0 的镜面区里涟漪会整片消失,
 *    而那正是用户最想在预览台上点一下的地方。落点在 field.glsl.ts:
 *    涟漪加在 gust 之外、循环之后。
 *
 * 梯度用中心差分现算(4 次额外采样),不预计算进纹理的 BA 通道:
 * RG16F 已经够存两层高度,再存两层梯度就要 RGBA16F,带宽翻倍;
 * 而梯度只在**可见的水面像素**上需要,数量远小于 256²×每步。
 */
vec3 waterRipple(vec2 p, float footprint){
  if (uRippleAmp <= 0.0 || uRippleTexSize.x < 1.0) return vec3(0.0);

  vec2 uv = (p - uRippleWorldMin) / max(uRippleWorldSize, 1e-4);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);

  float dx = uRippleWorldSize / uRippleTexSize.x;   // 一个纹素的世界尺度(米)

  float fade = 1.0;
  if (footprint > 0.0){
    fade = 1.0 - smoothstep(1.0, 2.0, footprint / max(uRippleLodBias * dx, 1e-6));
  }
  // 区域边界:离最近边多少个纹素
  vec2  eT = min(uv, 1.0 - uv) * uRippleTexSize;
  fade *= smoothstep(0.0, max(uRippleEdgeFade, 1e-3), min(eT.x, eT.y));
  if (fade <= 0.0) return vec3(0.0);

  float o = 1.0 / uRippleTexSize.x;
  float h  = texture(uRippleTex, uv).r;
  float hl = texture(uRippleTex, uv - vec2(o, 0.0)).r;
  float hr = texture(uRippleTex, uv + vec2(o, 0.0)).r;
  float hd = texture(uRippleTex, uv - vec2(0.0, o)).r;
  float hu = texture(uRippleTex, uv + vec2(0.0, o)).r;
  vec2  g  = vec2(hr - hl, hu - hd) / (2.0 * dx);

  float w = uRippleAmp * fade;
  return vec3(h * w, g * w);
}

/** 任务书建议的一参签名。自己求 footprint,只给调试/独立调用用 ——
 *  水面主链路走两参版本:footprint 在 main 里已经用 fwidth 算过一次了,
 *  再算一次既浪费,又把导数指令挪进了非一致控制流(GLSL ES 未定义行为)。 */
vec3 waterRipple(vec2 p){
  return waterRipple(p, max(fwidth(p.x), fwidth(p.y)));
}

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

// —— 模式与总闸门 ——
uniform int   uOrbLightMode;    // 0 = A 程序化;1 = B 预渲染(纹理缺失时自动回落 A)
uniform float uOrbEnergy;       // 0..1 总闸门。**0 时本模块所有出口精确返回 0.0**

// —— 球的世界位姿(场坐标:x 右、y 上、z 远离相机,与 field.glsl.ts 的 p 同系)——
uniform vec3  uOrbCenter;       // (x, 离水面高度, y_field),单位米
uniform float uOrbRadius;       // 球世界半径(米)

/* —— 光斑数组(CPU 算好,见 orb-light.ts)——
 * xy = 光斑中心的场坐标(米);z = 1/半径(米⁻¹,预先取倒数省掉每像素一次除法);
 * w = 峰值强度(已含 cosθ 与 1/d²,**未含 energy**)。未用的槽位 w = 0。 */
uniform vec4  uOrbSpots[24];

// —— 三条通道各自的增益 ——
uniform float uOrbBodyGain;     // 进 (1-F)·body 的漫射池增益
uniform float uOrbSpecGain;     // 进 F·spec 的镜面闪增益
uniform float uOrbPatchGain;    // orbPatch 的输出幅度(再被 uFieldOrbPatchGain 加权)
uniform vec2  uOrbPatchCenter;  // 波幅斑块中心(场坐标)
uniform float uOrbPatchRadius;  // 波幅斑块半径(米)

/* —— ⑤ 主光池(W11a)——
 * 镜片斑之外的那份漫射光。**只有 night 开**(见 presets.ts 的 NIGHT_POOL)。 */
uniform float uOrbPoolGain;     // 主光池峰值照度(0 = 关,本模块出口精确返回 0.0)
uniform float uOrbPoolRadius;   // 池的横向世界半径(米)
uniform float uOrbPoolFlat;     // 平顶比例 0..1(<flat 的部分是 1.0)
uniform float uOrbPoolFar;      // 远侧(背离相机)沿视线拉长倍数
uniform float uOrbPoolNear;     // 近侧(朝向相机)拉长倍数
/* 退场后退(W11b)。0 = 池子在原位;1 = 池心已经沿视线退到地平线附近、半径缩到
 * WATER_ORB_RETREAT_MINR。**0 时逐位不变**:c × (1.0 + 0.0×K) ≡ c、
 * mix(1.0, m, 0.0) ≡ 1.0,IEEE 下乘 1.0 是恒等的(同 uOrbFocus / uOrbEnergy 那两条闸门)。
 * 由编排器行⑪驱动,不是旋钮 —— 见 water-director.ts。 */
uniform float uOrbPoolRetreat;

/* —— 镜面闪的 Beckmann 参数 ——
 * 本模块自带一份,不复用 shade.glsl.ts 的 waterSpecular():
 *  ① 拼装顺序上 LIGHT 在 SHADE 之前,借不到;
 *  ② 灯球和月亮是**两个不同的光源**,立体角与饱和上限本来就该各自一份;
 *  ③ 最要紧的一条 —— 动 waterSpecular() 的表达式会改变浮点求值顺序,
 *     energy=0 的逐字节回归(docs/water-orb-coupling.md §5)立刻挂掉。 */
uniform float uOrbOmega;        // 单片镜子在水面处张开的立体角(sr)
uniform float uOrbSigmaFloor;   // σ² 下限,同 uShadeSigmaFloor 的理由
uniform float uOrbSpecClip;     // 饱和上限

/* —— 模式 B:ball-waterlight 照度序列(sprite sheet)——
 * uOrbLightmapSize 由渲染台按纹理尺寸写入;**(0,0) = 纹理没绑上 → 回落模式 A**。 */
uniform sampler2D uOrbLightmap;
uniform vec2  uOrbLightmapSize;
uniform float uOrbLightmapFrame;  // = floor(spinPhase * 120)
uniform float uOrbLightmapCols;   // sprite sheet 的列数 / 行数
uniform float uOrbLightmapRows;
uniform vec4  uOrbLightmapRect;   // 照度图覆盖的场坐标矩形 (minX, minY, sizeX, sizeY)

/* ── W10 聚焦渐晕(mid 的 B 态)────────────────────────────────────────────
 * **为什么是"压暗"而不是"加亮"。** mid 前景的 tonemap 输出是
 * (0.62 − 0.48) × 8 + 0.48 + 0.10 = 1.70,**被 clamp 到 1**。头顶 70% 的余量
 * 全浪费,往饱和白上加光什么都不会发生 —— 这就是 W5 灯球在 mid 上"亮不起来"
 * 的算术根因(实测只改到 0.12% 的像素)。所以 B 态用**渐晕**:把没有光照的
 * 地方压暗,用**对比**而不是加法。
 *
 * 顺带一个好处:foregroundFlatness 是**减掉 41px 盒模糊之后**量的,平滑渐晕
 * 属于大尺度亮度,那一步会把它减掉;全局压 uShadeBody 则是给整片撒网点,
 * RMS 必涨(实测 body 0.62→0.52 时前景平坦度 0.00→0.166、覆盖率 16.9→44.2)。
 *
 * **出口 waterOrbFocusDim 乘在 body 上,不许加在 lum 上。** 加在 lum 上会
 * 打断 shade.glsl.ts 那条 lum = (1−F)·body + F·(env + spec) 的分层链,
 * 前景平坦度与对比度带会一起失效 —— 这是这个项目从 W2 起反复踩的同一条。
 *
 * 与 uOrbEnergy **互不统属**:energy 管"灯球往水里打多少光"(加法通道),
 * focus 管"没被照到的地方压多暗"(乘法通道)。energy=0 时照样可以聚焦
 * (画面只剩渐晕),focus=0 时照样可以照亮。两个闸门各自独立地精确归零。 */
uniform float uOrbFocus;        // 0..1 总闸门。**0 时 waterOrbFocusDim 精确返回 1.0**
uniform vec2  uOrbGround;       // 球在水面的落点(场坐标,米)。CPU 侧 = uOrbCenter.xz
uniform float uOrbPoolR;        // 光池半径(米)。球在 6.85 m 外、高 0.75 m 时 2.6
uniform float uOrbAmbient;      // 池外残留**系数**(乘在 body 上,不是减)。0.58 ⇒ 有效 body 0.36
uniform float uOrbGrain;        // 碎粒频率(1/米)。迪斯科球把光打碎成一地亮斑
uniform float uOrbGrainBias;    // 碎粒阈值。waterVNoise 的分位数 p05 0.15 / p50 0.50 / p95 0.85
uniform float uOrbFarKeep;      // 远景带的保护系数:远处只压到这个比例,"对岸"才读得出
uniform float uOrbSpinPhase;    // 0..1 自转相位。碎粒跟着球一起慢慢挪

const float WATER_ORB_PI = 3.14159265;

/* 退场后退的两个常数(W11b)。写死不做 uniform:它们是**退场这一段动效的形状**,
 * 和 exitDuration 一样属于编排层的调参,不是 preset 的美术参数;做成 uniform 只会
 * 多两个没人拖的滑块,还多两处会漂的拷贝(docs §11 坑 7)。
 *  · K = 3.0    池心沿视线拉远到 4 倍距离。night 48.4 m → 194 m。
 *  · MINR = 0.35 半径缩到 35%。缩到 0 会在最后一帧闪一个亮点(池心恒为峰值,
 *    半径趋 0 时那一个像素仍是满亮),0.35 配合 energy→0 才是干净地化掉。 */
const float WATER_ORB_RETREAT_K    = 3.0;
const float WATER_ORB_RETREAT_MINR = 0.35;

/* 远景保护带的跨度,以池半径为单位。景深权重从**光池的近边**开始爬,
 * 爬满 0.7 个池半径(mid: 4.15 → 5.97 m)。
 *
 * **这个锚点是实测挖出来的,不要往后挪。** mid 的十条横带按屏幕等分,换算成
 * 世界深度是极不均匀的:band 9~5 落在 2.0~4.1 m(前景,focus=0 时是一片
 * 饱和白、RMS 恒为 0),band 4~2 落在 4.1~8.6 m(**暗划线全在这里**,
 * RMS 35/43/47),band 1~0 落在 8.6~24.6 m(掠射到几乎没有对比,RMS 0.6/1.2)。
 *
 * 也就是说"远景带"在**光池的近边前面一点点**就开始了,不在池子后面。
 * 第一版把爬升起点放在球的落点(6.75 m)、跨度 4 个池半径,band 2~4 的
 * depthWeight 只有 0~0.09 → 几乎不受保护 → RMS 35/43/47 掉到 7.6/8.0/5.5,
 * 画面上整条对岸带死成一片纯墨。算术上也说得通:
 *   · 前景要从饱和白翻成纯墨,需要 Δlum > 0.21 ⇒ dim < 0.65;
 *   · 暗划线带只要 Δlum > 0.13 就整条出窗 ⇒ 要留住它 dim 必须 > 0.87。
 * 两个要求差着 6 倍,所以景深权重必须在 **band 5 与 band 3 之间**(3.5~6 m)
 * 就爬满 —— 这正好是光池近边那一段。 */
const float WATER_ORB_FAR_SPAN = 0.7;

/* 池边溶解取阈值时在屏幕上的偏移(物理像素)。
 * **必须是偶数**:waterDitherThreshold 先 floor(frag / uDitherPixel),
 * 三个 preset 的 uDitherPixel 都是 2,偶数偏移等于整格平移 —— 溶解带的颗粒
 * 与画面其余部分**同一个网格、同一种语言**,不会退化成 1px 的细沙。
 * 平移量选 (40, 72):aniso 压缩后 x 向仍是整数格(20 × 0.30 = 6),
 * 于是取到的是同一张蓝噪声瓦片里 (6, 36) 处的另一个样本 —— 与量化那一次
 * **去相关**。不去相关的话低阈值像素会同时"落进池里"又"更容易是纸",
 * 两个效果叠在一起,溶解带会硬得像一条剪影边。 */
const vec2 WATER_ORB_DISSOLVE_OFF = vec2(40.0, 72.0);

/* dither.glsl.ts 的前置声明。拼装顺序是 … + LIGHT + SHADE + **DITHER** + TAIL,
 * 阈值图在本模块之后才拼进来,所以这里只能声明(GLSL ES 3.00 支持函数原型)。
 *
 * assemble.ts 的文件头写过"一条链上只允许有一处前向声明",指的是
 * FIELD ⇄ LIGHT 那条环。这里是**第二条、而且不成环**的依赖:LIGHT 用 DITHER,
 * DITHER 谁都不用。反过来把 DITHER 提到 LIGHT 前面也能编过,但那会重排整份
 * 着色器的声明顺序,而本卡的硬验收是"focus=0 时输出逐字节不变" ——
 * 加一行原型是唯一零风险的做法。
 *
 * **不要在这里另写一套阈值。** 溶解与量化必须是同一张蓝噪声、同一个网格,
 * 否则边缘会出现两种颗粒打架(docs §4 坑 ① 的同类)。 */
float waterDitherThreshold(vec2 frag);

/* ── 光斑核 ──────────────────────────────────────────────────────────────
 * (1 - d²)³ 的紧支撑核。选它不选高斯有三个理由:
 *  · 没有 exp:24 个高斯 × 2M 像素 = 5e7 次超越函数,吃光 0.4ms 的预算;
 *  · 紧支撑:d>1 精确为 0,不会在远处留一层抬高整幅画面的地板 ——
 *    那层地板在 1-bit 抖动下会变成一片糊掉的中灰(W3 §9.2 的"天空中灰"同类病);
 *  · 边缘是三阶接触,比高斯的长尾更容易在 1-bit 下抖出干净的溶解带。 */
float waterOrbKernel(vec2 d){
  float k = 1.0 - dot(d, d);
  if (k <= 0.0) return 0.0;
  return k * k * k;
}

/** 模式 A:K 次核求和。循环上界是编译期常量,不是动态循环。 */
float waterOrbSpotSum(vec2 p){
  float e = 0.0;
  for (int i = 0; i < 24; i++){
    vec4 s = uOrbSpots[i];
    e += s.w * waterOrbKernel((p - s.xy) * s.z);
  }
  return e;
}

/**
 * ⑤ **主光池(W11a)**。一个平顶 + 各向异性裙边的大面积弱照度,与 24 个镜片斑
 * **相加**后一起走 body 那一路(见文件头 W11a 那一段的实测根因)。
 *
 * 形状:池心取球**正下方**的水面点(uOrbCenter.xz,不是光斑质心 ——
 * 质心会跟着自转相位跳,而"球下面那摊光"不该跳)。以相机→池心的方位
 * ax 为长轴,横向(ax 的法向)按 uOrbPoolRadius 度量,纵向按
 * along / k 度量:k 在远侧取 uOrbPoolFar、近侧取 uOrbPoolNear。
 * 1 − smoothstep(flat, 1, d) 给出**平顶**:d < flat 的部分恒为 1.0,
 * flat..1 之间是三次裙边。平顶而不是高斯,理由与 waterOrbKernel 同一条 ——
 * 紧支撑,d > 1 精确为 0,不会在远处留一层抬高整幅画面的地板。
 *
 * ── 为什么远近**不对称** ────────────────────────────────────────────────
 * 对称拉长(Far = Near)会把池子的近边一起拖进前景,前景平坦度 从 0.155
 * 掉到 0.286 —— **直接 FAIL**(门槛 0.15)。而参考图里"光在水上是一道竖着
 * 的路",那道路是往**地平线方向**拖的,不是往脚下拖:近侧 0.55 反而要比
 * 圆(1.0)更**收**,远侧 2.6 才是拉长的那一头。
 *
 * ── 退化情况 ────────────────────────────────────────────────────────────
 * normalize(c) 里 c 理论上不可能是 0 向量:球挂在画面上方,它正下方的水面点
 * 必在相机前方(z > 0)。但"理论上不可能"在这个项目里已经翻过车(docs §17.2
 * 坑 15),所以显式兜住 length(c) < 1e-4,退回正前方 (0, 1) ——
 * 返回 0 会在球飞过相机头顶的那一帧闪一下,借个轴不会。
 */
float waterOrbMainPool(vec2 p){
  if (uOrbPoolGain <= 0.0) return 0.0;
  /* ── 退场后退(W11b)────────────────────────────────────────────────────
   * 球升起离场时,池子要「往地平线退 + 缩小 + 变暗」。变暗由 uOrbEnergy 免费
   * 给(它乘在 waterOrbIrradiance 的出口上),这里只做前两件。
   *
   * **后退必须显式驱动,不能指望几何。** 球心解算是
   * dist = worldRadius / sin(atan(radiusNdc·tanH)) —— dist 只跟 radiusNdc
   * 和 worldRadius 有关,球沿屏幕**升高**时 dist 不变、仰角变大,于是它正下方的
   * 水面点 (x, z) 反而**离相机更近**。也就是说光靠时间线抬高球,池子是往
   * 脚下走而不是往地平线走,正好是反的。
   *
   * 后退量取「沿视线方向按比例拉远」而不是「加多少米」:三个 preset 的世界
   * 尺度差一个数量级(night 48 m / mid 6.8 m / near 1.8 m),加米数在 near 上
   * 会把池子直接扔出宇宙。K = 3 ⇒ night 的 48.4 m 退到 194 m,那里离地平线
   * (画面上 y≈815)只剩十几个像素,读起来就是「收回海岸线」。 */
  float rt = clamp(uOrbPoolRetreat, 0.0, 1.0);
  vec2  c  = vec2(uOrbCenter.x, uOrbCenter.z) * (1.0 + rt * WATER_ORB_RETREAT_K);
  float cl = length(c);
  vec2  ax = cl > 1e-4 ? c / cl : vec2(0.0, 1.0); // 相机在原点,池心方向就是视线方位
  vec2  q  = p - c;
  float along = dot(q, ax);
  float k = along > 0.0 ? max(uOrbPoolFar, 1e-3) : max(uOrbPoolNear, 1e-3);
  vec2  e = vec2(dot(q, vec2(ax.y, -ax.x)), along / k);
  float r = max(uOrbPoolRadius, 1e-3) * mix(1.0, WATER_ORB_RETREAT_MINR, rt);
  float d = length(e) / r;
  return uOrbPoolGain * (1.0 - smoothstep(clamp(uOrbPoolFlat, 0.0, 0.99), 1.0, d));
}

/** 模式 B:从 sprite sheet 里取第 frame 帧,按场坐标映射到那一格的 uv。 */
float waterOrbLightmapSample(vec2 p){
  vec2 uv = (p - uOrbLightmapRect.xy) / max(uOrbLightmapRect.zw, vec2(1e-4));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float cols = max(uOrbLightmapCols, 1.0);
  float rows = max(uOrbLightmapRows, 1.0);
  float f    = mod(floor(uOrbLightmapFrame), cols * rows);
  vec2  cell = vec2(mod(f, cols), floor(f / cols));
  // sprite sheet 的行是从上往下排的,uv.y 向上,所以行号要翻过来
  vec2 t = (cell + vec2(uv.x, 1.0 - uv.y)) / vec2(cols, rows);
  return texture(uOrbLightmap, vec2(t.x, 1.0 - t.y)).r;
}

/**
 * 水面 p 处收到的灯球照度(未乘任何增益)。**总闸门在这里**。
 *
 * uOrbEnergy <= 0.0 时**精确返回 0.0**(而不是"很小的数"):
 * 上游 (1-F)*(uShadeBody + 0.0) 与 env + spec + 0.0 在 IEEE 下与
 * 灯球接入前逐位相同,这是 §5 那条"md5 逐字节相同"验收唯一站得住的做法。
 */
float waterOrbIrradiance(vec2 p){
  if (uOrbEnergy <= 0.0) return 0.0;
  /* 模式 B 的纹理还不存在(docs/blender-assets.md B-4 未渲)。尺寸为 0 = 没绑上,
   * 回落到 A。判尺寸不判采样值:未绑定的 sampler2D 采出来是 0,和"这里没光"分不开。 */
  if (uOrbLightMode == 1 && uOrbLightmapSize.x >= 1.0){
    return uOrbEnergy * waterOrbLightmapSample(p);
  }
  /* W11a:镜片斑 + 主光池。模式 B 不加池 —— B 的照度图本来就该把球体本身泼下来
   * 的那份弱光一起烘进去(docs/blender-assets.md B-4),再加一遍就是算两次。 */
  return uOrbEnergy * (waterOrbSpotSum(p) + waterOrbMainPool(p));
}

/**
 * 从水面点看向球心的方向(**相机系**,与 shade.glsl.ts 的 N/V 同系)。
 * 场坐标 (x, 0, y_field) 在相机系里是 (x, 0, -y_field) —— 第三轴反号,
 * 和 waterFieldToView 是同一个约定。
 */
vec3 waterOrbLightDir(vec2 p){
  return normalize(vec3(uOrbCenter.x - p.x, uOrbCenter.y, -(uOrbCenter.z - p.y)));
}

/**
 * 灯球在水面上的**镜面光路**。与 shade 的月光高光同一套 Beckmann,参数各自一份。
 *
 * ── 一个走了弯路才想明白的地方 ──────────────────────────────────────────
 * 第一版把这一项**乘上了光斑照度 E(p)**,理由是"镜片光斑在水面的镜面反射"。
 * 那是错的,而且错得很彻底:光斑落在 A 点,它在 A 点的镜面反射方向是
 * reflect(-L, N),对近乎水平的水面来说这条反射光**朝远离相机的方向走了**;
 * 相机在 A 点看到的镜面反射来自完全另一个方向。实测 dot(N,H) ≈ cos45°,
 * 而水面斜率 p99 只有 0.12(7°),Beckmann 的 exp(-tan²/σ²) 直接是 0 ——
 * 那一版无论把增益开到多大,画面上一个像素都不会变。
 *
 * 正确的物理:镜面项是**球本身(及其镜片)在水里的像**被波面打散成的一条光路,
 * 和月光路径同一个机制。它出现在球的镜像方向上,**不在光斑落点上**,
 * 所以这里只按球心方向算一次,不乘 E(p)。
 * 光斑落点那一片的贡献是**漫射**的(光进了水体又散射出来),走 body 项。
 */
float waterOrbSpecular(vec3 N, vec3 V, vec3 L, float sigma2){
  if (uOrbEnergy <= 0.0) return 0.0;
  float ndl = dot(N, L);
  if (ndl <= 0.0) return 0.0;
  vec3  H  = normalize(L + V);
  float ct = clamp(dot(N, H), 1e-3, 1.0);
  float s2 = max(sigma2, uOrbSigmaFloor);
  float c2 = ct * ct;
  float tan2 = (1.0 - c2) / c2;
  float D = exp(-tan2 / s2) / (WATER_ORB_PI * s2 * c2 * c2);
  return min(uOrbEnergy * D * uOrbOmega * ndl, uOrbSpecClip);
}

/**
 * ① 波幅通道。返回**波幅增益**,不是亮度 —— 见文件头。
 *
 * field.glsl.ts 里只有前置声明,定义在这里。
 *
 * **故意不逐镜片**:waterPatchAmp 本身就是米级的"哪片水面起风"那一层,
 * 分米级的镜片光斑在这一层没有意义,而且会让每像素多跑一次 K 循环。
 * 用 CPU 算好的光斑质心 + RMS 展布画一团,(1-d²)³ 同一个核,成本是常数。
 */
float orbPatch(vec2 p, float t){
  if (uOrbEnergy <= 0.0) return 0.0;
  vec2 d = (p - uOrbPatchCenter) / max(uOrbPatchRadius, 1e-3);
  return uOrbEnergy * uOrbPatchGain * waterOrbKernel(d);
}

/**
 * ④ **聚焦渐晕(W10)**。返回一个乘在 **body** 上的 0..1 系数。
 *
 * uOrbFocus <= 0.0 时**精确返回 1.0**(而不是"很接近 1 的数"):
 * IEEE 下 x × 1.0 ≡ x,于是 (uShadeBody + orbBody) * 1.0 与本卡接入前
 * 逐位相同 —— 这是 §3 那条"md5 逐字节相同"验收唯一站得住的做法,
 * 与 uOrbEnergy 那条闸门同一个写法。
 *
 * 四件必须做对的(任务书 §2.1):
 *
 * ① **世界空间距离,不是屏幕椭圆。** p 是 waterSurfacePoint 逐像素逆投影
 *    出来的场坐标,length(p - uOrbGround) 按**米**算。池子因此自动
 *    "近边宽、远端压扁" —— 屏幕椭圆是错的形状,一眼看得出。
 *
 * ② **边缘用蓝噪声阈值溶解。** 连续的池边坡道过 tonemap(contrast 8)之后
 *    只剩不到 1 px 的过渡带,1-bit 下就是一条刀切的剪影边。step(阈值, 坡道)
 *    把那条坡道摊成一带网点,和地平线、和整幅画面同一种语言。
 *
 * ③ **远景带保留。** 景深权重取 p.y(场坐标里"离相机多远",米)。
 *    前景 keep=1 全压,远处 keep→uOrbFarKeep 只压一点。
 *    物理上还有一层帮忙:远处掠射 F→0.72,body 本来只占亮度的三成,
 *    压 body 对远端的影响天然就小 —— uOrbFarKeep 是在这之上再留一手。
 *
 * ④ **mid 走的是纯光池,不跑 24 斑的核求和。** 那是 night 的路径,本函数
 *    一次 uOrbSpots[] 都没读。
 *
 * 成本:每像素 1 次 length + 1 次 smoothstep + 1 次 waterVNoise(4 次 hash)
 * + 1 次蓝噪声纹理取样。focus=0 时全部跳过(第一行就返回)。
 */
float waterOrbFocusDim(vec2 p){
  if (uOrbFocus <= 0.0) return 1.0;

  // ① 世界空间的光池:近边宽、远端压扁,是逆投影自己给的,不是画出来的
  float dist = length(p - uOrbGround);
  float edge = 1.0 - smoothstep(uOrbPoolR * 0.45, uOrbPoolR, dist);

  // ② 池边溶解:同一张蓝噪声、同一个网格,偏移一格避免与量化那一次相关
  float pool = step(waterDitherThreshold(gl_FragCoord.xy + WATER_ORB_DISSOLVE_OFF), edge);

  /* 碎粒:迪斯科球把光打碎成一地亮斑,池子里不是一块均匀的亮。
   * 阈值以下也不归零(mix 的下界 0.55),不然池子内部会分成死黑死白两片。 */
  float speck = waterVNoise(p * uOrbGrain + uOrbSpinPhase);
  float lit = pool * mix(0.55, 1.0, step(uOrbGrainBias, speck));

  // ③ 远景保护:景深权重从光池的**近边**开始爬(理由见 WATER_ORB_FAR_SPAN)
  float far0 = uOrbGround.y - uOrbPoolR;
  float depthWeight = smoothstep(far0, far0 + uOrbPoolR * WATER_ORB_FAR_SPAN, p.y);
  float keep = mix(1.0, uOrbFarKeep, depthWeight);

  return mix(1.0, mix(uOrbAmbient, 1.0, lit), uOrbFocus * keep);
}

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

uniform float     uSkyStarGain;      // 环境星场增益(0 = 关,默认)
uniform float     uSkyStarDensity;   // 星稀疏阈值 0..1(越大越稀;仅 gain>0 时有意义)
uniform float     uSkyTitleGain;     // 标题/星座增益(0 = 关,默认)
uniform sampler2D uSkyTitleMask;     // R=清空区 / G=标题星座
uniform vec2      uSkyTitleMaskSize; // 纹理尺寸(CPU 写入;此处按 UV 采样不直接用,但保留契约)

float waterSkyHash2(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

/* 稀疏亮星:屏幕按格划分,每格至多一颗随机小圆点,够小 → 抖动后成一粒墨点。
 * density 决定多少格有星;圆点半径小 → 掠过阈值即闪。返回 [0, ~1] 的亮度(未乘增益)。 */
float waterStarField(vec2 uv){
  vec2 g  = uv * vec2(150.0, 95.0);            // 星格密度(手感旋钮)
  vec2 id = floor(g);
  vec2 f  = fract(g);
  float h = waterSkyHash2(id);
  if (h < uSkyStarDensity) return 0.0;          // 大多数格无星
  vec2 c  = vec2(waterSkyHash2(id + 3.1), waterSkyHash2(id + 7.7));
  float d = length(f - c);
  float star = smoothstep(0.16, 0.0, d);        // 小圆点
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + 2.6 * h) + h * 30.0); // 闪烁(uTime → RM 冻结)
  return star * tw;
}

/* 叠加到天空辐射上的量。gain 全 0(默认)→ 精确 0.0(闸门安全)。 */
float waterSkyStars(vec2 frag){
  if (uSkyStarGain <= 0.0 && uSkyTitleGain <= 0.0) return 0.0;
  vec2 uv = frag / uRes;
  float clear = 0.0;
  float glyph = 0.0;
  if (uSkyTitleGain > 0.0){
    vec2 muv = vec2(uv.x, 1.0 - uv.y);          // canvas 左上原点 → 采样翻 y
    vec4 m = texture(uSkyTitleMask, muv);
    clear = clamp(m.r, 0.0, 1.0);               // 留白区
    glyph = clamp(m.g, 0.0, 1.0);               // 标题星座
  }
  float ambient = uSkyStarGain * waterStarField(uv) * (1.0 - clear);
  float title   = uSkyTitleGain * glyph;
  return ambient + title;
}

// —— 阈值图(void-and-cluster 蓝噪声,R8,NEAREST + REPEAT)——
uniform sampler2D uDitherNoise;
uniform vec2  uDitherNoiseSize;  // 由渲染台按纹理尺寸写入

// —— 网点几何 ——
uniform float uDitherPixel;      // 抖动单元边长(物理 px)。1 = 逐像素;2 = 站点默认
uniform float uDitherAniso;      // 0 = 各向同性方颗粒;1 = 横向压缩到 0.30 → 颗粒被拉长

// —— 输出 ——
uniform float uDitherQuantize;   // 0 = 连续灰度(调物理时先看这个);1 = 两色抖动
uniform vec3  uDitherInk;        // --water-ink,#32331A
uniform vec3  uDitherPaper;      // --water-paper,#E6FEFD

/* 横向压缩下限。0.30 = 采样坐标 x 缩到 30% → 同一列噪声被复用 ~3 个像素宽。
 * 这个数与 near/mid/night 三个 preset 的 uDitherAniso 是一套扫出来的,单独改它
 * 等于把三个 preset 的 dashAspect 一起推走。 */
const float WATER_DITHER_ANISO_MIN = 0.30;

/** 屏幕像素 → 阈值 [0,1)。纯函数:不吃 uTime,不吃世界坐标。 */
float waterDitherThreshold(vec2 frag){
  vec2 dp = floor(frag / uDitherPixel);
  dp.x = floor(dp.x * mix(1.0, WATER_DITHER_ANISO_MIN, uDitherAniso));
  // +0.5 取纹素中心;NEAREST + REPEAT,所以整数坐标可以直接除尺寸平铺
  return texture(uDitherNoise, (dp + 0.5) / uDitherNoiseSize).r;
}

/** 亮度 → 最终 RGB。uDitherQuantize < 0.5 时旁路成连续灰度。 */
vec3 waterDitherApply(vec2 frag, float lum){
  if (uDitherQuantize < 0.5) return vec3(lum);
  return mix(uDitherInk, uDitherPaper, step(waterDitherThreshold(frag), lum));
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 ndc  = (frag / uRes) * 2.0 - 1.0;
  vec2 p; vec3 rd;
  float lum;
  if (!waterSurfacePoint(ndc, uRes.x / uRes.y, p, rd)) {
    // 天空:环境辐射 + 星场/标题星座(B;两个增益默认 0 → 精确 0,闸门安全)。tonemap 前叠加。
    lum = waterTonemap(waterShadeSky(rd) + waterSkyStars(frag));
  } else {
    float footprint = max(fwidth(p.x), fwidth(p.y));
    vec3 N; float sigma2;
    waterNormalRough(p, uTime, footprint, N, sigma2);
    lum = waterTonemap(waterShadeSurface(N, rd, sigma2, p));
  }
  fragColor = vec4(waterDitherApply(frag, lum), 1.0);
}
