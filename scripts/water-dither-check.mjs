#!/usr/bin/env node
/**
 * water-dither-check.mjs —— W4 抖动层的四项自测
 *
 *   node scripts/water-dither-check.mjs [--keep] [--out /tmp/w4-check]
 *
 * 跑四件 `water-metrics.mjs` 量不到的事(它只看单张成品图,看不到「同一场景两次
 * 渲染是否一致」「换个阈值图会差多少」):
 *
 *   A 确定性     同一 uTime 连渲两次,逐像素差必须为 0
 *   B 时间稳定性 uTime 变化时阈值图本身不许动。用 night preset 的**天空区**验:
 *                waterShadeSky(rd) 与 t 无关,所以那片像素的 lum 恒定;
 *                若阈值图跟着 t 走,天空的墨点必然重排。
 *   C 线性度     左黑右白的线性梯度当 lum 输入,量暗覆盖率对亮度的线性度 R²
 *                与谱尖峰度 gridArtifact
 *   D 对照       同一梯度 / 同一水面场景换成 Bayer 8×8 与 IGN 阈值,量 gridArtifact
 *                ——这是蓝噪声这个模块存在的理由,数字要能复现 W1 的 64% / 76%
 *
 * 谱尖峰度的算法(fft / meanSpectrum / spikiness / HF_CUTOFF)是从
 * `scripts/water-metrics.mjs` 抄过来的,那边是**唯一权威**;这里复制而不是 import,
 * 是因为 water-metrics.mjs 有顶层 argv 解析,import 会把它当命令行工具跑起来。
 * 改那边的算法时记得同步这里,否则两边的 gridArtifact 会悄悄不可比。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const WORK = arg("--out", "/tmp/w4-check");
const KEEP = argv.includes("--keep");
const W = 1920;
const H = 1080;
const NOISE = "public/water/blue-noise-128.png";

mkdirSync(WORK, { recursive: true });

/* ═══════════════════════ 谱尖峰度(镜像 water-metrics.mjs)═══════════════ */

const HF_CUTOFF = 0.4; // 只看 0.4×Nyquist 以上(波长 <5px)

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function meanSpectrum(rows, len) {
  let n = 1;
  while (n < len) n <<= 1;
  const acc = new Float64Array(n / 2);
  const win = new Float64Array(len);
  for (let i = 0; i < len; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
  for (const row of rows) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    let mean = 0;
    for (let i = 0; i < len; i++) mean += row[i];
    mean /= len;
    for (let i = 0; i < len; i++) re[i] = (row[i] - mean) * win[i];
    fft(re, im);
    for (let k = 0; k < n / 2; k++) acc[k] += Math.hypot(re[k], im[k]);
  }
  for (let k = 0; k < acc.length; k++) acc[k] /= rows.length;
  return acc;
}

const median = (a) => {
  const s = Float64Array.from(a).sort();
  return s.length ? s[s.length >> 1] : 0;
};

function spikiness(spec) {
  const lo = Math.floor(spec.length * HF_CUTOFF);
  let total = 0;
  let spike = 0;
  const WIN = 15;
  for (let k = lo; k < spec.length; k++) {
    const a = Math.max(lo, k - WIN);
    const b = Math.min(spec.length, k + WIN + 1);
    const med = median(spec.slice(a, b));
    const p = spec[k] * spec[k];
    total += p;
    if (spec[k] > 8 * med) spike += p;
  }
  return total > 0 ? spike / total : 0;
}

/** 墨点掩码(±1)上的谱尖峰度,行/列取大者,与 water-metrics 的 bilevel 分支同口径。 */
function gridArtifactOf(mask, w, h) {
  const a = new Float64Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = mask[i] ? 1 : -1;
  const rows = [];
  for (let y = 0; y < h; y += 3) rows.push(a.subarray(y * w, y * w + w));
  const cols = [];
  for (let x = 0; x < w; x += 7) {
    const c = new Float64Array(h);
    for (let y = 0; y < h; y++) c[y] = a[y * w + x];
    cols.push(c);
  }
  return 100 * Math.max(spikiness(meanSpectrum(rows, w)), spikiness(meanSpectrum(cols, h)));
}

/* ═══════════════════════ 着色器拼装 ═══════════════════════════════════════ */

/** 从 .glsl.ts 里抠出模板串(与 water-harness.mjs 的 loadShader 同一个正则)。 */
function loadModule(p) {
  const raw = readFileSync(path.join(ROOT, p), "utf8");
  const m = raw.match(/export\s+const\s+\w+\s*(?::\s*string\s*)?=\s*`([\s\S]*?)`\s*;/);
  if (!m) throw new Error(`${p}: 找不到 export const X = \`...\` 形式的着色器源`);
  return m[1];
}

const DITHER = loadModule("src/components/lab/water/dither.glsl.ts");

/** Bayer 8×8:M_{2n} = [[4M, 4M+2], [4M+3, 4M+1]] */
function bayer8() {
  let m = [[0]];
  while (m.length < 8) {
    const s = m.length;
    const out = Array.from({ length: s * 2 }, () => new Array(s * 2).fill(0));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = 4 * m[y][x];
        out[y][x] = v;
        out[y][x + s] = v + 2;
        out[y + s][x] = v + 3;
        out[y + s][x + s] = v + 1;
      }
    }
    m = out;
  }
  return m.flat();
}

const THRESH_RE = /float waterDitherThreshold\(vec2 frag\)\{[\s\S]*?\n\}/;

/** 把 dither.glsl.ts 的阈值函数换成对照实现,其余(uniform、waterDitherApply)不动。 */
function withThreshold(body, tag) {
  const replaced = DITHER.replace(
    THRESH_RE,
    `float waterDitherThreshold(vec2 frag){\n${body}\n}`
  );
  if (replaced === DITHER) throw new Error(`阈值函数替换失败(${tag}):dither.glsl.ts 的签名变了?`);
  return replaced;
}

const COARSEN = `  vec2 dp = floor(frag / uDitherPixel);
  dp.x = floor(dp.x * mix(1.0, 0.30, uDitherAniso));`;

const DITHER_BAYER = withThreshold(
  `${COARSEN}
  const float WB[64] = float[64](${bayer8().map((v) => v.toFixed(1)).join(",")});
  int ix = int(mod(dp.x, 8.0)); int iy = int(mod(dp.y, 8.0));
  return (WB[iy * 8 + ix] + 0.5) / 64.0;`,
  "bayer"
);

/* IGN = interleaved gradient noise(Jorge Jimenez),按 ADR §4.2 的口径:
 * 作用在被 floor(frag/uDitherPixel) 粗化之后的坐标上。 */
const DITHER_IGN = withThreshold(
  `${COARSEN}
  return fract(52.9829189 * fract(0.06711056 * dp.x + 0.00583715 * dp.y));`,
  "ign"
);

const HEAD = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2  uRes;
uniform float uTime;
`;

/* 线性梯度探针:lum 只由屏幕 x 决定,左 0 右 1。uTime 声明了但**不进 lum**,
 * 所以这张图在时间上恒定,任何帧间差都只可能来自阈值图。 */
const GRADIENT_MAIN = `
void main(){
  vec2 frag = gl_FragCoord.xy;
  float lum = clamp(frag.x / uRes.x, 0.0, 1.0);
  fragColor = vec4(waterDitherApply(frag, lum), 1.0);
}
`;

/* ═══════════════════════ 渲染与读图 ═══════════════════════════════════════ */

function render(fragSrc, out, sets = {}, time = 2.5) {
  const frag = path.join(WORK, path.basename(out).replace(/\.png$/, ".frag"));
  writeFileSync(frag, fragSrc);
  const args = [
    "scripts/water-harness.mjs",
    "--shader", frag,
    "--out", out,
    "--time", String(time),
    "--tex", `uDitherNoise=${NOISE}`,
  ];
  for (const [k, v] of Object.entries(sets)) args.push("--set", `${k}=${v}`);
  const r = spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    console.log(r.stdout, r.stderr);
    throw new Error(`渲染失败: ${out}`);
  }
  return out;
}

/** 走 golden/w3/run.mjs 的真实 preset(会自动重建 preview.frag)。 */
function renderPreset(name, out, time, extra = []) {
  const r = spawnSync(
    "node",
    ["golden/w3/run.mjs", name, "--out", out, "--time", String(time), "--noscore", ...extra],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.log(r.stdout, r.stderr);
    throw new Error(`preset 渲染失败: ${name}`);
  }
  return out;
}

/** 读回 RGB,并按红通道二值化成墨点掩码(墨 #32331A 的 R=0.196,纸 #E6FEFD 的 R=0.902)。 */
async function readInk(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = data[i * info.channels] < 128 ? 1 : 0;
  return { mask, w: info.width, h: info.height, raw: data, ch: info.channels };
}

/** 两张图逐像素差:返回不同像素数,以及自上而下第一条出现差异的行。 */
function diff(a, b) {
  if (a.raw.length !== b.raw.length) return { n: -1, firstRow: 0 };
  let n = 0;
  let firstRow = -1;
  for (let y = 0; y < a.h; y++) {
    let rowDiff = 0;
    for (let x = 0; x < a.w; x++) {
      const i = (y * a.w + x) * a.ch;
      if (a.raw[i] !== b.raw[i] || a.raw[i + 1] !== b.raw[i + 1] || a.raw[i + 2] !== b.raw[i + 2])
        rowDiff++;
    }
    if (rowDiff && firstRow < 0) firstRow = y;
    n += rowDiff;
  }
  return { n, firstRow };
}

/* ═══════════════════════ C · 线性度 ═════════════════════════════════════ */

/** 把梯度图按列分箱,量「暗覆盖率 vs 亮度」的线性度。理想:cover = 1 − lum。 */
function linearity(ink, bins = 128) {
  const { mask, w, h } = ink;
  const per = w / bins;
  const xs = [];
  const ys = [];
  for (let b = 0; b < bins; b++) {
    const x0 = Math.round(b * per);
    const x1 = Math.round((b + 1) * per);
    let dark = 0;
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) dark += mask[y * w + x];
    xs.push((x0 + x1) / 2 / w); // 该箱的平均 lum
    ys.push(dark / ((x1 - x0) * h)); // 暗覆盖率
  }
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  // 相对理想直线 cover = 1 − lum 的最大偏差(灰阶数)
  let maxErr = 0;
  for (let i = 0; i < n; i++) maxErr = Math.max(maxErr, Math.abs(ys[i] - (1 - xs[i])));
  return { r2, slope, intercept: my - slope * mx, maxErr, xs, ys };
}

/* ═══════════════════════ 主流程 ═════════════════════════════════════════ */

const fail = [];
const ok = (cond, msg) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fail.push(msg);
};
const f3 = (v) => v.toFixed(3);

console.log("\n══ W4 抖动层自测 ══════════════════════════════════════════════\n");

/* ── A · 确定性 ──────────────────────────────────────────────────────── */
console.log("A · 确定性(同一 uTime 连渲两次)");
renderPreset("mid", `${WORK}/det-1.png`, 2.5);
renderPreset("mid", `${WORK}/det-2.png`, 2.5);
const dA = diff(await readInk(`${WORK}/det-1.png`), await readInk(`${WORK}/det-2.png`));
ok(dA.n === 0, `mid t=2.5 两次渲染逐像素差 = ${dA.n}`);

/* ── B · 时间稳定性 ─────────────────────────────────────────────────── */
console.log("\nB · 时间稳定性(阈值图不许跟着 uTime 走)");
// B1:梯度探针 —— lum 与 t 无关,整幅图必须逐像素相同
render(HEAD + DITHER + GRADIENT_MAIN, `${WORK}/grad-t0.png`, { uDitherPixel: 2, uDitherAniso: 0 }, 0);
render(HEAD + DITHER + GRADIENT_MAIN, `${WORK}/grad-t5.png`, { uDitherPixel: 2, uDitherAniso: 0 }, 5);
const dB1 = diff(await readInk(`${WORK}/grad-t0.png`), await readInk(`${WORK}/grad-t5.png`));
ok(dB1.n === 0, `梯度探针 t=0 vs t=5 逐像素差 = ${dB1.n}(隔离测:模块本身与 t 无关)`);

// B2:真实场景 —— night 的天空区 lum 恒定(waterShadeSky 不吃 t),水面区随 t 变。
// 阈值图若跟着 t 走,天空的墨点必然重排 → 第一条差异行会跑到画面顶部。
renderPreset("night", `${WORK}/night-t0.png`, 0);
renderPreset("night", `${WORK}/night-t5.png`, 5);
const nA = await readInk(`${WORK}/night-t0.png`);
const nB = await readInk(`${WORK}/night-t5.png`);
const dB2 = diff(nA, nB);
const skyRows = dB2.firstRow < 0 ? H : dB2.firstRow;
ok(
  skyRows > H * 0.5,
  `night t=0 vs t=5:自顶 ${skyRows} 行(${((100 * skyRows) / H).toFixed(1)}%)逐像素完全相同,` +
    `差异从第 ${dB2.firstRow} 行(水面开始处)才出现,共 ${dB2.n} 像素`
);

/* ── C · 线性度 ─────────────────────────────────────────────────────── */
console.log("\nC · 线性度(左黑右白线性梯度,uDitherPixel=2)");
const linRows = [];
for (const aniso of [0, 0.8]) {
  const out = `${WORK}/grad-a${aniso}.png`;
  render(HEAD + DITHER + GRADIENT_MAIN, out, { uDitherPixel: 2, uDitherAniso: aniso }, 2.5);
  const ink = await readInk(out);
  const L = linearity(ink);
  const ga = gridArtifactOf(ink.mask, ink.w, ink.h);
  linRows.push({ name: `蓝噪声 aniso=${aniso}`, L, ga });
  ok(L.r2 >= 0.98, `aniso=${aniso}  R² = ${L.r2.toFixed(4)}  (≥0.98)`);
  ok(ga < 2, `aniso=${aniso}  gridArtifact = ${ga.toFixed(2)}%  (<2%)`);
}

/* ── D · Bayer / IGN 对照 ───────────────────────────────────────────── */
console.log("\nD · 对照:同一梯度换阈值图");
for (const [name, src] of [
  ["Bayer 8×8", DITHER_BAYER],
  ["IGN", DITHER_IGN],
]) {
  const slug = name.startsWith("Bayer") ? "bayer" : "ign";
  const out = `${WORK}/grad-${slug}.png`;
  render(HEAD + src + GRADIENT_MAIN, out, { uDitherPixel: 2, uDitherAniso: 0 }, 2.5);
  const ink = await readInk(out);
  const L = linearity(ink);
  const ga = gridArtifactOf(ink.mask, ink.w, ink.h);
  linRows.push({ name: `${name} aniso=0`, L, ga });
}

console.log("\n  梯度台上的三种阈值图");
console.log("  ────────────────────────────────────────────────────────────");
console.log("  阈值图                 R²        斜率      最大偏差   gridArtifact");
for (const r of linRows) {
  console.log(
    `  ${r.name.padEnd(20)} ${r.L.r2.toFixed(4)}  ${f3(r.L.slope).padStart(7)}  ` +
      `${f3(r.L.maxErr).padStart(8)}   ${r.ga.toFixed(2)}%`
  );
}

/* D2:真实水面场景上的 gridArtifact —— 与 W1 的 64% / 76% 同口径可比。 */
console.log("\n  真实水面场景(mid preset, t=2.5)上的 gridArtifact");
console.log("  ────────────────────────────────────────────────────────────");
const buildInfo = spawnSync("node_modules/.bin/tsx", ["golden/w3/build.ts"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (buildInfo.status !== 0) throw new Error("golden/w3/build.ts 重建失败");
const PREVIEW = readFileSync(path.join(ROOT, "golden/w3/preview.frag"), "utf8");
const MID = {
  uDitherPixel: 2, uDitherAniso: 0.8,
  uFieldCamHeight: 1.6, uFieldCamPitch: 0.37, uFieldFovY: 0.61,
  uFieldFetchLen: 7.0, uFieldLodBias: 5.0, uFieldAmp: 1.5, uFieldSpread: 0.15,
  uShadeEnvLutScale: 2.0, uShadeEnvLutMin: -0.2, uShadeEnvLutMax: 1.0,
  uShadeBody: 0.62, uShadeEnvGain: 1.0, uShadeSpecGain: 0.0, uShadeLightOmega: 6.8e-5,
  uShadeLightElev: 0.35, uShadeLightAz: 0.0, uShadeSigmaFloor: 2e-4, uShadeSpecClip: 1.5,
  uShadeExposure: 0.10, uShadeContrast: 8.0, uShadePivot: 0.48, uShadeSkyGain: 1.0,
};
for (const [name, src] of [
  ["蓝噪声 128²", PREVIEW],
  ["Bayer 8×8", PREVIEW.replace(THRESH_RE, DITHER_BAYER.match(THRESH_RE)[0])],
  ["IGN", PREVIEW.replace(THRESH_RE, DITHER_IGN.match(THRESH_RE)[0])],
]) {
  const slug = name.startsWith("蓝") ? "blue" : name.startsWith("Bayer") ? "bayer" : "ign";
  const out = `${WORK}/mid-${slug}.png`;
  const frag = path.join(WORK, `mid-${slug}.frag`);
  writeFileSync(frag, src);
  const args = [
    "scripts/water-harness.mjs", "--shader", frag, "--out", out, "--time", "2.5",
    "--tex", `uDitherNoise=${NOISE}`,
    "--tex", "uShadeEnvLut=golden/w3/env-mid.png",
  ];
  for (const [k, v] of Object.entries(MID)) args.push("--set", `${k}=${v}`);
  const r = spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) { console.log(r.stdout, r.stderr); throw new Error(`渲染失败 ${name}`); }
  const m = spawnSync("node", ["scripts/water-metrics.mjs", out, "--baseline", "mid", "--json"], {
    cwd: ROOT, encoding: "utf8",
  });
  const j = JSON.parse(m.stdout);
  console.log(
    `  ${name.padEnd(14)} gridArtifact ${String(j.metrics.gridArtifact).padStart(6)}%   ` +
      `相干度 ${j.metrics.coherence}   总分 ${j.score.total ?? j.score}`
  );
}

if (!KEEP) rmSync(WORK, { recursive: true, force: true });

console.log(
  fail.length
    ? `\n  ✗ ${fail.length} 项未通过\n`
    : "\n  ✓ 四项全部通过\n"
);
process.exit(fail.length ? 1 : 0);
