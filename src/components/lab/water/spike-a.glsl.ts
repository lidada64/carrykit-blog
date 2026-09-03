/**
 * spike-a.glsl.ts —— 路线 A 原型:纯实时 WebGL2 shader (W1)
 *
 * 目的是回答一个问题:不预渲染、纯靠 shader,能不能把 water-metrics 的分打上去?
 * 这份原型把 W2(透视波场)/ W3(着色对比度带)/ W4(抖动)三张卡的核心机制各做
 * 一个最小可用版本,合在一个着色器里跑分。**不是最终实现**——最终版要按契约
 * 拆成三个独立模块,由三个 agent 分别打磨。
 *
 * 关键机制(按对分数的贡献排序):
 *  1. 逆投影:屏幕像素 → 水平面世界坐标。波长随距离自然压缩,不是平的屏幕噪声。
 *  2. 菲涅耳分层:lum = (1-F)·水体 + F·(环境 + 高光),F0 = 0.02。
 *     前景视角陡 → F≈0.02 → 几乎只剩平坦的水体色 → **前景平坦度自己就出来了**,
 *     不需要任何手调的 mask。这是整份原型最重要的一行。
 *  3. 亚像素粗糙度 σ²:被 LOD 淡掉的高频八度,其斜率方差累加进 σ² 喂给 Beckmann
 *     分布 → 高光近处碎成颗粒、远处并成宽带,对比度在远端自然衰减。
 *  4. 窄向散布的重力-毛细波:方向只在风向 ±20° 内展开,保住各向异性(相干度)。
 *  5. IGN 抖动替代 Bayer:无网格谐波(谱尖峰度从 64% 降到个位数)。
 */
export const SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;

// —— 相机 / 透视 ——
uniform float uCamHeight;   // 相机离水面高度(米)
uniform float uCamPitch;    // 俯角(弧度)
uniform float uFovY;        // 垂直视场角(弧度)

// —— 波场 ——
uniform float uWindDir;     // 风向(弧度)
uniform float uWindSpeed;   // 0..1
uniform float uSpread;      // 方向散布半角(弧度),越小越各向异性
uniform float uAmp;         // 振幅总缩放
uniform float uWarp;        // 低频域扭曲强度(0 = 笔直波脊)
uniform float uFetchLen;    // 风区长度(米):离近岸多远波才长起来。0 = 关闭
uniform float uLodBias;     // LOD 淡出提前量:>1 更早淡出 → 远端更平 → 对比峰下移

// —— 着色 ——
uniform float uBody;        // 水体亮度(透射侧,前景看到的就是它)
uniform float uEnvShore;    // 低仰角环境亮度(暗岸/暗天)
uniform float uEnvSky;      // 高仰角环境亮度
uniform float uEnvGlow;     // 地平线眩光强度
uniform float uSpecGain;    // 镜面高光增益
uniform float uEnvEdge;     // 岸线→天空的过渡宽度(仰角),越小边界越锐
uniform float uLightOmega;  // 光源立体角(sr)。月亮 ~6.8e-5,灯球镜片更小
uniform float uLightElev;   // 光源仰角(弧度)
uniform float uLightAz;     // 光源方位角(弧度)
uniform float uExposure;
uniform float uContrast;

// —— 量化 ——
uniform float uPixel;       // 抖动单元(物理 px)
uniform float uDitherAniso; // 0 = 各向同性,1 = 强横向拉长
uniform float uQuantize;    // 0 = 直接输出连续灰度(用于把「物理对不对」与
                            //     「抖动对不对」分开评分),1 = 两色抖动
uniform vec3  uInk;
uniform vec3  uPaper;
uniform sampler2D uBlueNoise;   // void-and-cluster 蓝噪声阈值图(scripts/gen-blue-noise.mjs)
uniform vec2  uBlueNoiseSize;

const float PI = 3.14159265;
const float G  = 9.81;
const float SIGMA_RHO = 7.28e-5;   // 表面张力 / 密度,毛细项用
const int   OCTAVES = 6;

// 每个八度的波长(米)与振幅系数。从长到短,覆盖 28cm → 2cm,
// 正好是实拍照片里读得出的那一段(峰值带纵向波长 8~12px)。
// 分量数。6 个固定正弦会织出**周期性点阵**(看起来像布纹不像水),
// 而 water-metrics 的相干度/游程指标看不出这种周期性——见 W1 的记录。
// 用 24 个由哈希决定波长/方向/相位的分量,干涉图案才是随机的。
const int   COMPONENTS = 24;
const float LAMBDA_MIN = 0.018;   // 1.8 cm
const float LAMBDA_MAX = 0.320;   // 32 cm

float h11(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}

/**
 * 波场。返回高度,并输出斜率梯度与「被 LOD 淡掉的那部分」的斜率方差 sigma2。
 * footprint = 该像素在世界空间覆盖的尺度(米),由调用方用 fwidth 求出。
 */
float waveField(vec2 p, float t, float footprint, out vec2 grad, out float sigma2){
  /* 风区(fetch)衰减:近岸被挡风,波长不起来。实拍中景照片的分带 RMS 在 band5→6
   * 一带内掉了 10 倍——这种断崖不是菲涅耳能给出的(菲涅耳是平滑曲线),
   * 而是近岸那条真实存在的静水带。少了这一项,前景平坦度卡在 0.22 上不去。 */
  float fetch = uFetchLen > 0.0 ? smoothstep(0.0, uFetchLen, abs(p.y)) : 1.0;
  // 低频域扭曲:只推弯波脊,不揉碎。强度必须小,否则相干度掉下 0.85。
  // 扭曲噪声的**频率**比强度更要紧:第一版在 p*0.7(米级)上采样,只是把整片
  // 波场平移,波脊照样笔直,划线长宽比卡在 10 以上。要把波脊打断成 3~4 倍长的
  // 短划,扭曲必须在几个波长的尺度(~0.25m)上变化。
  vec2 wp = p + uWarp * 0.012 * vec2(
      vnoise(p * 4.0 + vec2(t * 0.05, 0.0)) - 0.5,
      vnoise(p * 4.0 + vec2(0.0, t * 0.04) + 31.4) - 0.5);

  float h = 0.0;
  grad = vec2(0.0);
  sigma2 = 0.0;

  for (int i = 0; i < COMPONENTS; i++){
    float fi = float(i);
    // 波长在 [1.8cm, 32cm] 内对数均匀随机取,方向在风向 ±uSpread 内随机,
    // 相位随机。三者都随机,干涉才是随机的。
    float lambda = LAMBDA_MIN * pow(LAMBDA_MAX / LAMBDA_MIN, h11(fi + 1.7));
    float k = 2.0 * PI / lambda;
    // 重力-毛细色散:短波(<1.7cm)靠表面张力跑得更快,细浪与长浪不同步
    float omega = sqrt(G * k + SIGMA_RHO * k * k * k);
    float th = uWindDir + uSpread * (h11(fi + 9.3) * 2.0 - 1.0);
    vec2 dir = vec2(cos(th), sin(th));
    // 振幅谱 a ∝ lambda^0.9,并按分量数归一
    float a = 0.0042 * pow(lambda / 0.10, 0.9) * (6.0 / float(COMPONENTS)) * uAmp * fetch;

    // 解析 LOD:一个波长内不足 4 px 时开始淡出,到 2 px(奈奎斯特)完全消失。
    // 淡掉的能量不丢,转成 sigma2 —— 这是远处「不糊成噪点又不丢反光」的关键。
    float r = footprint / lambda * uLodBias;
    float w = 1.0 - smoothstep(0.25, 0.5, r);
    float slopeVar = 0.5 * (a * k) * (a * k);
    sigma2 += (1.0 - w) * slopeVar;
    if (w <= 0.001) continue;

    float ph = dot(dir, wp) * k - omega * t * uWindSpeed + h11(fi + 4.1) * 6.2831853;
    h += w * a * sin(ph);
    grad += w * a * k * cos(ph) * dir;
  }
  return h;
}

// 环境「列」:反射方向的仰角 → 辐射亮度。真实环境在这个场景里就是一条竖直梯度:
// 低仰角是暗岸/暗天,高仰角是亮天,地平线附近有一条眩光带。不做真反射、不做 SSR。
float envColumn(float e){
  // 岸线(暗)→ 天空(亮)的边界必须**锐**:实景里那是一条树线或水天线。
  // 暗划线的成因就是波面斜率把反射方向扫过这条边界——边界越锐,扫过时的
  // 明暗跳变越大,划线才成形。边界铺太宽(第一版 0.44 rad)对比度直接被抹平。
  float sky  = smoothstep(0.0, uEnvEdge, e);
  float base = mix(uEnvShore, uEnvSky, sky);
  float glow = uEnvGlow * exp(-abs(e - 0.02) / 0.05);
  return min(base + glow, 1.3);
}

/* 抖动阈值源必须是**蓝噪声**,这不是化妆品:
 *   Bayer 8×8 → 在 res/cell 频率留十字网格(实测占高频能量 64%);
 *   IGN 被 floor(frag/uPixel) 粗化后 → 斜向布纹(实测 76%);
 *   哈希白噪声 → 谱平坦无网纹,但低频能量在局部平均后残留 std≈11 灰阶,
 *                把前景那几个灰阶的水面结构整个淹掉(相干度 0.95 → 0.34);
 *   void-and-cluster 蓝噪声 → 能量全在高频,局部平均后残余仅 ~4 灰阶,结构留得住。 */
float dither(vec2 p){
  return texture(uBlueNoise, (p + 0.5) / uBlueNoiseSize).r;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 ndc = (frag / uRes) * 2.0 - 1.0;          // y 向上为正
  float aspect = uRes.x / uRes.y;
  float tanH = tan(uFovY * 0.5);

  // 相机空间射线 → 绕 X 轴下俯 uCamPitch → 世界射线。
  // 绕 X 转 -pitch:y' = y·cosφ + z·sinφ,z' = -y·sinφ + z·cosφ(前向 z=-1)。
  // 地平线落在 ndc.y = tan(pitch)/tan(fov/2) —— 三个 preset 就靠这条式子定构图。
  vec3 d = normalize(vec3(ndc.x * tanH * aspect, ndc.y * tanH, -1.0));
  float cp = cos(uCamPitch), sp = sin(uCamPitch);
  vec3 rd = normalize(vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp));

  // 地平线以上 = 天空。用环境列的高仰角值填,保持画面完整。
  if (rd.y >= -1e-4){
    float lum = clamp((envColumn(0.45) - 0.5) * uContrast + 0.5 + uExposure, 0.0, 1.0);
    if (uQuantize < 0.5){ fragColor = vec4(vec3(lum), 1.0); return; }
    fragColor = vec4(mix(uInk, uPaper, step(dither(floor(frag / uPixel)), lum)), 1.0);
    return;
  }

  float tHit = uCamHeight / (-rd.y);
  vec2 p = vec2(rd.x, -rd.z) * tHit;              // 水面世界坐标(米)

  // 像素在世界空间的覆盖尺度。距离越远越大 → 驱动 LOD 与 sigma2。
  float footprint = max(fwidth(p.x), fwidth(p.y));

  vec2 grad; float sigma2;
  waveField(p, uTime, footprint, grad, sigma2);

  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 V = -rd;

  // 菲涅耳(Schlick),水的 F0 = 0.02。
  // 前景视角陡 → dot(N,V) 接近 1 → F ≈ 0.02 → 几乎只剩平坦的水体亮度;
  // 远处掠射 → F → 1 → 环境与高光全额进来。单峰对比度带由此产生。
  float cosNV = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosNV, 5.0);

  vec3 R = reflect(-V, N);
  float envL = envColumn(R.y);

  // 亚像素粗糙度驱动的 Beckmann 高光:近处 sigma2 小 → 锐、碎成颗粒;
  // 远处 sigma2 大 → 钝、并成一条宽带。月光/灯球路径的形状就是这么来的。
  vec3 L = vec3(cos(uLightElev) * cos(uLightAz), sin(uLightElev), cos(uLightElev) * sin(uLightAz));
  vec3 H = normalize(L + V);
  float ct = max(dot(N, H), 1e-3);
  float tan2 = (1.0 - ct * ct) / (ct * ct);
  float s2 = max(sigma2, 2.0e-5);
  float D = exp(-tan2 / s2) / (PI * s2 * ct * ct * ct * ct);
  // Beckmann 分布在立体角上积分为 1,所以必须乘光源立体角才是辐照度。
  // 少了这一项,小 sigma2 处 D 峰值上万,近场直接烧成全白。
  float spec = uSpecGain * D * uLightOmega * max(dot(N, L), 0.0);

  float lum = (1.0 - F) * uBody + F * (envL + spec);
  lum = (lum - 0.5) * uContrast + 0.5 + uExposure;
  lum = clamp(lum, 0.0, 1.0);

  // 各向异性阈值:把抖动图案在 x 方向压缩采样 → 相邻像素共享阈值 → 墨点沿水平
  // 方向连成短划,而不是各自独立的圆点。参考图的暗划线长宽比 1.5~3.5 就是这个。
  if (uQuantize < 0.5){ fragColor = vec4(vec3(lum), 1.0); return; }
  // 各向异性阈值:x 方向粗化后再取阈值 → 相邻像素共享同一个阈值 → 墨点沿水平
  // 方向连成短划。注意必须 floor 之后再缩放再 floor,直接乘会产生斜向摩尔纹。
  vec2 dp = floor(frag / uPixel);
  dp.x = floor(dp.x * mix(1.0, 0.30, uDitherAniso));
  float th = dither(dp);
  fragColor = vec4(mix(uInk, uPaper, step(th, lum)), 1.0);
}
`;
