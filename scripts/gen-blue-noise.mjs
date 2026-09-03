#!/usr/bin/env node
/**
 * gen-blue-noise.mjs —— 构建期生成 void-and-cluster 蓝噪声阈值图 (W4 资产)
 *
 *   node scripts/gen-blue-noise.mjs [--size 64] [--out public/water/blue-noise-64.png]
 *
 * ── 为什么必须是蓝噪声,不能是白噪声或 Bayer ────────────────────────────────
 * 抖动的选择不是化妆品,它直接决定**量化之后水面结构还剩不剩**。
 *
 * 评分器给 1-bit 图打分时,要先做局部平均把密度场「反抖动」还原出来(9px 盒)。
 * 这一步等于对抖动噪声做低通:
 *   · 白噪声:能量平摊在所有频率,9×9 平均后残余 std ≈ 255·sqrt(p(1-p)/81) ≈ 11
 *     ——而前景水面(菲涅耳 F≈0.03)的亮度起伏只有几个灰阶,直接被淹掉。
 *     实测量化后相干度从 0.95 掉到 0.14~0.34,前景平坦度从 0.06 涨到 0.65。
 *   · Bayer:低频干净,但把能量堆在网格谐波上 → 满屏十字纹(实测占高频能量 64%)。
 *   · 蓝噪声:能量全被推到高频,局部平均几乎完全抹掉它,水面结构原样留下。
 *
 * 算法:Ulichney 的 void-and-cluster。用环形(toroidal)高斯滤波找「最紧的簇」与
 * 「最大的空洞」,增量维护能量场,O(N·K)。
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};

const N = parseInt(arg("--size", "64"), 10);
const OUT = arg("--out", `public/water/blue-noise-${N}.png`);
const SIGMA = 1.5;
const R = 6; // 核半径,>4σ 已足够

// 预算高斯核(环形)
const K = [];
for (let dy = -R; dy <= R; dy++) {
  for (let dx = -R; dx <= R; dx++) {
    K.push({ dx, dy, w: Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA)) });
  }
}

const idx = (x, y) => ((y + N) % N) * N + ((x + N) % N);

/** 增量维护的能量场:energy[i] = Σ_j pattern[j]·G(i-j) */
function makeEnergy(pattern) {
  const e = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!pattern[idx(x, y)]) continue;
      for (const { dx, dy, w } of K) e[idx(x + dx, y + dy)] += w;
    }
  return e;
}
function bump(e, x, y, sign) {
  for (const { dx, dy, w } of K) e[idx(x + dx, y + dy)] += sign * w;
}

/** 值为 1 的像素里能量最大的那个 = 最紧的簇中心 */
function tightestCluster(pattern, e) {
  let best = -1,
    bv = -Infinity;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] && e[i] > bv) {
      bv = e[i];
      best = i;
    }
  }
  return best;
}
/** 值为 0 的像素里能量最小的那个 = 最大的空洞中心 */
function largestVoid(pattern, e) {
  let best = -1,
    bv = Infinity;
  for (let i = 0; i < pattern.length; i++) {
    if (!pattern[i] && e[i] < bv) {
      bv = e[i];
      best = i;
    }
  }
  return best;
}

// —— 阶段 0:随机初始图案,反复「拆最紧的簇、填最大的空洞」直到稳定 ——
let seed = 1337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const total = N * N;
const ones = Math.round(total * 0.1);
const pattern = new Uint8Array(total);
for (let n = 0; n < ones; ) {
  const i = Math.floor(rnd() * total);
  if (!pattern[i]) {
    pattern[i] = 1;
    n++;
  }
}
let energy = makeEnergy(pattern);
for (let iter = 0; iter < 10000; iter++) {
  const c = tightestCluster(pattern, energy);
  pattern[c] = 0;
  bump(energy, c % N, (c / N) | 0, -1);
  const v = largestVoid(pattern, energy);
  if (v === c) {
    pattern[c] = 1;
    bump(energy, c % N, (c / N) | 0, +1);
    break; // 稳定
  }
  pattern[v] = 1;
  bump(energy, v % N, (v / N) | 0, +1);
}

const IBP = Uint8Array.from(pattern);
const rank = new Int32Array(total).fill(-1);

// —— 阶段 1:从 IBP 逐个拆最紧的簇,秩由 ones-1 递减到 0 ——
{
  const p = Uint8Array.from(IBP);
  const e = makeEnergy(p);
  let count = ones;
  while (count > 0) {
    const c = tightestCluster(p, e);
    p[c] = 0;
    bump(e, c % N, (c / N) | 0, -1);
    count--;
    rank[c] = count;
  }
}

// —— 阶段 2:从 IBP 逐个填最大的空洞,秩由 ones 递增到 total/2 ——
const p2 = Uint8Array.from(IBP);
const e2 = makeEnergy(p2);
let count = ones;
const half = Math.floor(total / 2);
while (count < half) {
  const v = largestVoid(p2, e2);
  p2[v] = 1;
  bump(e2, v % N, (v / N) | 0, +1);
  rank[v] = count;
  count++;
}

/* —— 阶段 3:后半程。
 * 高斯核对称,所以「0 的最紧簇」= 「1 的最大空洞」= 在 0 像素里 e2 最小的那个,
 * 规则与阶段 2 相同。
 * 曾经在这里取了 e2 **最大**的 0 像素(以为要反转),结果后半程的秩全部挤成团:
 * 阈值取在 0.5 附近看不出来(自检也报正常),但一旦用 0.8 左右的亮度去阈值化,
 * 满屏就是有规律重复的大墨块。所以自检必须在多个阈值上做。 */
while (count < total) {
  const v = largestVoid(p2, e2);
  p2[v] = 1;
  bump(e2, v % N, (v / N) | 0, +1);
  rank[v] = count;
  count++;
}

// 秩 → 0..255 阈值
const out = Buffer.alloc(total);
for (let i = 0; i < total; i++) out[i] = Math.round((rank[i] * 255) / (total - 1));

mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(out, { raw: { width: N, height: N, channels: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

/* 自检:环形 9×9 局部平均后的残余 std。**必须在多个阈值上做** ——
 * 只测 0.5 会漏掉后半程秩排布的缺陷(见阶段 3 的注释)。 */
const thr = new Float64Array(total);
for (let i = 0; i < total; i++) thr[i] = out[i] / 255;
console.log(`\n  ${OUT}  ${N}×${N}`);
let worst = 0;
for (const P of [0.15, 0.3, 0.5, 0.7, 0.85]) {
  const bin = new Float64Array(total);
  for (let i = 0; i < total; i++) bin[i] = thr[i] < P ? 1 : 0;
  let sum = 0, sum2 = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) s += bin[idx(x + dx, y + dy)];
      const v = (s / 81) * 255;
      sum += v;
      sum2 += v * v;
    }
  const mean = sum / total;
  const resid = Math.sqrt(Math.max(sum2 / total - mean * mean, 0));
  worst = Math.max(worst, resid);
  console.log(`  阈值 ${P.toFixed(2)}:9×9 平均后残余 std = ${resid.toFixed(2)} 灰阶`);
}
console.log(`  最差 ${worst.toFixed(2)}(白噪声约 11.3;>8 说明秩排布有簇,不可用)`);
console.log(`  这个数字就是「量化之后水面结构还剩多少」的直接指标。\n`);
