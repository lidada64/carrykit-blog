#!/usr/bin/env node
/**
 * water-metrics.mjs —— 水面渲染的「视觉标尺」(W0)
 *
 * 把「像不像参考图」变成 8 个可跑分的数字。所有后续水面任务卡(W2~W9)的验收
 * 都跑这把尺子，而不是靠肉眼说「看着还行」。
 *
 *   node scripts/water-metrics.mjs <img> [--baseline near|mid|obra|night] [--json]
 *   node scripts/water-metrics.mjs --verify-baseline     # 用 docs/water-refs/ 自检
 *
 * 依赖:只用仓库已有的 sharp(解码 + 缩放),FFT 自带,零新增依赖。
 *
 * ── 分析约定(必须固定,否则不同分辨率的图不可比) ──────────────────────────
 *  · 统一缩到 **高度 1200 px、保持宽高比** 再分析。所有以 px 为单位的指标
 *    (纵向波长、划线长度)都以这个高度为基准。
 *  · 去趋势:减掉 41px 盒模糊,只留下波纹这一档的局部结构,大尺度明暗不参与。
 *  · 按屏幕高度均分 10 个横带(band 0 = 画面顶端 = 远,band 9 = 画面底端 = 近)。
 *  · 「特征侧」(featureCoverage / dashAspect 用的掩码)由 polarity 决定:
 *    照片类参考的特征是**暗划线**(dark);奥伯拉丁那种 1-bit 输出的特征是
 *    **亮墨点**(bright)。polarity 跟着 baseline 走,不要自动猜。
 *
 * ── 为什么 foregroundFlatness 是最强判别项 ───────────────────────────────
 *  实测三张参考图的分带对比度全是**单峰**:峰在画面中上部(掠射角使 Fresnel
 *  反射率陡升,而波长仍可分辨),最靠近相机的前景只有峰值的 7~10%——因为那里
 *  视角最陡、F0≈0.02 的菲涅耳反射率极低,看进的是水体而不是天空,水面读作玻璃。
 *  绝大多数水面 shader(包括本仓库现有的 water-dither)把最大对比度堆在离
 *  相机最近的地方,方向正好反了。这一项一票否决,所以权重最高。
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ANALYSIS_HEIGHT = 1200; // 统一分析高度
const DETREND_RADIUS = 41; // 盒模糊直径
const BANDS = 10;
const HF_CUTOFF = 0.4; // gridArtifact 只看 0.4×Nyquist 以上(波长 <5px)

/* ═══════════════════════════ 基线 ═══════════════════════════════════════
 * 由 --verify-baseline 对 docs/water-refs/ 下的参考图实测得出。
 * 改动本文件的任何算法后必须重跑 --verify-baseline 并同步这里的值,
 * 否则所有卡的验收都会漂移。
 */
const BASELINES = {
  near: {
    label: "近景特写(微信图 2)· 贴水面 · preset near",
    ref: "near-closeup.jpg",
    polarity: "dark",
    curve: [0.269, 0.453, 0.685, 0.812, 0.97, 1, 0.561, 0.325, 0.034, 0.026],
    peakBand: 5,
    foregroundFlatness: 0.03,
    featureCoverage: 23.7,
    coherence: 0.932,
    gradAngleDeg: 92.0,
    dashAspect: 1.5,
    peakWavelengthPx: 11.6,
  },
  mid: {
    label: "中景带远岸(微信图 1)· preset mid",
    ref: "mid-shore.jpg",
    polarity: "dark",
    curve: [0.407, 0.603, 0.542, 0.944, 1, 0.562, 0.049, 0.043, 0.047, 0.083],
    peakBand: 4,
    foregroundFlatness: 0.065,
    featureCoverage: 19.6,
    coherence: 0.974,
    gradAngleDeg: 91.7,
    dashAspect: 3.5,
    peakWavelengthPx: 8.0,
  },
  obra: {
    label: "奥伯拉丁的回归 · 夜景带地平线 · 1-bit · preset night",
    ref: "obra-dinn.jpg",
    polarity: "bright",
    curve: [0, 0.003, 0.034, 0.128, 0.057, 0.117, 0.326, 1, 0, 0],
    peakBand: 7,
    foregroundFlatness: 0.0,
    featureCoverage: 36.6,
    /* 这张图的相干度实测 0.608,但**不作为目标**:反抖动还原出的密度场里
     * 占主导的是地平线那条横向强眩光带,量到的是眩光的各向异性而不是水面波纹的。
     * 夜景 preset 的波纹各向异性用 near/mid 的 0.93~0.97 要求,别拿这条来卡。 */
    coherence: null,
    gradAngleDeg: null,
    dashAspect: 1.0, // 奥伯拉丁用的是各向同性抖动,墨点近似方形
    peakWavelengthPx: 42.7,
  },
};
BASELINES.night = BASELINES.obra; // preset 名与 baseline 名的别名

/* 权重(见 docs/water-reference-metrics.md §3)。某项 baseline 为 null 时
 * 该项不计分,其余权重按比例归一。 */
const WEIGHTS = {
  foregroundFlatness: 0.2,
  coherence: 0.2,
  curveCorrelation: 0.15,
  peakBand: 0.1,
  dashAspect: 0.1,
  gradAngleDeg: 0.1,
  featureCoverage: 0.1,
  gridArtifact: 0.05,
};

/* ═══════════════════════════ 基础工具 ═══════════════════════════════════ */

/** 积分图盒模糊(边缘反射填充)。k 为奇数直径。 */
function boxBlur(src, w, h, k) {
  const r = (k - 1) >> 1;
  const pw = w + 2 * r;
  const ph = h + 2 * r;
  const pad = new Float64Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(h - 1, Math.abs(y - r < 0 ? r - y : y - r));
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(w - 1, Math.abs(x - r < 0 ? r - x : x - r));
      pad[y * pw + x] = src[sy * w + sx];
    }
  }
  // 前缀和 (ph+1) × (pw+1)
  const cs = new Float64Array((ph + 1) * (pw + 1));
  for (let y = 0; y < ph; y++) {
    let rowSum = 0;
    for (let x = 0; x < pw; x++) {
      rowSum += pad[y * pw + x];
      cs[(y + 1) * (pw + 1) + (x + 1)] = cs[y * (pw + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Float64Array(w * h);
  const area = k * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const y0 = y,
        x0 = x,
        y1 = y + k,
        x1 = x + k;
      const s =
        cs[y1 * (pw + 1) + x1] -
        cs[y0 * (pw + 1) + x1] -
        cs[y1 * (pw + 1) + x0] +
        cs[y0 * (pw + 1) + x0];
      out[y * w + x] = s / area;
    }
  }
  return out;
}

function std(a) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m += a[i];
  m /= a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - m;
    v += d * d;
  }
  return Math.sqrt(v / a.length);
}

function median(a) {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  let ma = 0,
    mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma,
      y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db || 1e-12);
}

/** 就地 radix-2 FFT。re/im 长度必须是 2 的幂。 */
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
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k],
          ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** 一维实序列的平均幅度谱(Hann 窗,补零到 2 的幂)。 */
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

/** 谱「尖峰度」:高频段里落在孤立谱峰上的能量占比。有序抖动(Bayer)会留下
 *  这种尖峰,蓝噪声不会。只看 0.4×Nyquist 以上,避开水波本身的合法低频峰。 */
function spikiness(spec) {
  const lo = Math.floor(spec.length * HF_CUTOFF);
  let total = 0,
    spike = 0;
  const W = 15;
  for (let k = lo; k < spec.length; k++) {
    const a = Math.max(lo, k - W),
      b = Math.min(spec.length, k + W + 1);
    const med = median(spec.slice(a, b));
    const p = spec[k] * spec[k];
    total += p;
    if (spec[k] > 8 * med) spike += p;
  }
  return total > 0 ? spike / total : 0;
}

/** 沿某一轴的游程长度中位数。 */
function runMedian(mask, w, h, axis, step) {
  const runs = [];
  const outer = axis === 1 ? h : w;
  const inner = axis === 1 ? w : h;
  for (let o = 0; o < outer; o += step) {
    let run = 0;
    for (let i = 0; i < inner; i++) {
      const v = axis === 1 ? mask[o * w + i] : mask[i * w + o];
      if (v) run++;
      else {
        if (run) runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);
  }
  return median(runs);
}

/* ═══════════════════════════ 指标 ═══════════════════════════════════════ */

async function loadGray(file) {
  const meta = await sharp(file).metadata();
  const w = Math.round((meta.width / meta.height) * ANALYSIS_HEIGHT);
  const { data } = await sharp(file)
    .resize(w, ANALYSIS_HEIGHT, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const g = new Float64Array(w * ANALYSIS_HEIGHT);
  for (let i = 0; i < g.length; i++) g[i] = data[i];
  return { g, w, h: ANALYSIS_HEIGHT };
}

/**
 * 判断输入是不是「有效 1-bit」(两个色调占了绝大多数像素),并给出两种表示:
 *   field —— 用于结构统计的**连续场**。1-bit 输入先局部平均「反抖动」还原出
 *            量化之前的亮度/密度场;否则就是灰度本身。
 *   ink   —— 用于划线形状与网纹统计的**二值墨点**;非 1-bit 输入为 null,
 *            后面按 polarity 从去趋势场里取阈值。
 *
 * 这一步是必须的:我们自己的产出也是 1-bit 抖动输出,直接对抖动像素算局部 RMS
 * 量到的是抖动噪声而不是水面结构,曲线会整片糊平。
 */
function prepare(g, w, h) {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.length; i++) hist[Math.min(255, Math.max(0, Math.round(g[i])))]++;
  let m1 = 0;
  for (let v = 1; v < 256; v++) if (hist[v] > hist[m1]) m1 = v;
  let m2 = -1;
  for (let v = 0; v < 256; v++) {
    if (Math.abs(v - m1) < 60) continue;
    if (m2 < 0 || hist[v] > hist[m2]) m2 = v;
  }
  let near = 0;
  if (m2 >= 0) {
    for (let v = 0; v < 256; v++) {
      if (Math.abs(v - m1) <= 14 || Math.abs(v - m2) <= 14) near += hist[v];
    }
  }
  const isBilevel = m2 >= 0 && near / g.length >= 0.85;
  if (!isBilevel) return { field: g, ink: null, isBilevel: false };

  const mid = (m1 + m2) / 2;
  const bright = new Float64Array(w * h);
  for (let i = 0; i < g.length; i++) bright[i] = g[i] > mid ? 255 : 0;
  let cover = 0;
  for (let i = 0; i < bright.length; i++) cover += bright[i] > 0 ? 1 : 0;
  const inkIsBright = cover / bright.length < 0.5; // 墨 = 少数色调
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    ink[i] = (bright[i] > 0) === inkIsBright ? 1 : 0;
  }
  return { field: boxBlur(bright, w, h, 9), ink, isBilevel: true };
}

function analyze(img, polarity) {
  const { w, h } = img;
  const { field, ink, isBilevel } = prepare(img.g, w, h);
  const g = field;
  const blur = boxBlur(g, w, h, DETREND_RADIUS);
  const d = new Float64Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = g[i] - blur[i];

  /* 分带对比度用**稳健展度**:先算每一列的 RMS,再取该带所有列的 40 分位数。
   *
   * 为什么不用整带 RMS:奥伯拉丁的画面下缘有一条又窄又亮的月光路径(镜面高光
   * 打穿了平静的前景),整带 RMS 会被这条路径抬起来,量出「前景不平坦」的假象。
   * 环境水面的平静与镜面光路的明亮是两件事,这条指标只该量前者。40 分位数
   * 忽略掉少数被光路占据的列,量的是「典型一列有多静」。对没有窄亮特征的
   * 照片类参考,它与整带 RMS 几乎一致。 */
  const bandH = Math.floor(h / BANDS);
  const rms = [];
  for (let b = 0; b < BANDS; b++) {
    const y0 = b * bandH;
    const colRms = new Float64Array(w);
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let y = 0; y < bandH; y++) m += d[(y0 + y) * w + x];
      m /= bandH;
      let v = 0;
      for (let y = 0; y < bandH; y++) {
        const t = d[(y0 + y) * w + x] - m;
        v += t * t;
      }
      colRms[x] = Math.sqrt(v / bandH);
    }
    const sorted = Float64Array.from(colRms).sort();
    rms.push(sorted[Math.floor(0.4 * (w - 1))]);
  }
  const peak = rms.indexOf(Math.max(...rms));
  const curve = rms.map((v) => v / rms[peak]);
  const foregroundFlatness = (rms[BANDS - 2] + rms[BANDS - 1]) / 2 / rms[peak];

  // 峰值带切片
  const py0 = peak * bandH;
  const band = new Float64Array(w * bandH);
  for (let i = 0; i < band.length; i++) band[i] = d[py0 * w + i];
  const sigma = std(band);

  /* 特征掩码。1-bit 输入直接用二值墨点;连续输入按 polarity 取 ±1σ 阈值。
   * 划线长宽比按带测量,取「对比度够读出纹理」那几带(rms ≥ 0.5×峰值)的中位数
   * ——只看峰值带一条会偏低,因为最亮那带常被高光打断成点。 */
  const maskOf = (b0) => {
    const m = new Uint8Array(w * bandH);
    if (isBilevel) {
      for (let i = 0; i < m.length; i++) m[i] = ink[b0 * w + i];
    } else {
      const sl = d.subarray(b0 * w, (b0 + bandH) * w);
      const s = std(sl);
      for (let i = 0; i < m.length; i++) {
        m[i] = polarity === "bright" ? (sl[i] > s ? 1 : 0) : sl[i] < -s ? 1 : 0;
      }
    }
    return m;
  };

  const peakMask = maskOf(py0);
  let cover = 0;
  for (let i = 0; i < peakMask.length; i++) cover += peakMask[i];
  const featureCoverage = (100 * cover) / peakMask.length;

  const aspects = [];
  let dashW = 0,
    dashH = 0;
  for (let b = 0; b < BANDS; b++) {
    if (rms[b] < 0.5 * rms[peak]) continue;
    const m = maskOf(b * bandH);
    const rw = runMedian(m, w, bandH, 1, 3);
    const rh = runMedian(m, w, bandH, 0, 3);
    if (rw > 0 && rh > 0) {
      aspects.push(rw / rh);
      if (b === peak) {
        dashW = rw;
        dashH = rh;
      }
    }
  }
  const dashAspect = aspects.length ? median(aspects) : 0;

  // 结构张量(峰值带)
  let Jxx = 0,
    Jyy = 0,
    Jxy = 0,
    n = 0;
  for (let y = 1; y < bandH - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = (band[y * w + x + 1] - band[y * w + x - 1]) / 2;
      const gy = (band[(y + 1) * w + x] - band[(y - 1) * w + x]) / 2;
      Jxx += gx * gx;
      Jyy += gy * gy;
      Jxy += gx * gy;
      n++;
    }
  }
  Jxx /= n;
  Jyy /= n;
  Jxy /= n;
  const tr = Jxx + Jyy;
  const det = Jxx * Jyy - Jxy * Jxy;
  const root = Math.sqrt(Math.max((tr * tr) / 4 - det, 0));
  const l1 = tr / 2 + root,
    l2 = tr / 2 - root;
  const coherence = (l1 - l2) / (l1 + l2 || 1e-12);
  // 主梯度角,归一到 [0,180):90 = 横向条纹(梯度竖直)
  let gradAngleDeg = (0.5 * Math.atan2(2 * Jxy, Jxx - Jyy) * 180) / Math.PI;
  gradAngleDeg = ((gradAngleDeg % 180) + 180) % 180;

  // 纵向波长(峰值带,沿列做 FFT)
  const cols = [];
  for (let x = 0; x < w; x += 7) {
    const c = new Float64Array(bandH);
    for (let y = 0; y < bandH; y++) c[y] = band[y * w + x];
    cols.push(c);
  }
  const specY = meanSpectrum(cols, bandH);
  let kBest = 1;
  for (let k = 2; k < specY.length; k++) if (specY[k] > specY[kBest]) kBest = k;
  const nY = 1 << Math.ceil(Math.log2(bandH));
  const peakWavelengthPx = nY / Math.max(kBest, 1);

  /* 尖峰度:在**墨点层**上量(有序抖动的网格残留住在那儿,不在平滑的密度场上)。
   * 连续输入退化为对去趋势场量,取行/列两个方向的较大者。 */
  const artSrc = isBilevel
    ? (() => {
        const a = new Float64Array(w * bandH);
        for (let i = 0; i < a.length; i++) a[i] = peakMask[i] ? 1 : -1;
        return a;
      })()
    : band;
  const artRows = [];
  for (let y = 0; y < bandH; y += 3) artRows.push(artSrc.subarray(y * w, y * w + w));
  const artCols = [];
  for (let x = 0; x < w; x += 7) {
    const c = new Float64Array(bandH);
    for (let y = 0; y < bandH; y++) c[y] = artSrc[y * w + x];
    artCols.push(c);
  }
  const gridArtifact = Math.max(
    spikiness(meanSpectrum(artRows, w)),
    spikiness(meanSpectrum(artCols, bandH))
  );

  return {
    bandRms: rms.map((v) => +v.toFixed(2)),
    curve: curve.map((v) => +v.toFixed(3)),
    peakBand: peak,
    foregroundFlatness: +foregroundFlatness.toFixed(3),
    featureCoverage: +featureCoverage.toFixed(1),
    coherence: +coherence.toFixed(3),
    gradAngleDeg: +gradAngleDeg.toFixed(1),
    dashAspect: +dashAspect.toFixed(2),
    dashRunPx: { w: dashW, h: dashH },
    peakWavelengthPx: +peakWavelengthPx.toFixed(1),
    gridArtifact: +(100 * gridArtifact).toFixed(2), // 百分比
  };
}

/* ═══════════════════════════ 评分 ═══════════════════════════════════════ */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** 角度在 mod 180 意义下的最小距离 */
const angDist = (a, b) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};

function score(m, base) {
  const s = {};
  s.foregroundFlatness = clamp01(1 - (m.foregroundFlatness - 0.15) / 0.2);
  s.curveCorrelation = clamp01((pearson(m.curve, base.curve) - 0.3) / 0.55);
  const dp = Math.abs(m.peakBand - base.peakBand);
  s.peakBand = dp <= 1 ? 1 : dp === 2 ? 0.5 : 0;
  s.featureCoverage = clamp01(1 - (Math.abs(m.featureCoverage - base.featureCoverage) - 5) / 10);
  /* 划线长宽比按**本 baseline 自己的值**打分,不设全局「≥2.5」——横向拉长是
   * 中景那一档的特征(3.5),近景特写在峰值带本就接近方形(1.5),而奥伯拉丁用的
   * 是各向同性抖动(1.0)。相对误差 40% 以内满分。 */
  s.dashAspect = clamp01(1 - (Math.abs(m.dashAspect - base.dashAspect) / base.dashAspect - 0.4) / 0.6);
  s.gridArtifact = clamp01(1 - (m.gridArtifact - 2) / 8);
  s.coherence = base.coherence == null ? null : clamp01((m.coherence - 0.55) / 0.3);
  s.gradAngleDeg =
    base.gradAngleDeg == null ? null : clamp01(1 - (angDist(m.gradAngleDeg, 90) - 8) / 22);

  let total = 0,
    wsum = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (s[k] == null) continue;
    total += w * s[k];
    wsum += w;
  }
  return { per: s, total: +(total / wsum).toFixed(3), correlation: +pearson(m.curve, base.curve).toFixed(3) };
}

/* ═══════════════════════════ 输出 ═══════════════════════════════════════ */

const ROWS = [
  ["foregroundFlatness", "前景平坦度 (前景RMS/峰值)", "≤ 0.15", (m) => m.foregroundFlatness],
  ["coherence", "结构张量相干度", "≥ 0.85", (m) => m.coherence],
  ["curveCorrelation", "分带对比度曲线相关", "≥ 0.85", (m, sc) => sc.correlation],
  ["peakBand", "峰值所在带", "±1", (m) => m.peakBand],
  ["dashAspect", "暗划线长宽比", "±40%", (m) => m.dashAspect],
  ["gradAngleDeg", "主梯度角 (90=横纹)", "90±8", (m) => m.gradAngleDeg],
  ["featureCoverage", "峰值带特征覆盖率 %", "±5pp", (m) => m.featureCoverage],
  ["gridArtifact", "谱尖峰度 % (抓 Bayer 网纹)", "< 2", (m) => m.gridArtifact],
];

function report(name, m, base, sc) {
  const bar = (v) => (v == null ? "  —  " : v >= 0.85 ? " PASS" : v >= 0.5 ? " WARN" : " FAIL");
  console.log(`\n  ${name}`);
  console.log(`  基线: ${base.label}`);
  console.log("  " + "─".repeat(74));
  console.log(
    "  " +
      "指标".padEnd(30) +
      "实测".padStart(9) +
      "基线".padStart(9) +
      "目标".padStart(9) +
      "  判定"
  );
  console.log("  " + "─".repeat(74));
  for (const [key, label, target, get] of ROWS) {
    const v = get(m, sc);
    const b = key === "curveCorrelation" ? 1.0 : base[key];
    console.log(
      "  " +
        label.padEnd(30) +
        String(v ?? "—").padStart(9) +
        String(b ?? "—").padStart(9) +
        String(target).padStart(9) +
        " " +
        bar(sc.per[key])
    );
  }
  console.log("  " + "─".repeat(74));
  console.log(`  分带 RMS: [${m.bandRms.join(", ")}]`);
  console.log(`  归一曲线: [${m.curve.join(", ")}]`);
  console.log(`  暗游程 中位宽 ${m.dashRunPx.w}px / 中位高 ${m.dashRunPx.h}px · 纵向波长 ${m.peakWavelengthPx}px`);
  console.log(`\n  加权总分  ${sc.total.toFixed(3)}   ${sc.total >= 0.8 ? "✓ 达标 (≥0.80)" : "✗ 未达标 (需 ≥0.80)"}\n`);
}

/* ═══════════════════════════ 入口 ═══════════════════════════════════════ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFDIR = path.join(HERE, "..", "docs", "water-refs");

async function verifyBaseline() {
  console.log("\n  自检:对 docs/water-refs/ 下的三张参考图重跑指标");
  console.log("  (改动本脚本算法后必须重跑,并把新值同步回 BASELINES)\n");
  for (const key of ["near", "mid", "obra"]) {
    const base = BASELINES[key];
    const f = path.join(REFDIR, base.ref);
    if (!existsSync(f)) {
      console.log(`  [跳过] ${base.ref} 不存在`);
      continue;
    }
    const img = await loadGray(f);
    const m = analyze(img, base.polarity);
    const sc = score(m, base);
    report(`${key}  ${base.ref}  (${img.w}×${img.h})`, m, base, sc);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--verify-baseline")) return verifyBaseline();

  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    console.log(`
  用法:
    node scripts/water-metrics.mjs <img> --baseline near|mid|obra
    node scripts/water-metrics.mjs --verify-baseline

  baseline 决定对照哪张参考图,也决定特征侧(near/mid=暗划线,obra=亮墨点)。
`);
    process.exit(1);
  }
  const bi = argv.indexOf("--baseline");
  const key = bi >= 0 ? argv[bi + 1] : "near";
  const base = BASELINES[key];
  if (!base) {
    console.error(`未知 baseline: ${key}(可选 ${Object.keys(BASELINES).join(" / ")})`);
    process.exit(1);
  }
  const img = await loadGray(file);
  const m = analyze(img, base.polarity);
  const sc = score(m, base);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ file, baseline: key, metrics: m, score: sc }, null, 2));
  } else {
    report(`${path.basename(file)}  (${img.w}×${img.h})`, m, base, sc);
  }
  process.exitCode = sc.total >= 0.8 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
