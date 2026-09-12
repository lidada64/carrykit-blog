/**
 * ripple.glsl.ts —— W6 涟漪求解器的两段着色器
 *
 * 契约(计划 §3 / contract.ts 的 uniform 命名表):uniform 一律 `uRipple` 前缀。
 * 本文件导出两段**互不相关**的源码:
 *
 *  · `SOLVE_SRC` —— 求解 pass 的**完整**片元着色器(自带 `#version`)。
 *    渲染进 256×256 RG16F 的 ping-pong:R = h(n),G = h(n−1)。
 *  · `SRC`       —— 水面 pass 消费涟漪的那一段,拼进 preview.frag。
 *    出口只有一个:`vec3 waterRipple(vec2 p, float footprint)`,
 *    返回 (高度, ∂h/∂x, ∂h/∂y);**关闭时精确返回 vec3(0.0)**。
 *
 * ── 本文件不 import 任何东西 ────────────────────────────────────────────────
 * `scripts/water-harness.mjs` 与 `scripts/gen-water-preview.mjs` 是**纯 node**
 * 跑的,而 node 的类型擦除**不做无扩展名解析**(`import { X } from "./contract"`
 * 直接 ERR_MODULE_NOT_FOUND)。orb-light.ts 文件头写的是同一条约束。
 * 所以 `RIPPLE_IMPULSE_SLOTS` 在这里和 `ripple.ts` 里各写一遍,
 * 由 `golden/w3/build.ts` 的断言防漂移 —— 与 `ORB_MAX_SPOTS` 完全同款。
 *
 * ── 为什么 W6 不用 `orbPatch` 那招前向声明 ──────────────────────────────────
 * 任务书建议照 `orbPatch`(field.glsl.ts 第 121 行)前向声明 `waterRipple`。
 * 实际拼装时选了**把 RIPPLE 放在 FIELD 之前**,理由是两条,都跟正确性有关:
 *
 *  ① `orbPatch` 必须前向声明,是因为 LIGHT 反过来依赖 FIELD 的世界坐标约定,
 *    一条链上有环。**涟漪这条链没有环**:本模块是叶子,只用自己的 uniform,
 *    不调 FIELD 的任何函数。有环才需要前向声明,没环时前移是更简单的解。
 *  ② 更要紧的一条:GLSL 不允许同一个 uniform 声明两次,而 §4.1 那条
 *    「涟漪关闭时逐字节回归」要求 `waterWaveField` 里那段新代码是一个
 *    **编译期可见的分支** `if (uRippleAmp > 0.0) { ... }`,而不是
 *    `h += 0.0`。要写这个分支,`uRippleAmp` 就必须在 FIELD **之前**声明。
 *    (`h += 0.0` 在 IEEE 下确实是恒等的 —— 但那要赌编译器不会因为循环后面
 *    多了几条指令而改变循环体的求值顺序。docs §11 坑 7 之后,这种赌不值得打。)
 *
 * 拼装顺序因此是 HEAD + **RIPPLE** + FIELD + LIGHT + SHADE + DITHER + TAIL。
 */

/** `uRippleImpulses[]` 的长度,也是求解 shader 里那个循环的常数上界。 */
export const RIPPLE_IMPULSE_SLOTS = 8;

/* ══════════════════════════════════════════════════════════════════════════
 * 一、求解 pass
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 显式二阶中心差分的波动方程:
 *
 *     h(n+1) = ( 2·h(n) − h(n−1) + C²·∇²h(n) ) · damping
 *     C = c·Δt/Δx        (库朗数,CPU 侧断言 ≤ 0.7,见 ripple.ts)
 *
 * ∇² 用五点模板(单位是**纹素**,所以 C² 里已经吸收了 1/Δx²)。
 *
 * 状态编码:R = h(n),G = h(n−1)。选它不选「R=高度 / G=速度」有两个理由:
 *  · 中心差分格式本来就只需要前两层,存速度要多一次乘除,而且速度的量级
 *    比高度大 1/Δt 倍(60 倍),在 **16 位浮点**里白白吃掉指数位余量;
 *  · 冲击注入时「位移给定、速度为零」写成 h(n)=h(n−1)=A 是一行,
 *    写成速度形式还要想清楚半步交错。
 *
 * 边界(任务书 §3.2 第 2 条):
 *  · 最外一圈 Dirichlet h=0 —— 纹理采样再怎么 CLAMP 都采不到非零值;
 *  · 往里 `uRippleSponge` 个纹素是**吸收层**:每步乘 (1 − strength·s²),
 *    s 从边缘的 1 平滑降到内侧的 0。只做 Dirichlet 会**整环反射**回来,
 *    实测反射波和原波前一样亮,看上去像水池壁。吸收层把往返两趟压到 <1%。
 *    吸收层同时作用在 R 与 G 上 —— 只乘 R 相当于只改了一层,吸收减半。
 */
export const SOLVE_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uRippleState;    // R = h(n), G = h(n-1)
uniform vec2  uRippleTexSize;      // (256, 256)
uniform float uRippleC2;           // C² = (c·Δt/Δx)²,CPU 侧已做 CFL 断言
uniform float uRippleDamping;      // 每步的全局阻尼 0.995~0.999
uniform float uRippleSponge;       // 吸收层宽度(纹素)。0 = 只留 Dirichlet
uniform float uRippleSpongeK;      // 吸收层每步最多吃掉的比例(边缘处)

/* 本步要注入的冲击:xy = 归一化区域坐标 uv,z = 1/半径(uv 单位),w = 强度(米)。
 * w == 0 的槽位跳过。CPU 侧只在**冲击发生的那一步**填,其余步全 0。 */
uniform vec4  uRippleImpulses[${RIPPLE_IMPULSE_SLOTS}];

float rippleSpongeMul(vec2 c){
  if (uRippleSponge <= 0.0) return 1.0;
  vec2 d = min(c, uRippleTexSize - 1.0 - c);
  float s = 1.0 - smoothstep(0.0, uRippleSponge, min(d.x, d.y));
  return 1.0 - uRippleSpongeK * s * s;
}

void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 hi = ivec2(uRippleTexSize) - 1;

  // 最外一圈恒为 0:纹理边界外必须是干净的零,不能靠 CLAMP 拖出一条边
  if (c.x <= 0 || c.y <= 0 || c.x >= hi.x || c.y >= hi.y){
    fragColor = vec4(0.0);
    return;
  }

  vec2  s  = texelFetch(uRippleState, c, 0).rg;
  float hl = texelFetch(uRippleState, c + ivec2(-1, 0), 0).r;
  float hr = texelFetch(uRippleState, c + ivec2( 1, 0), 0).r;
  float hd = texelFetch(uRippleState, c + ivec2( 0,-1), 0).r;
  float hu = texelFetch(uRippleState, c + ivec2( 0, 1), 0).r;

  float lap = hl + hr + hd + hu - 4.0 * s.r;
  float hn  = (2.0 * s.r - s.g + uRippleC2 * lap) * uRippleDamping;

  float sp = rippleSpongeMul(gl_FragCoord.xy);
  hn      *= sp;
  float hp = s.r * sp;

  /* 冲击注入:高斯,3σ 截断(exp(-9) ≈ 1.2e-4,在 16 位浮点里已经是零)。
   * **同时加进 R 与 G** —— 位移给定、初速为零,就是"往水里丢一颗石子"的
   * 标准初值。只加 R 等于同时给了一个向下的初速度,出来的环前后不对称。 */
  vec2 uv = gl_FragCoord.xy / uRippleTexSize;
  float inj = 0.0;
  for (int i = 0; i < ${RIPPLE_IMPULSE_SLOTS}; i++){
    vec4 im = uRippleImpulses[i];
    if (im.w == 0.0) continue;
    vec2 d = (uv - im.xy) * im.z;
    float q = dot(d, d);
    if (q < 9.0) inj += im.w * exp(-q);
  }

  fragColor = vec4(hn + inj, hp + inj, 0.0, 1.0);
}
`;

/* ══════════════════════════════════════════════════════════════════════════
 * 二、水面 pass 消费涟漪
 * ══════════════════════════════════════════════════════════════════════════ */
export const SRC = `
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
`;
