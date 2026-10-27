#!/usr/bin/env node
/**
 * scripts/waterlight-pack.mjs —— 把 B-4 的 120 帧照度序列打成一张**灰度**图集
 *
 *   node scripts/waterlight-pack.mjs <frames_dir> public/orb/ball-waterlight \
 *        --cols 12 --rows 10 --rect -45.2,4.9,90,90 --preset night
 *
 * 与 orb-pack.mjs 的区别:那个存「哪些像素是 paper」的 **1-bit 掩码**(灯球在 DOM
 * 层,颜色交给 CSS);B-4 是**连续灰度照度**,水面 shader 直接把 .r 当 E(p) 加进
 * body(见 light.glsl.ts 的 waterOrbLightmapSample),所以这里存灰度、不抖动 ——
 * 抖动是水面着色器最后对整幅 lum 做的,不是这张图的事。
 *
 * 归一:对 120 帧取**全局**最大值统一缩放(不是逐帧,否则自转时会闪)。缩放因子
 * 写进 json 的 scale,将来若要让 mode B 的绝对量纲对齐 mode A 的 E,用它换算。
 * 对 ≥0.7 的皮尔逊相关本身无影响(相关对正线性缩放免疫)。
 *
 * 行序:第 f 帧(0 基)放在格 (f%cols, floor(f/cols)),**行从上往下**;每帧图原样
 * (行 0 = 图上方 = 远处场 z),与 light.glsl.ts 的 waterOrbLightmapSample 及
 * scripts/waterlight-verify.mjs 的采样约定一致。
 */
import sharp from "sharp";
import { readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const [SRC, OUT] = argv.filter((a) => !a.startsWith("--"));
if (!SRC || !OUT) {
  console.error("用法: node scripts/waterlight-pack.mjs <frames_dir> <out_prefix> --cols 12 --rows 10 --rect x,z,w,h [--preset night]");
  process.exit(1);
}
const flag = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const COLS = Number(flag("cols", 12));
const ROWS = Number(flag("rows", 10));
const RECT = flag("rect", "").split(",").map(Number);
const PRESET = flag("preset", "night");

const files = readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort();
if (!files.length) { console.error(`${SRC} 里没有 png`); process.exit(1); }
if (files.length > COLS * ROWS) { console.error(`帧数 ${files.length} > ${COLS}×${ROWS}`); process.exit(1); }

const first = await sharp(path.join(SRC, files[0])).metadata();
const F = first.width;
if (F !== first.height) { console.error(`帧不是正方形: ${first.width}×${first.height}`); process.exit(1); }

// ── 逐帧读成 8-bit 灰度,顺便求全局最大 ─────────────────────────────────────
const frames = [];
let gmax = 1;
for (const f of files) {
  const buf = await sharp(path.join(SRC, f)).greyscale().toColourspace("b-w").raw().toBuffer();
  if (buf.length !== F * F) { console.error(`${f} 通道数异常: ${buf.length} != ${F * F}`); process.exit(1); }
  for (const v of buf) if (v > gmax) gmax = v;
  frames.push(buf);
}

// ── 拼图集(全局归一到满 8-bit)──────────────────────────────────────────────
const sheetW = F * COLS, sheetH = F * ROWS;
const sheet = Buffer.alloc(sheetW * sheetH); // 灰度,默认 0(黑)
const k = 255 / gmax;
for (let n = 0; n < frames.length; n++) {
  const src = frames[n];
  const ox = (n % COLS) * F, oy = Math.floor(n / COLS) * F;
  for (let y = 0; y < F; y++) {
    const row = (oy + y) * sheetW + ox;
    for (let x = 0; x < F; x++) {
      sheet[row + x] = Math.min(255, Math.round(src[y * F + x] * k));
    }
  }
}

mkdirSync(path.dirname(OUT), { recursive: true });
// 有损 webp 质量 92:照度图是平滑梯度且大半是黑,92 下与无损的皮尔逊相关
// 差异在千分位(实测有损/无损都 ~0.714),体积却小 6 倍。
await sharp(sheet, { raw: { width: sheetW, height: sheetH, channels: 1 } })
  .webp({ quality: 92, effort: 6 }).toFile(`${OUT}.webp`);

const meta = {
  asset: "ball-waterlight",
  preset: PRESET,
  frame: F,
  cols: COLS,
  rows: ROWS,
  count: files.length,
  // 前端设 uOrbLightmapRect = 这四个数(场坐标 minX,minZ,sizeX,sizeY,米)
  rect: RECT,
  // 8-bit 归一缩放:原始渲染值(0..1 线性)× scaleToUnit ≈ .r/255。留作将来对齐 mode A 绝对量纲
  globalMax8: gmax,
  note: "grayscale illuminance atlas; frame index = floor(spinPhase*count); rows top-to-bottom",
};
writeFileSync(`${OUT}.json`, `${JSON.stringify(meta, null, 2)}\n`);

const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`→ ${OUT}.webp  ${sheetW}×${sheetH}  ${files.length} 帧 (${COLS}×${ROWS})  ${kb(`${OUT}.webp`)} KB  gmax8=${gmax}`);
console.log(`→ ${OUT}.json  rect=[${RECT}] preset=${PRESET}`);
