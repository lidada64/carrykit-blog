/**
 * sky-stars.glsl.ts —— 天空**均匀粒子** + 标题(稀疏粒子) + 悬停发散成矩形播动画(/lab/sky-screen)
 *
 * 认知:water 夜空是光滑辐射(shade.glsl 的 waterShadeSky),屏幕上的「粒子」= 它被 main() 的共用
 * 蓝噪声**抖动**出的墨/纸点。本模块在 tonemap+抖动**之前**往天空辐射上叠一层**离散星点**(屏幕网格
 * → 上下同密的均匀粒子)+ 标题/画面(也用星点构成),于是一切都过同一套抖动/色板 = 结构统一,不糊层。
 *
 * 两段(标题粒子已移到独立 overlay 模块 particle-burst.tsx,这里不再画标题):
 *  ① 均匀星场:屏幕网格离散星点,挖空区让位。挖空随 open 渐变:标题态=标题形状负空间(给 overlay 粒子
 *     留暗底),全开=视频矩形。
 *  ② 中央 3D 视频:图集按帧采样(alpha=形状),letterbox 居中,随 open 淡入。**不画边框**(画框已取消)。
 *
 * ── 闸门安全(红线)── uSkyStarGain / uSkyTitleGain **默认 0** → `waterSkySignal` 精确返回 0.0
 *    → 天空辐射逐字节不变 → 四道闸门 / 金标帧照旧。只有 sky-screen 变体喂增益 + 遮罩/图集才激活。
 *
 * ── 约定 ── 屏幕 UV 采样(DPR 安全);遮罩/图集左上原点、上传 FLIP_Y=false → 采样翻 y;
 *    uSkyTitleMask.R=gap 负空间 / .G=标题字形;uSkyScreenRect=(left,top,w,h) 屏幕 UV(top 从上量);
 *    图集帧号 f=floor(phase*count),col=mod(f,cols)/row=floor(f/cols),行从上往下。
 *    GLSL 注释里**一个反引号都不能有**(skill 3)。
 */
export const SRC = `
uniform float     uSkyStarGain;      // 均匀星场增益(0 = 关,默认)
uniform float     uSkyStarDensity;   // 星场稀疏阈值 0..1(越大越稀)
uniform float     uSkyDim;           // 全局压暗 0..1(灯球坠落:抬高 clear 乘暗基础天空 → 天空自身抖动颗粒变稀;默认 0=不变,闸门安全)
uniform float     uSkyTitleGain;     // 标题/画面粒子增益(0 = 关,默认)
uniform float     uSkyTitleDensity;  // 标题/画面粒子稀疏阈值 0..1(越大越稀 → 标题更疏)
uniform float     uSkyTitleFade;     // 标题暗底淡出 0..1(默认 0=显示;下滑爆开时 →1 让暗底随粒子散去,不显视频)
uniform sampler2D uSkyTitleMask;     // R = gap 负空间 / G = 标题字形
uniform vec2      uSkyTitleMaskSize; // 纹理尺寸(保留契约)

uniform float     uSkyScreenGain;    // 屏幕动画闸门(0 = 不采样图集,默认)
uniform float     uSkyScreenProgress;// 悬停进度 0..1(0=标题, 1=矩形+动画)
uniform float     uSkyScreenPhase;   // 动画相位 0..1(帧号 = floor(phase*count))
uniform float     uSkyScreenCount;   // 动画总帧数
uniform vec2      uSkyScreenGrid;    // 图集网格 (cols, rows)
uniform vec4      uSkyScreenRect;    // 矩形/画面 (left, top, w, h) 屏幕 UV,top 从上量
uniform sampler2D uSkyScreenAtlas;   // 动画图集(alpha = 形状)

float waterSkyHash2(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

/* 离散星点:屏幕按 gridN 划格,每格至多一颗随机圆点。radius = 点半径(大 → 点胖、填得满 = 更密观感)。
 * sparsity 决定多少格无星。返回 [0,~1] 亮度。闪烁用 uTime(RM 冻结)。 */
float waterStarPoints(vec2 uv, vec2 gridN, float sparsity, float radius){
  vec2 g  = uv * gridN;
  vec2 id = floor(g);
  vec2 f  = fract(g);
  float h = waterSkyHash2(id);
  if (h < sparsity) return 0.0;
  vec2 c  = vec2(waterSkyHash2(id + 3.1), waterSkyHash2(id + 7.7));
  float d = length(f - c);
  float star = smoothstep(radius, 0.0, d);
  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + 2.4 * h) + h * 30.0);
  return star * tw;
}

/* 屏幕 UV → 矩形局部坐标 lc(0..1 在框内;<0 / >1 在框外)。top 从上量 → 先转 yTop。 */
vec2 waterRectLocal(vec2 uv){
  float yTop = 1.0 - uv.y;
  return vec2((uv.x - uSkyScreenRect.x) / max(uSkyScreenRect.z, 1e-4),
              (yTop  - uSkyScreenRect.y) / max(uSkyScreenRect.w, 1e-4));
}

/* 动画掩码:按 lc 采当前帧图集 cell(行从上往下 → v = (row+lc.y)/rows,配 FLIP_Y=false)。 */
float waterScreenMask(vec2 lc){
  if (lc.x < 0.0 || lc.x > 1.0 || lc.y < 0.0 || lc.y > 1.0) return 0.0;
  float f = floor(uSkyScreenPhase * uSkyScreenCount);
  float col = mod(f, uSkyScreenGrid.x);
  float row = floor(f / uSkyScreenGrid.x);
  vec2 auv = vec2((col + lc.x) / uSkyScreenGrid.x, (row + lc.y) / uSkyScreenGrid.y);
  return clamp(texture(uSkyScreenAtlas, auv).a, 0.0, 1.0);
}

/* 软矩形:lc 在 [0,1]^2 内为 1、带 feather 羽化边(避免硬框像糊上去的 box)。 */
float waterSoftRect(vec2 lc, float fe){
  vec2 s = smoothstep(vec2(-fe), vec2(fe), lc) * (1.0 - smoothstep(vec2(1.0 - fe), vec2(1.0 + fe), lc));
  return s.x * s.y;
}

/* 返回 (clear, signal):
 *   clear  = 负空间遮罩 —— TAIL 用它**乘暗基础天空**,清出干净的中间空隙(不只压我加的星场,
 *            连天空自身的抖动颗粒也一并压掉),前景粒子才读得出、不与背景糊在一起。
 *   signal = 前景亮度 —— 均匀星场(clear 外)+ 标题稀疏粒子(悬停发散淡出)+ 悬停矩形边框/动画。
 * 两个主增益全 0(默认)→ 返回 (0,0) → 基础天空 x(1-0)+0 = 原样(闸门安全,逐字节不变)。 */
vec2 waterSkyLayer(vec2 frag){
  if (uSkyStarGain <= 0.0 && uSkyTitleGain <= 0.0 && uSkyDim <= 0.0) return vec2(0.0);
  vec2 uv = frag / uRes;
  float progress = clamp(uSkyScreenProgress, 0.0, 1.0);

  float open = progress;  // 中央开合量(0=标题态挖空, 1=视频矩形全开);标题粒子已移到 overlay 模块

  vec2 muv = vec2(uv.x, 1.0 - uv.y);
  float gapTitle = clamp(texture(uSkyTitleMask, muv).r, 0.0, 1.0);  // 标题态:软标题负空间(给 overlay 粒子留暗底)

  // 挖空随开合渐变:标题态 = 标题形状负空间;全开 = 视频矩形。**大羽化**(0.22)→ 暗区从 0 平滑升到中心,
  //  边缘柔和溶解、不再是生硬矩形。**不画边框**(用户已取消画框)。
  vec2 lc = waterRectLocal(uv);
  float rectSoft = waterSoftRect(lc, 0.22);
  // uSkyTitleFade:下滑爆开(无视频)时把标题暗底随粒子散去淡掉;click 展示 3D 时 fade=0、open→1 morph 成视频矩形。
  float clear = mix(gapTitle * (1.0 - clamp(uSkyTitleFade, 0.0, 1.0)), rectSoft, open);
  // 全局压暗(灯球坠落):抬高 clear 去乘暗基础天空 —— 连天空自身的抖动颗粒一并压掉,剩余天空粒子更稀。
  clear = clear + (1.0 - clear) * clamp(uSkyDim, 0.0, 1.0);

  // ① 均匀星场(屏幕网格 → 上下同密);清出区让位。
  float pts = waterStarPoints(uv, vec2(150.0, 94.0), uSkyStarDensity, 0.18);
  float ambient = uSkyStarGain * pts * (1.0 - clear);

  // ② 中央 3D 视频(图集按当前帧采样,alpha=形状):按相框高度 letterbox 居中成方形,不拉伸;随 open 淡入。
  //    画面也乘同一软边(rectSoft)→ 在框边渐隐,不出现硬切。uSkyScreenGain 兼作闸门(缺图集强钉 0)+ 亮度。
  vec2 pxSz = vec2(uSkyScreenRect.z * uRes.x, uSkyScreenRect.w * uRes.y);
  float aspect = pxSz.y / max(pxSz.x, 1e-4);
  float animLx = (lc.x - 0.5) / max(aspect, 1e-4) + 0.5;
  float anim = (uSkyScreenGain > 0.0 && animLx >= 0.0 && animLx <= 1.0)
             ? waterScreenMask(vec2(animLx, lc.y)) : 0.0;
  float video = uSkyScreenGain * anim * open * rectSoft;

  return vec2(clamp(clear, 0.0, 1.0), ambient + video);
}
`;
