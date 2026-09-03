/**
 * golden/w3/build.ts —— 把 W2 的 field 与 W3 的 shade 拼成验证壳,并生成环境列 LUT。
 *
 *   node_modules/.bin/tsx golden/w3/build.ts
 *
 * 产出:
 *   golden/w3/preview.frag        —— 渲染台吃的完整片元着色器
 *   golden/w3/env-{mid,near,night}.png —— 1×256 R8 环境列 LUT(--tex 绑上去)
 *
 * 之所以用脚本拼而不是手抄一份 preview.frag:W2 的 golden/w2/preview.frag 是
 * 手抄的,field.glsl.ts 一改就悄悄漂移。这里 import 模块源码,漂不了。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SRC as FIELD } from "../../src/components/lab/water/field.glsl";
import { SRC as SHADE } from "../../src/components/lab/water/shade.glsl";
import {
  ENV_PRESETS,
  ENV_LUT_SIZE,
  buildEnvColumnLut,
} from "../../src/components/lab/water/env-column";

const HERE = path.dirname(new URL(import.meta.url).pathname);

const HEAD = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2  uRes;
uniform float uTime;
`;

/* 抖动壳:W4 会换成正式模块,这里沿用 W2 preview 的写法,保证与 W2 的分数可比。 */
const TAIL = `
uniform float uPixel;       // 抖动单元(物理 px)
uniform float uDitherAniso; // 0 = 各向同性,1 = 强横向拉长
uniform float uQuantize;    // 0 = 连续灰度(调物理时必须先看这个),1 = 两色抖动
uniform vec3  uInk;
uniform vec3  uPaper;
uniform sampler2D uBlueNoise;
uniform vec2 uBlueNoiseSize;

float waterDither(vec2 p){ return texture(uBlueNoise, (p + 0.5) / uBlueNoiseSize).r; }

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 ndc  = (frag / uRes) * 2.0 - 1.0;
  vec2 p; vec3 rd;
  float lum;
  if (!waterSurfacePoint(ndc, uRes.x / uRes.y, p, rd)) {
    lum = waterTonemap(waterShadeSky(rd));
  } else {
    float footprint = max(fwidth(p.x), fwidth(p.y));
    vec3 N; float sigma2;
    waterNormalRough(p, uTime, footprint, N, sigma2);
    lum = waterTonemap(waterShadeSurface(N, rd, sigma2));
  }
  if (uQuantize < 0.5){ fragColor = vec4(vec3(lum), 1.0); return; }
  vec2 dp = floor(frag / uPixel);
  dp.x = floor(dp.x * mix(1.0, 0.30, uDitherAniso));
  fragColor = vec4(mix(uInk, uPaper, step(waterDither(dp), lum)), 1.0);
}
`;

mkdirSync(HERE, { recursive: true });
writeFileSync(path.join(HERE, "preview.frag"), HEAD + FIELD + SHADE + TAIL);

/* 扫参用:`--set night.glowWidth=0.012` 临时覆盖某个 preset 的环境列参数。
 * 定稿值一律写回 env-column.ts 的 ENV_PRESETS,这里只是省一次编辑往返。 */
const OVERRIDES = new Map<string, number>();
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== "--set") continue;
  const [k, v] = String(process.argv[i + 1]).split("=");
  OVERRIDES.set(k, Number(v));
}

async function writeLuts(): Promise<void> {
  for (const key of ["mid", "near", "night"] as const) {
    const p: Record<string, unknown> = { ...ENV_PRESETS[key] };
    for (const [k, v] of OVERRIDES) {
      const [pk, field] = k.split(".");
      if (pk === key) p[field] = v;
    }
    const lut = buildEnvColumnLut(p as unknown as typeof ENV_PRESETS.mid);
    await sharp(Buffer.from(lut), { raw: { width: ENV_LUT_SIZE, height: 1, channels: 1 } })
      .png()
      .toFile(path.join(HERE, `env-${key}.png`));
  }
  console.log("  golden/w3/preview.frag + env-{mid,near,night}.png 已生成");
}
void writeLuts();
