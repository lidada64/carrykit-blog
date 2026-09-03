#!/usr/bin/env node
/**
 * golden/w3/run.mjs —— 三个 preset 的渲染 + 跑分入口(W3 扫参用)
 *
 *   node golden/w3/run.mjs <mid|near|night> [--time 2.5] [--out /tmp/x.png]
 *                          [--raw] [--set uX=1 ...] [--noscore]
 *
 * --raw = uQuantize 0(连续灰度)。**调物理时先看这个**,抖动会掩盖问题(W1 教训)。
 * 未被 --set 覆盖的 uniform 走下面 PRESETS 里的值;PRESETS 就是 W3 的交付参数,
 * 与 scripts/water-harness.mjs 里 mid 的默认值保持一致。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

/** 三个 preset 的相机 + 波场 + 着色参数。空字符串表示用渲染台默认值。 */
export const PRESETS = {
  mid: {
    baseline: "mid",
    lut: "golden/w3/env-mid.png",
    set: {
      uPixel: 2, uDitherAniso: 0.8,
      uFieldCamHeight: 1.6, uFieldCamPitch: 0.37, uFieldFovY: 0.61,
      uFieldFetchLen: 7.0, uFieldLodBias: 5.0, uFieldAmp: 1.5,
      uShadeEnvLutScale: 2.0, uShadeEnvLutMin: -0.2, uShadeEnvLutMax: 1.0,
      uShadeBody: 0.62, uShadeEnvGain: 1.0,
      uShadeSpecGain: 0.0, uShadeLightOmega: 6.8e-5,
      uShadeLightElev: 0.35, uShadeLightAz: 0.0,
      uShadeSigmaFloor: 2e-4, uShadeSpecClip: 1.5,
      uShadeExposure: 0.0, uShadeContrast: 8.0, uShadePivot: 0.48, uShadeSkyGain: 1.0,
    },
  },
  near: {
    baseline: "near",
    lut: "golden/w3/env-near.png",
    set: {
      uPixel: 2, uDitherAniso: 0.8,
      uFieldCamHeight: 0.35, uFieldCamPitch: 0.335, uFieldFovY: 0.553,
      uFieldFetchLen: 1.5, uFieldLodBias: 5.0, uFieldAmp: 1.5,
      uShadeEnvLutScale: 2.0, uShadeEnvLutMin: -0.2, uShadeEnvLutMax: 1.0,
      uShadeBody: 0.62, uShadeEnvGain: 1.0,
      uShadeSpecGain: 0.0, uShadeLightOmega: 6.8e-5,
      uShadeLightElev: 0.35, uShadeLightAz: 0.0,
      uShadeSigmaFloor: 2e-4, uShadeSpecClip: 1.5,
      uShadeExposure: 0.0, uShadeContrast: 12.0, uShadePivot: 0.575, uShadeSkyGain: 1.0,
    },
  },
  night: {
    baseline: "night",
    lut: "golden/w3/env-night.png",
    set: {
      uPixel: 2, uDitherAniso: 0.0,
      uFieldCamHeight: 4.0, uFieldCamPitch: -0.1413, uFieldFovY: 0.61,
      uFieldFetchLen: 7.0, uFieldLodBias: 1.0, uFieldAmp: 0.6,
      uShadeEnvLutScale: 2.0, uShadeEnvLutMin: -0.2, uShadeEnvLutMax: 1.0,
      uShadeBody: 0.02, uShadeEnvGain: 1.0,
      uShadeSpecGain: 100000.0, uShadeLightOmega: 6.8e-5,
      uShadeLightElev: 0.08, uShadeLightAz: 0.0,
      uShadeSigmaFloor: 2e-4, uShadeSpecClip: 4.0,
      uShadeExposure: 0.0, uShadeContrast: 8.0, uShadePivot: 0.22, uShadeSkyGain: 1.0,
    },
  },
};

const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith("--")) ?? "mid";
const preset = PRESETS[name];
if (!preset) { console.error(`未知 preset: ${name}`); process.exit(1); }

const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const time = flag("--time", "2.5");
const out = flag("--out", `/tmp/w3-${name}.png`);

const set = { ...preset.set };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--set") continue;
  const [k, v] = argv[i + 1].split("=");
  set[k] = Number(v);
}
if (argv.includes("--raw")) set.uQuantize = 0;

const args = [
  "scripts/water-harness.mjs",
  "--shader", "golden/w3/preview.frag",
  "--out", out,
  "--time", time,
  "--tex", "uBlueNoise=public/water/blue-noise-128.png",
  "--tex", `uShadeEnvLut=${preset.lut}`,
];
for (const [k, v] of Object.entries(set)) args.push("--set", `${k}=${v}`);

const r = spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
if (r.status !== 0) { console.log(r.stdout, r.stderr); process.exit(1); }
if (r.stderr.trim()) console.log(r.stderr.trim());
if (argv.includes("--noscore")) { console.log(`  → ${out}`); process.exit(0); }

const m = spawnSync("node", ["scripts/water-metrics.mjs", out, "--baseline", preset.baseline],
  { cwd: ROOT, encoding: "utf8" });
console.log(m.stdout);
