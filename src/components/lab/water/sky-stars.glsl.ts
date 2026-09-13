/**
 * sky-stars.glsl.ts —— 天空星场 + 标题星座遮罩(方向4「篝火与星座」/lab/home-campfire 专用)
 *
 * 只作用在**天空一侧**的像素(assemble.ts 的 TAIL 里,非水面分支,tonemap 之前叠加)。
 * 在夜空里铺一层稀疏亮星(1-bit 抖动后成墨点 = 真「天空粒子」),并用一张屏幕空间遮罩
 * 在星场中间**清出一片留白**、把 CarryKit 标题 + 星座**作亮星点亮**坐进去。
 *
 * ── 闸门安全(红线)──────────────────────────────────────────────
 * 三个增益 uniform(uSkyStarGain / uSkyTitleGain,连同 density)**默认 0**;本模块所有贡献
 * 一律 `× gain`,gain=0 时 `waterSkyStars` 精确返回 0.0 → 天空辐射逐字节不变 → 四道闸门
 * 与金标帧照旧通过(同 uOrbEnergy=0 / uOrbFocus=0 / uOrbPoolGain=0 那几条闸门的写法)。
 * 只有 campfire 变体经 `overrides` 把增益推上去 + 经 `skyMask` prop 喂遮罩纹理才会激活。
 *
 * ── 约定 ────────────────────────────────────────────────────────
 * · 按**屏幕 UV**(uv = frag / uRes)采样 → 与 DPR / 后备缓冲尺寸无关(不用 gl_FragCoord 的绝对像素)。
 * · 闪烁用全局 uTime → `prefers-reduced-motion` 下 uTime 被钉住,两帧逐像素相同(闸门④)。
 * · 遮罩来自 2D canvas(左上原点),而 gl_FragCoord 左下原点 → 采样时 y 翻转。
 * · 遮罩通道:R = 清空区(留白,抑制该处环境星);G = 标题/星座亮度。
 * · GLSL 注释里**一个反引号都不能有**(模板串会被提前截断,skill §3)。
 */
export const SRC = `
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
`;
