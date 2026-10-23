#!/usr/bin/env node
/**
 * scripts/orb-pack.mjs —— 把抖好的灯球帧打成一张精灵图
 *
 *   node scripts/orb-dither.mjs <raw_dir> <dith_dir> --pixel 2 --aniso 0 --contrast 2.2
 *   node scripts/orb-pack.mjs   <dith_dir> public/orb/orb-loop --cols 8 --deg 90
 *
 * 产出三个文件:
 *   orb-loop.png    精灵图。**只存「哪些像素是 paper」的 1-bit 掩码**
 *   orb-loop.json   帧尺寸 / 行列 / 球心球径 / 每帧转角
 *   orb-still.png   第 1 帧的同款掩码,首屏先画它,动图到了再换
 *
 * ── 为什么存掩码而不是存彩色图 ──────────────────────────────────────────
 * 水面每帧从 `:root` 读 `--water-ink` / `--water-paper`(`readInkPaper()`),
 * 主题一换,水跟着换。灯球要是把色值烤进 PNG,主题切换时水变了球不变 ——
 * 两层立刻不是同一种材质了。所以 PNG 只存拓扑,颜色交给 CSS:
 *   底层:`border-radius:50%` 的 `--water-ink` 圆(球是正对镜头的球,
 *         轮廓就是个圆,不必为它再存一张图)
 *   上层:`--water-paper` 的实心块 + 这张掩码
 * 顺带:两色调色板 PNG 比 RGBA 小约 20%。
 *
 * ── 抖动的 --pixel 怎么配 ───────────────────────────────────────────────
 * 水面的 `uDitherPixel` 是**后备缓冲像素**,而后备缓冲 = CSS 尺寸 × dpr(封顶 2)
 * × renderScale。DPR 2、档位 0 时,水面一个抖动格 = 2 设备像素。
 * 精灵图在 DOM 里:帧宽 F 按 CSS 宽 D 显示时,一个精灵像素 = 2·D/F 设备像素,
 * 一个抖动格 = 2·PIXEL·D/F 设备像素。要等于 2 就得 **PIXEL · D = F**。
 * 球的屏幕直径由水面标定的 `radiusNdc` 定(night 0.16 → 视口高的 16%),
 * 交付这版是 F = 360 配 PIXEL = 2。
 */
import sharp from "sharp";
import { readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const [SRC, OUT] = argv.filter((a) => !a.startsWith("--"));
if (!SRC || !OUT) {
  console.error("用法: node scripts/orb-pack.mjs <dith_dir> <out_prefix> [--cols 8] [--deg 90]");
  process.exit(1);
}
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
/** 整个循环转过多少度。球是 4 重对称的,所以 90° 就回到自己(见 blender/orb-build.py) */
const LOOP_DEG = flag("--deg", 90);
const COLS = flag("--cols", 8);

const files = readdirSync(SRC).filter((f) => f.endsWith(".png")).sort();
if (files.length === 0) {
  console.error(`${SRC} 里没有 png`);
  process.exit(1);
}
const first = await sharp(path.join(SRC, files[0])).metadata();
const F = first.width ?? 0;
if (F !== first.height) {
  console.error(`帧不是正方形:${first.width}×${first.height}`);
  process.exit(1);
}
const rows = Math.ceil(files.length / COLS);

/* ── 逐帧读成「paper 掩码」──────────────────────────────────────────────
 * paper = 不透明(alpha ≥ 128)且被抖成纸色。抖动只有两种颜色,拿绿色通道
 * 一刀切就够:ink #32331a 的 G=0x33,paper #e6fefd 的 G=0xfe。 */
const sheetW = F * COLS;
const sheetH = F * rows;
const sheet = Buffer.alloc(sheetW * sheetH); // 0 = 不是 paper
let ballMinX = F;
let ballMaxX = -1;
let ballMinY = F;
let ballMaxY = -1;

for (let n = 0; n < files.length; n++) {
  const { data, info } = await sharp(path.join(SRC, files[n])).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== F || info.height !== F) {
    console.error(`${files[n]} 尺寸 ${info.width}×${info.height} 与首帧 ${F} 不一致`);
    process.exit(1);
  }
  const ox = (n % COLS) * F;
  const oy = Math.floor(n / COLS) * F;
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      const i = (y * F + x) * 4;
      const opaque = data[i + 3] >= 128;
      if (opaque) {
        /* 顺便量球的包围盒。第 1 帧量一次不够 —— 瓦片略微凸出球面且带抖动,
         * 轮廓每帧会差一两个像素,取所有帧的并集才不会把边缘切掉。 */
        if (x < ballMinX) ballMinX = x;
        if (x > ballMaxX) ballMaxX = x;
        if (y < ballMinY) ballMinY = y;
        if (y > ballMaxY) ballMaxY = y;
      }
      if (opaque && data[i + 1] > 128) sheet[(oy + y) * sheetW + ox + x] = 255;
    }
  }
}

mkdirSync(path.dirname(OUT), { recursive: true });
const png = { palette: true, colours: 2, compressionLevel: 9, effort: 10 };

/* ── 掩码必须带 alpha 通道,不能只是黑白灰度 ─────────────────────────────
 * CSS `mask-image` 的默认 `mask-mode: match-source` 对**图片**取的是 alpha。
 * 一张没有 alpha 通道的黑白 PNG,在它眼里是「处处不透明」—— 掩码什么都不挡,
 * 被遮的那层整块露出来。踩过:页面上灯球变成一个 83×83 的纯 --water-paper
 * 方块,而且怎么换帧都一样(因为整块都是实的,mask-position 挪了也看不出来)。
 * 所以这里出 RGB=白 + A=掩码 的 RGBA,再让 PNG 量化成「透明 + 白」两色调色板
 * (tRNS);组件那边另外把 `mask-mode` 显式钉成 alpha,两道保险。 */
const withAlpha = (m, w, h) => {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = m[i];
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
};

await withAlpha(sheet, sheetW, sheetH).png(png).toFile(`${OUT}.png`);

/* 首帧单独出一张:首屏先画静帧,动图下完再换。7 KB 对 0.4 MB。 */
const still = Buffer.alloc(F * F);
for (let y = 0; y < F; y++) still.set(sheet.subarray(y * sheetW, y * sheetW + F), y * F);
const stillPath = `${path.dirname(OUT)}/${path.basename(OUT).replace(/-loop$/, "")}-still.png`;
await withAlpha(still, F, F).png(png).toFile(stillPath);

const meta = {
  frame: F,
  cols: COLS,
  rows,
  count: files.length,
  /* 球在帧内的位置。DOM 那层要用它把球心对到 uOrbCenter 的投影上 ——
   * 帧里球外还有一圈透明边,直接拿帧宽当球径会偏。 */
  ball: {
    cx: (ballMinX + ballMaxX + 1) / 2,
    cy: (ballMinY + ballMaxY + 1) / 2,
    r: Math.max(ballMaxX - ballMinX + 1, ballMaxY - ballMinY + 1) / 2,
  },
  loopDeg: LOOP_DEG,
  degPerFrame: LOOP_DEG / files.length,
};
writeFileSync(`${OUT}.json`, `${JSON.stringify(meta, null, 2)}\n`);

const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`→ ${OUT}.png   ${sheetW}×${sheetH}  ${files.length} 帧 (${COLS}×${rows})  ${kb(`${OUT}.png`)} KB`);
console.log(`→ ${stillPath}  ${F}×${F}  ${kb(stillPath)} KB`);
console.log(`→ ${OUT}.json  球心 (${meta.ball.cx}, ${meta.ball.cy}) 半径 ${meta.ball.r}  ${meta.degPerFrame.toFixed(3)}°/帧`);
