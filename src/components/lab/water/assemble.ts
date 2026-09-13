/**
 * assemble.ts —— 片元着色器的**唯一拼装处**(W8 建立)
 *
 * W2 手抄过一份 `golden/w2/preview.frag`,`field.glsl.ts` 一改它就悄悄漂移
 * (docs §11 坑 7)。W3 用 `golden/w3/build.ts` 拼装解决了那一次;W8 又要在
 * React 组件里拿到同一份着色器 —— 于是把拼装本身抽到这里,
 * `golden/w3/build.ts` 与 `water-scene.tsx` **都调它**,不许各拼各的。
 *
 * ⚠️ 本文件做**值**导入(五个 `.glsl.ts`),所以只能被打包器(Next)与
 * `tsx` 加载,**不能**被裸 node 直接 import —— `golden/w3/run.mjs` 与
 * `scripts/gen-water-preview.mjs` 都不碰它,它们读 `build.ts` 的产物。
 */
import { SRC as DITHER } from "./dither.glsl";
import { SRC as FIELD } from "./field.glsl";
import { SRC as LIGHT } from "./light.glsl";
import { SRC as RIPPLE } from "./ripple.glsl";
import { SRC as SHADE } from "./shade.glsl";
import { SRC as SKYSTARS } from "./sky-stars.glsl";

/** 版本声明 + 三个全局 uniform。所有模块都假定它在最前面。 */
export const WATER_FRAG_HEAD = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2  uRes;
uniform float uTime;
`;

/**
 * `main()`。逆投影 → 天空 / 水面两条分支 → tonemap → 抖动量化。
 *
 * `footprint` 用 `fwidth(p)` 取,所以 LOD 是**屏幕空间**的:同一片水面在
 * 远端占的像素少 → footprint 大 → 高频分量提前淡出。
 */
export const WATER_FRAG_TAIL = `
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
`;

/**
 * 拼出完整的片元着色器。**顺序不是随手排的**:
 *
 * `HEAD + RIPPLE + FIELD + LIGHT + SHADE + SKYSTARS + DITHER + TAIL`
 *
 * · **RIPPLE 在 FIELD 之前**(W6):`waterWaveField` 末尾那段涟漪耦合要用
 *   `uRippleAmp` 写关闭分支,而 GLSL 不许同一个 uniform 声明两次 ——
 *   所以它必须先声明。涟漪模块是叶子(不调 FIELD 的任何函数),前移没有代价。
 * · **LIGHT 在 FIELD 与 SHADE 之间**(W5):SHADE 要调 LIGHT 的照度,
 *   LIGHT 要用 FIELD 的世界坐标约定,而 FIELD 的 `waterPatchAmp` 又要调
 *   LIGHT 的 `orbPatch` —— 这一处前向依赖用 `field.glsl.ts` 里的**前置声明**
 *   解决(GLSL ES 3.00 支持),其余顺序不动。
 * · **DITHER 必须在 TAIL 之前**(W4):`main()` 调 `waterDitherApply`。
 * · **SKYSTARS 在 SHADE 之后、DITHER 之前**:`main()` 天空分支调 `waterSkyStars`,
 *   它是叶子模块(只用 HEAD 的 uRes/uTime + 自己的 uniform),放哪都行,排在 SHADE 后语义清晰。
 *   默认贡献 0(增益默认 0),不影响任何 preset 的金标帧(闸门安全)。
 */
export function assembleWaterFragment(): string {
  return (
    WATER_FRAG_HEAD + RIPPLE + FIELD + LIGHT + SHADE + SKYSTARS + DITHER + WATER_FRAG_TAIL
  );
}
