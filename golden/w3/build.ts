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
import { SRC as DITHER } from "../../src/components/lab/water/dither.glsl";
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

/* W4 起抖动走 `dither.glsl.ts` 正式模块(uDither 前缀),TAIL 里只剩 main()。
 * 拼装顺序 HEAD + FIELD + SHADE + DITHER + TAIL —— DITHER 必须在 TAIL 之前,
 * GLSL 没有前向声明。 */
const TAIL = `
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
  fragColor = vec4(waterDitherApply(frag, lum), 1.0);
}
`;

mkdirSync(HERE, { recursive: true });
writeFileSync(path.join(HERE, "preview.frag"), HEAD + FIELD + SHADE + DITHER + TAIL);

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
