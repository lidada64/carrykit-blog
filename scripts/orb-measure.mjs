#!/usr/bin/env node
/**
 * orb-measure.mjs —— 灯球「黑白分布」量尺
 *
 * 为什么要有这个脚本:灯球的贴图不是"看着像就行"。参考图给了三个可量的量,
 * 模型必须对得上这三个数,否则就是在拿肉眼当验收标准 —— 那是证真,不是证伪。
 *
 *   ① 整球白占比           —— 参考图 42.5%(黑 57.5%)
 *   ② 白占比随纬度的曲线   —— 赤道下方最少、赤道上方最多、底端回升
 *   ③ 同色块的团簇尺度     —— 白块不是均匀撒盐,是成片的
 *
 * ③ 用「同色概率随角距的衰减」量:在球面上随机取点对,间隔 δ 度时两点同色的
 * 概率 P_same(δ)。完全随机(无团簇)时 P_same 恒等于 p²+(1−p)²(白占比 p);
 * 有团簇时 δ→0 处接近 1,随 δ 增大衰减到那条基线。衰减到基线一半所需的角距
 * 就是团簇半径。**这个量对整体亮度、对比度、伽马都不敏感**,只依赖二值化后
 * 的空间结构,所以参考照片和渲染图能直接比。
 *
 * ── 坐标 ──────────────────────────────────────────────────────────────
 * 把图像重采样到 (纬度 θ, 经度 φ) 等距网格再统计。直接在像素上做会被正交
 * 投影的边缘压缩骗到:等经度间隔在图像上的横向间距是 r·cosθ·Δφ,靠近边缘
 * 挤成一团,量出来的"瓦片更小"是投影假象。
 * 用正交投影近似(参考图是透视照片,球只占画面一部分,误差在百分之几量级)。
 *
 * 用法:
 *   node scripts/orb-measure.mjs <图> [--alpha] [--th 128] [--bands 12]
 *   --alpha  用 alpha 通道拟合球(渲染出的 RGBA PNG 用这个,比局部对比可靠)
 *   --fit    cx,cy,r 直接给定球,绕过自动拟合。画面里有环/星点这类球外亮物时
 *            必须用它 —— 否则包围盒把环也框进去,半径一大,统计全错
 *   --th     二值化阈值 0..255
 *   --json   只吐 JSON,给上层脚本做回归比对用
 */

import sharp from "sharp";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
if (!src) {
  console.error("用法: node scripts/orb-measure.mjs <图> [--alpha] [--th 128] [--bands 12] [--json]");
  process.exit(2);
}
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? Number(args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);

const TH = flag("th", 128);
const NB = flag("bands", 12);
const JSON_ONLY = has("json");
const log = (...a) => {
  if (!JSON_ONLY) console.log(...a);
};

/* ── 读图:灰度 + (可选)alpha ───────────────────────────────────────── */
const img = sharp(src);
const meta = await img.metadata();
const W = meta.width ?? 0;
const H = meta.height ?? 0;
const grey = await sharp(src).greyscale().raw().toBuffer();
let alpha = null;
if (has("alpha") && (meta.channels ?? 3) === 4) {
  alpha = await sharp(src).extractChannel(3).raw().toBuffer();
}

/* ── 拟合球 ───────────────────────────────────────────────────────────
 * alpha 有就用 alpha 的包围盒;没有就退回「局部对比」—— 球面是高对比区域,
 * 背景是大片纯黑加稀疏星点。 */
let cx, cy, r;
const fitArg = (() => {
  const i = args.indexOf("--fit");
  return i >= 0 && args[i + 1] ? args[i + 1].split(",").map(Number) : null;
})();
if (fitArg && fitArg.length === 3 && fitArg.every((v) => Number.isFinite(v))) {
  [cx, cy, r] = fitArg;
  log(`球(指定):中心 (${cx}, ${cy}) 半径 ${r}`);
} else if (alpha) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (alpha[y * W + x] > 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  cx = (x0 + x1) / 2;
  cy = (y0 + y1) / 2;
  r = Math.min(x1 - x0, y1 - y0) / 2;
  log(`球(alpha):中心 (${cx.toFixed(0)}, ${cy.toFixed(0)}) 半径 ${r.toFixed(0)}  bbox x ${x0}..${x1} y ${y0}..${y1}`);
} else {
  const varMap = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      let mn = 255;
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const v = grey[(y + dy) * W + x + dx];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      varMap[y * W + x] = mx - mn;
    }
  const colHit = new Int32Array(W);
  const rowHit = new Int32Array(H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (varMap[y * W + x] > 90) {
        colHit[x]++;
        rowHit[y]++;
      }
  const span = (arr, frac) => {
    let mx = 0;
    for (const v of arr) if (v > mx) mx = v;
    const th = mx * frac;
    let a = 0;
    let b = arr.length - 1;
    while (a < arr.length && arr[a] < th) a++;
    while (b > 0 && arr[b] < th) b--;
    return [a, b];
  };
  const [x0, x1] = span(colHit, 0.45);
  const [y0, y1] = span(rowHit, 0.45);
  cx = (x0 + x1) / 2;
  cy = (y0 + y1) / 2;
  r = Math.min(x1 - x0, y1 - y0) / 2;
  log(`球(对比):中心 (${cx.toFixed(0)}, ${cy.toFixed(0)}) 半径 ${r.toFixed(0)}  bbox x ${x0}..${x1} y ${y0}..${y1}`);
}

/* ── ① 整球黑白配比 + ② 纬度分带 ─────────────────────────────────────
 * 只统计 0.93r 以内 —— 边缘一圈是掠射面,亮度不代表瓦片本色。 */
const bw = new Array(NB).fill(0);
const bn = new Array(NB).fill(0);
let white = 0;
let total = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    if (dx * dx + dy * dy > 0.93 * 0.93) continue;
    if (alpha && alpha[y * W + x] < 128) continue;
    const isW = grey[y * W + x] > TH;
    total++;
    if (isW) white++;
    const lat = Math.asin(Math.max(-1, Math.min(1, -dy)));
    const b = Math.min(NB - 1, Math.floor(((lat / (Math.PI / 2)) + 1) / 2 * NB));
    bn[b]++;
    if (isW) bw[b]++;
  }
const pWhite = white / Math.max(1, total);

/* ── 重采样到 (θ, φ) 等距网格 ─────────────────────────────────────────
 * 正交投影:x = cx + r·cosθ·sinφ, y = cy − r·sinθ。只取 |φ|≤60°、|θ|≤78°,
 * 再往外正面朝向太斜,一个瓦片投影不到一个像素,取样等于在读噪声。 */
const NTH = 160;
const NPH = 160;
const PH_MAX = (60 * Math.PI) / 180;
const TH_MAX = (78 * Math.PI) / 180;
const grid = new Int8Array(NTH * NPH); // 1=白 0=黑 −1=无效
for (let i = 0; i < NTH; i++) {
  const th = -TH_MAX + (2 * TH_MAX * i) / (NTH - 1);
  for (let j = 0; j < NPH; j++) {
    const ph = -PH_MAX + (2 * PH_MAX * j) / (NPH - 1);
    const x = Math.round(cx + r * Math.cos(th) * Math.sin(ph));
    const y = Math.round(cy - r * Math.sin(th));
    if (x < 0 || x >= W || y < 0 || y >= H) {
      grid[i * NPH + j] = -1;
      continue;
    }
    if (alpha && alpha[y * W + x] < 128) {
      grid[i * NPH + j] = -1;
      continue;
    }
    grid[i * NPH + j] = grey[y * W + x] > TH ? 1 : 0;
  }
}
const dTh = ((2 * TH_MAX) / (NTH - 1)) * (180 / Math.PI); // 每格多少度
const dPh = ((2 * PH_MAX) / (NPH - 1)) * (180 / Math.PI);

/**
 * 一维自相关求主周期。line 是 ±1 序列(已去均值),返回首个「过零后的极大」
 * 所在滞后。找不到返回 0。
 */
function period(lines, maxLag) {
  const acf = new Float64Array(maxLag + 1);
  const cnt = new Float64Array(maxLag + 1);
  for (const line of lines) {
    const n = line.length;
    let mean = 0;
    let m = 0;
    for (const v of line)
      if (v >= 0) {
        mean += v;
        m++;
      }
    if (m < maxLag * 2) continue;
    mean /= m;
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0;
      let c = 0;
      for (let k = 0; k + lag < n; k++) {
        const a = line[k];
        const b = line[k + lag];
        if (a < 0 || b < 0) continue;
        s += (a - mean) * (b - mean);
        c++;
      }
      if (c > 0) {
        acf[lag] += s / c;
        cnt[lag]++;
      }
    }
  }
  for (let i = 0; i <= maxLag; i++) acf[i] = cnt[i] > 0 ? acf[i] / cnt[i] : 0;
  const a0 = acf[0] || 1;
  for (let i = 0; i <= maxLag; i++) acf[i] /= a0;
  let z = 1;
  while (z <= maxLag && acf[z] > 0) z++;
  let best = 0;
  let bv = -2;
  for (let i = z; i <= maxLag; i++)
    if (acf[i] > bv) {
      bv = acf[i];
      best = i;
    }
  return { lag: best, peak: bv, acf: Array.from(acf) };
}

const rowsPh = [];
for (let i = 0; i < NTH; i++) {
  const th = Math.abs(-TH_MAX + (2 * TH_MAX * i) / (NTH - 1));
  if (th > (50 * Math.PI) / 180) continue; // 高纬经线挤在一起,不参与经度周期
  rowsPh.push(Array.from(grid.subarray(i * NPH, (i + 1) * NPH)));
}
const colsTh = [];
for (let j = 0; j < NPH; j++) {
  const col = new Array(NTH);
  for (let i = 0; i < NTH; i++) col[i] = grid[i * NPH + j];
  colsTh.push(col);
}
const pPh = period(rowsPh, Math.round(NPH / 4));
const pTh = period(colsTh, Math.round(NTH / 4));
const degPh = pPh.lag * dPh;
const degTh = pTh.lag * dTh;

/* ── ③ 团簇尺度:P_same(δ) ────────────────────────────────────────────
 * 在 (θ,φ) 网格上取所有间隔为 δ 的同行/同列点对(同行的经度差要乘 cosθ 才是
 * 真实角距 —— 高纬上同样的 Δφ 对应的球面弧长更短)。 */
const baseline = pWhite * pWhite + (1 - pWhite) * (1 - pWhite);
const DBINS = 16;
const DMAX = 32; // 度
const same = new Float64Array(DBINS);
const npair = new Float64Array(DBINS);
for (let i = 0; i < NTH; i++) {
  const th = -TH_MAX + (2 * TH_MAX * i) / (NTH - 1);
  const cth = Math.cos(th);
  for (let j = 0; j < NPH; j++) {
    const a = grid[i * NPH + j];
    if (a < 0) continue;
    for (let k = 1; k < NPH - j && k < 80; k++) {
      const b = grid[i * NPH + j + k];
      if (b < 0) continue;
      const d = k * dPh * cth;
      if (d >= DMAX) break;
      const bin = Math.floor((d / DMAX) * DBINS);
      npair[bin]++;
      if (a === b) same[bin]++;
    }
    for (let k = 1; k < NTH - i && k < 80; k++) {
      const b = grid[(i + k) * NPH + j];
      if (b < 0) continue;
      const d = k * dTh;
      if (d >= DMAX) break;
      const bin = Math.floor((d / DMAX) * DBINS);
      npair[bin]++;
      if (a === b) same[bin]++;
    }
  }
}
const psame = Array.from(same, (s, i) => (npair[i] > 0 ? s / npair[i] : NaN));
/* 团簇半径:P_same 从 δ→0 衰减到「一半的超出量」时的角距 */
let clusterDeg = NaN;
const p0 = psame.find((v) => !Number.isNaN(v)) ?? baseline;
const halfTarget = baseline + (p0 - baseline) / 2;
for (let i = 1; i < DBINS; i++) {
  if (Number.isNaN(psame[i])) continue;
  if (psame[i] <= halfTarget) {
    const prev = psame[i - 1];
    const t = (prev - halfTarget) / Math.max(1e-6, prev - psame[i]);
    clusterDeg = ((i - 1 + t) + 0.5) * (DMAX / DBINS);
    break;
  }
}

/* ── 输出 ─────────────────────────────────────────────────────────────*/
const bands = [];
for (let i = 0; i < NB; i++) {
  const a = -90 + (i / NB) * 180;
  const b = -90 + ((i + 1) / NB) * 180;
  bands.push({ from: a, to: b, white: bn[i] > 0 ? bw[i] / bn[i] : NaN, n: bn[i] });
}
const out = {
  src,
  sphere: { cx, cy, r },
  white: pWhite,
  bands,
  tile: { lonDeg: degPh, latDeg: degTh, seg: degPh > 0 ? 360 / degPh : NaN, ring: degTh > 0 ? 180 / degTh : NaN, peakLon: pPh.peak, peakLat: pTh.peak },
  cluster: { baseline, p0, halfDeg: clusterDeg, curve: psame, binDeg: DMAX / DBINS },
};

if (JSON_ONLY) {
  console.log(JSON.stringify(out));
} else {
  log(`\n① 整球:白 ${(100 * pWhite).toFixed(1)}% / 黑 ${(100 * (1 - pWhite)).toFixed(1)}%  (${total} px)`);
  log("\n② 纬度带(下→上)     白占比");
  for (const b of bands) {
    const p = 100 * b.white;
    log(
      `  ${b.from.toFixed(0).padStart(4)}°..${b.to.toFixed(0).padStart(4)}°  ${p.toFixed(1).padStart(5)}%  ${"█".repeat(Math.max(0, Math.round(p / 2.5)))}`,
    );
  }
  log(`\n瓦片角间距:经度 ${degPh.toFixed(2)}° → SEG≈${(360 / degPh).toFixed(0)}   纬度 ${degTh.toFixed(2)}° → RING≈${(180 / degTh).toFixed(0)}`);
  log(`  (自相关峰高 经 ${pPh.peak.toFixed(2)} / 纬 ${pTh.peak.toFixed(2)};低于 0.1 说明没有可辨的规则网格,数字不可信)`);
  log(`\n③ 团簇:P_same(0)=${p0.toFixed(3)}  基线(纯随机)=${baseline.toFixed(3)}  半衰角距=${Number.isNaN(clusterDeg) ? "—(无团簇)" : clusterDeg.toFixed(1) + "°"}`);
  const step = DMAX / DBINS;
  log("  δ(度)  P_same");
  for (let i = 0; i < DBINS; i += 2) {
    if (Number.isNaN(psame[i])) continue;
    log(`  ${((i + 0.5) * step).toFixed(1).padStart(5)}  ${psame[i].toFixed(3)}  ${"▏".repeat(Math.round((psame[i] - 0.4) * 100))}`);
  }
}
