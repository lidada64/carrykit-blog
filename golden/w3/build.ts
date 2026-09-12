/**
 * golden/w3/build.ts —— 把五个 `.glsl.ts` 拼成验证壳,并生成环境列 LUT。
 *
 *   node_modules/.bin/tsx golden/w3/build.ts
 *
 * 产出:
 *   golden/w3/preview.frag        —— 渲染台吃的完整片元着色器
 *   golden/w3/env-{mid,near,night}.png —— 1×256 R8 环境列 LUT(--tex 绑上去)
 *
 * 之所以用脚本拼而不是手抄一份 preview.frag:W2 的 golden/w2/preview.frag 是
 * 手抄的,field.glsl.ts 一改就悄悄漂移。这里 import 模块源码,漂不了。
 *
 * **W8 起拼装本身搬进 `src/components/lab/water/assemble.ts`** ——
 * 站点组件(`water-scene.tsx`)也要同一份着色器,两边各拼各的就是
 * 手抄 preview.frag 那个坑的翻版。本文件只负责"写到磁盘"这一步。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { assembleWaterFragment } from "../../src/components/lab/water/assemble";
import { RIPPLE_IMPULSE_SLOTS as GLSL_SLOTS } from "../../src/components/lab/water/ripple.glsl";
import { RIPPLE_IMPULSE_SLOTS as TS_SLOTS } from "../../src/components/lab/water/ripple";
import {
  ENV_PRESETS,
  ENV_LUT_SIZE,
  buildEnvColumnLut,
} from "../../src/components/lab/water/env-column";
import type { EnvLight } from "../../src/components/lab/water/env-column";
import { ORB_MAX_SPOTS } from "../../src/components/lab/water/contract";
import { DEFAULT_ORB_LIGHT_CONFIG } from "../../src/components/lab/water/orb-light";
import {
  WATER_PRESETS,
  WATER_PRESET_CAMERAS,
  WATER_PRESET_ORB_POSES,
} from "../../src/components/lab/water/presets";
import {
  WATER_CAMERA_STOPS,
  WATER_ORB_STOPS,
  WATER_IMPULSE_SCALES,
  type WaterPresetName,
} from "../../src/components/lab/water/water-director";

/* ────────────────────────────────────────────────────────────────────────
 * 防漂移断言。本文件是唯一一个能同时 import 到所有这些模块的地方
 * ——`orb-light.ts` / `ripple.ts` / `water-director.ts` / `presets.ts` 都受
 * 「只许 import type」的约束(裸 node 加载不了省略扩展名的**值**导入,
 * 见各文件头),于是同一个常数在两处各写了一遍。W8 把这些断言集中到这里,
 * 不一致时**红着脸失败**,而不是像 docs §11 坑 7 那样沉默着跑出错画面。
 * ──────────────────────────────────────────────────────────────────────── */

const PRESET_NAMES: WaterPresetName[] = ["near", "mid", "night"];

/** ① 光斑数:CPU 打包的 Float32Array 长度 vs GLSL 数组长度。对不上 WebGL **不报错**。 */
if (DEFAULT_ORB_LIGHT_CONFIG.maxSpots !== ORB_MAX_SPOTS) {
  throw new Error(
    `orb 光斑数不一致:contract.ts ORB_MAX_SPOTS=${ORB_MAX_SPOTS} ` +
      `vs orb-light.ts maxSpots=${DEFAULT_ORB_LIGHT_CONFIG.maxSpots}`,
  );
}

/** ② 涟漪冲击槽位数(W6)。同样是"长度对不上就默默少注入几个冲击"。 */
if (GLSL_SLOTS !== TS_SLOTS) {
  throw new Error(
    `ripple 冲击槽位数不一致:ripple.glsl.ts=${GLSL_SLOTS} vs ripple.ts=${TS_SLOTS}`,
  );
}

const eq = (what: string, a: number, b: number, srcA: string, srcB: string): void => {
  if (a !== b) throw new Error(`${what} 漂移:${a}(${srcA}) vs ${b}(${srcB})`);
};

for (const name of PRESET_NAMES) {
  const preset = WATER_PRESETS[name];

  /** ③ 相机:presets.ts 的 uniform vs presets.ts 的 camera 块 vs director 的停靠点。 */
  const cam = WATER_PRESET_CAMERAS[name];
  const stop = WATER_CAMERA_STOPS[name];
  eq(`${name}.camHeight`, preset.set.uFieldCamHeight, cam.camHeight, "set", "camera");
  eq(`${name}.camPitch`, preset.set.uFieldCamPitch, cam.camPitch, "set", "camera");
  eq(`${name}.fovY`, preset.set.uFieldFovY, cam.fovY, "set", "camera");
  eq(`${name}.camHeight`, cam.camHeight, stop.camHeight, "presets.ts", "water-director.ts");
  eq(`${name}.camPitch`, cam.camPitch, stop.camPitch, "presets.ts", "water-director.ts");
  eq(`${name}.fovY`, cam.fovY, stop.fovY, "presets.ts", "water-director.ts");

  /** ④ 球位(W8 新增):滚动插值的端点必须与跑分用的球位是同一组数。
   *  漂了的症状正是 W7 挖出来的那件事 —— 相机滚过去了球没跟上,灯直接熄。 */
  const pose = WATER_PRESET_ORB_POSES[name];
  const orbStop = WATER_ORB_STOPS[name];
  eq(`${name}.orb.screenY`, pose.screenY, orbStop.screenY, "presets.ts", "water-director.ts");
  eq(`${name}.orb.radiusNdc`, pose.radiusNdc, orbStop.radiusNdc, "presets.ts", "water-director.ts");
  eq(`${name}.orb.worldRadius`, pose.worldRadius, orbStop.worldRadius, "presets.ts", "water-director.ts");

  /** ⑤ 冲击尺度(W7):director 的 click 档就是 W6 给 preset 定标的那一发。 */
  const scale = WATER_IMPULSE_SCALES[name];
  const rp = preset.ripple;
  if (rp) {
    const parts = rp.impulse.split(",").map(Number);
    eq(`${name}.clickStrength`, parts[2], scale.clickStrength, "presets.ts", "water-director.ts");
    eq(`${name}.clickRadius`, parts[3], scale.clickRadius, "presets.ts", "water-director.ts");
  } else if (scale.clickRadius !== 0 || scale.clickStrength !== 0) {
    throw new Error(`${name} 没有 ripple 块,但 water-director.ts 给了非零冲击尺度`);
  }
}

/* ──────────────────────────────────────────────────────────────────────── */

const HERE = path.dirname(fileURLToPath(import.meta.url));

mkdirSync(HERE, { recursive: true });
/* 拼装顺序与理由全在 assemble.ts —— 这里只是把它写到磁盘。 */
writeFileSync(path.join(HERE, "preview.frag"), assembleWaterFragment());

/* 扫参用:`--set night.glowWidth=0.012` 临时覆盖某个 preset 的环境列参数。
 * 定稿值一律写回 env-column.ts 的 ENV_PRESETS,这里只是省一次编辑往返。 */
const OVERRIDES = new Map<string, number>();
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== "--set") continue;
  const [k, v] = String(process.argv[i + 1]).split("=");
  OVERRIDES.set(k, Number(v));
}

/* W5:往某个 preset 的环境列**注入一个光源**(灯球在水里的倒影 / 夜景的月晕)。
 *   --env-light night=0.179,0.085,0.055     (sinElev, width, gain)
 * 不给 = 一个都不注入 = LUT 与 W3/W4 定稿逐字节相同,这是 §5 md5 回归的前提。 */
const INJECT = new Map<string, EnvLight[]>();
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== "--env-light") continue;
  const [pk, spec] = String(process.argv[i + 1]).split("=");
  const [sinElev, width, gain] = String(spec).split(",").map(Number);
  const list = INJECT.get(pk) ?? [];
  list.push({ sinElev, width, gain });
  INJECT.set(pk, list);
}

async function writeLuts(): Promise<void> {
  for (const key of ["mid", "near", "night"] as const) {
    const p: Record<string, unknown> = { ...ENV_PRESETS[key] };
    for (const [k, v] of OVERRIDES) {
      const [pk, field] = k.split(".");
      if (pk === key) p[field] = v;
    }
    const inj = INJECT.get(key);
    if (inj) p.lights = [...(p.lights as EnvLight[]), ...inj];
    const lut = buildEnvColumnLut(p as unknown as typeof ENV_PRESETS.mid);
    await sharp(Buffer.from(lut), { raw: { width: ENV_LUT_SIZE, height: 1, channels: 1 } })
      .png()
      .toFile(path.join(HERE, `env-${key}.png`));
  }
  console.log("  golden/w3/preview.frag + env-{mid,near,night}.png 已生成");
}
void writeLuts();
