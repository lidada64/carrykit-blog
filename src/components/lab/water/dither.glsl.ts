/**
 * dither.glsl.ts —— W4 量化呈现层
 *
 * 把连续亮度 `lum` 变成两色 1-bit 画面的最后一步。只管**阈值与配色**:
 * 不碰波形(W2 的 `field.glsl.ts`),不碰亮度分布(W3 的 `shade.glsl.ts`)。
 *
 * 契约(计划 §3):
 *  · uniform 一律 `uDither` 前缀,函数一律 `water` 前缀 —— 五个模块拼装时 grep 不撞车。
 *  · 对外两个入口:
 *      float waterDitherThreshold(vec2 frag)            // 屏幕像素 → 阈值 [0,1)
 *      vec3  waterDitherApply(vec2 frag, float lum)     // 亮度 → 最终 RGB
 *    `waterDitherApply` 在 `uDitherQuantize < 0.5` 时直接返回 `vec3(lum)`(连续灰度),
 *    调物理时必须先看这一路——抖动会掩盖问题(W1 教训)。
 *
 * ── 四条不可改的东西 ────────────────────────────────────────────────────
 *
 * ① **阈值图必须是蓝噪声,不能是 Bayer / IGN / 白噪声。**
 *    评分器和人眼都是靠**局部平均**从 1-bit 图里读水面,这一步等于对抖动做低通。
 *    9×9 平均后的残余(ADR §4.2 实测):
 *        Bayer 8×8      低频干净,但能量堆在网格谐波 → 满屏十字纹,谱尖峰度 64%
 *        IGN(粗化后)   斜向布纹,谱尖峰度 76%
 *        哈希白噪声      ≈11.3 灰阶 → 水面起伏只有几个灰阶,被淹掉,相干度 0.95→0.34
 *        void-and-cluster 蓝噪声 128²  3.4~4.2 灰阶 → 相干度回到 0.78~0.90
 *    **任何"改进"抖动的想法,先问它会不会抬高这个残余。**
 *    资产:`scripts/gen-blue-noise.mjs` + `public/water/blue-noise-{64,128}.png`,
 *    渲染台默认用 128²。生成器里有 5 阈值自检,别只测 0.5(ADR §4.1 的第 2 次翻车)。
 *
 * ② **阈值锚在屏幕像素,不锚世界坐标。**
 *    `waterDitherThreshold` 只吃 `gl_FragCoord.xy`,不吃 `uTime`、不吃逆投影出来的
 *    水面坐标 `p`。锚世界坐标会让颗粒随镜头/波面「游动」,是纸面质感最刺眼的破绽;
 *    锚屏幕像素则画面静止时逐像素完全一致(`scripts/water-dither-check.mjs` 验)。
 *
 * ③ **各向异性不是"越大越好",默认也不是 0.65。**
 *    `uDitherAniso` 只横向压缩采样坐标(纵向不动),让噪声颗粒被横向拉长。
 *    W3 结题写过「用它把划线拉长」——那是对着**坏掉的** `dashAspect` 得出的,
 *    方向是反的(docs §9 坑 6)。修正口径下:mid 的划线已经够长(2.23 / 基线 3.5),
 *    near 本来偏长(aniso=0.8 时 3.17 / 基线 1.5),**归零**才压回 2.00 进区间。
 *    现在的 near=0 / mid=0.8 / night=0 是扫参出来的,要改得拿新扫参 + 肉眼对比说话。
 *
 * ④ **`uDitherInk` / `uDitherPaper` 由组件从 CSS token 读入,不许在组件里写字面量。**
 *    唯一定义处是 `src/styles/globals.css` 的 `:root`:`--water-ink` / `--water-paper`
 *    (AGENTS.md「扩展性接口红线」)。默认值 #32331A / #E6FEFD 是《奥伯拉丁的回归》
 *    截图的实测取样(暗占 81.1%、亮占 3.8%)。
 *    **极性不许翻**:暗 = 墨、亮 = 纸。标尺按 baseline 指定的 polarity 判墨点侧
 *    (docs §4 坑 4),翻极性会让 `featureCoverage` 直接量反。暗色模式也只压亮度,
 *    不换角色。
 */
export const SRC = `
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
`;
