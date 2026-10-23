#!/usr/bin/env node
/**
 * scripts/orb-dither.mjs —— 把 Blender 出的灯球帧,用**水面那一套**量化成 1-bit
 *
 *   node scripts/orb-dither.mjs <in.png|in_dir> <out.png|out_dir> [--pixel 2] [--aniso 0]
 *
 * ── 为什么灯球要走水面的抖动,而不是自己做一套风格化 ────────────────────
 * 灯球在 **DOM 层**(HR-8 的反色凹槽要 `mix-blend-mode` 作用在 `<img>` 上,
 * 球进不了 canvas),水在 **WebGL 层**。两层各画各的,唯一能让它们读起来是
 * **同一种材质**的办法,是共用同一层量化:
 *
 *  · 同一张蓝噪声(`public/water/blue-noise-128.png`,W4 的 void-and-cluster 产物)
 *  · 同一个网格(`floor(frag / uDitherPixel)`,三个 preset 都是 2)
 *  · 同一对色板(`globals.css` 的 `--water-ink` / `--water-paper`)
 *
 * 换任何一条,两层就会出现**两种颗粒打架** —— 那是 docs §4 坑 ① 的同类,
 * 而且在静帧上很难看出来,一动起来立刻露馅。
 *
 * 本文件与 `src/components/lab/water/dither.glsl.ts` 的 `waterDitherThreshold`
 * **逐条对应**,改一边必须改另一边:
 *     dp = floor(frag / uDitherPixel)
 *     dp.x = floor(dp.x * mix(1, 0.30, uDitherAniso))
 *     threshold = blueNoise[(dp + 0.5) / size]      // NEAREST + REPEAT
 *     out = threshold < lum ? paper : ink
 *
 * ── 两个参数怎么取 ──────────────────────────────────────────────────────
 * · `--pixel 2`  与三个 preset 一致。改大颗粒变粗,灯球会比水面"糙",一眼假。
 * · `--aniso 0`  **灯球必须是 0**。各向异性是把阈值图在 x 向压扁,让墨点连成
 *   **横划** —— 那是水面的语言(波脊是横的)。球面没有"横"的理由,
 *   开了会让球看起来在横向流淌。mid 的水面用 0.8,near/night 用 0。
 *
 * ── alpha ───────────────────────────────────────────────────────────────
 * 原样保留(Blender 那边 `film_transparent = True` 出 RGBA)。**不抖 alpha** ——
 * 抖了边缘会碎成锯齿,而灯球是要叠在水面上的,边缘必须干净。
 */
import sharp from "sharp";
import { readdirSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const [SRC, OUT] = pos;
if (!SRC || !OUT) {
  console.error("用法: node scripts/orb-dither.mjs <in.png|in_dir> <out.png|out_dir> [--pixel 2] [--aniso 0] [--contrast 1]");
  process.exit(1);
}
const PIXEL = flag("--pixel", 2);
const ANISO = flag("--aniso", 0);
/**
 * 抖动**之前**绕 0.5 拉的对比度:lum' = 0.5 + (lum − 0.5) × CONTRAST。
 *
 * 水面没有这一档,为什么灯球要:两边的中间调来源根本不同。水面的 lum 是
 * 着色器逐片元**解析算出来**的一个值 —— 亚像素的细节走的是 σ²(把分布展宽),
 * 不是求平均;所以水面的中间调**全都是真的色调**。Cycles 不一样,它在像素内
 * 超采样再平均,瓦片边缘那一两个像素的灰是**抗锯齿**,不是色调。
 *
 * 交付尺寸(球径 328px)下缝宽只有约 3px,两侧各吃掉约 1px 抗锯齿 —— 实心
 * 白芯只剩 1px。直接抖的话整张网格会被噪点啃成毛边,球看上去发灰发糊。
 * 把对比度拉起来等于把这条抗锯齿带压窄回一个像素,留给抖动的就只剩真色调
 * (亮瓦上的高光渐变),那正是参考图的样子:瓦非黑即白,网格是实心白线。
 *
 * 标定尺寸(球径 470px)下缝有 4px 以上,用 1.0 即可。
 */
const CONTRAST = flag("--contrast", 1);

/** = `WATER_DITHER_ANISO_MIN`(dither.glsl.ts)。单独改它会把三个 preset 的
 *  dashAspect 一起推走 —— 那是一套扫出来的数,不是一个可以随手调的常数。 */
const ANISO_MIN = 0.3;

/** 唯一来源是 `src/styles/globals.css` 的 `:root`。**这里不许出现第二套色值。** */
const INK = [0x32, 0x33, 0x1a];
const PAPER = [0xe6, 0xfe, 0xfd];

const NOISE_PATH = "public/water/blue-noise-128.png";
const n = await sharp(NOISE_PATH).greyscale().raw().toBuffer({ resolveWithObject: true });
const NW = n.info.width, NH = n.info.height, ND = n.data;
const mixAniso = 1 + (ANISO_MIN - 1) * ANISO;

async function one(src, out) {
  const img = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = img.info;
  const S = img.data;
  const O = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      /* Rec.709 亮度。Blender 那边 view_transform 必须是 **Standard** ——
       * Filmic/AgX 会把中间调压掉,而 1-bit 抖动**全靠中间调**:
       * 一张只有 0 和 1 的图抖出来就是一张只有 0 和 1 的图。 */
      let lum = (0.2126 * S[i] + 0.7152 * S[i + 1] + 0.0722 * S[i + 2]) / 255;
      if (CONTRAST !== 1) lum = Math.min(1, Math.max(0, 0.5 + (lum - 0.5) * CONTRAST));
      let dpx = Math.floor(x / PIXEL);
      const dpy = Math.floor(y / PIXEL);
      dpx = Math.floor(dpx * mixAniso);
      const t = ND[(((dpy % NH) + NH) % NH) * NW + (((dpx % NW) + NW) % NW)] / 255;
      const c = t < lum ? PAPER : INK;
      O[i] = c[0];
      O[i + 1] = c[1];
      O[i + 2] = c[2];
      O[i + 3] = S[i + 3]; // alpha 原样,不抖
    }
  }
  await sharp(O, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
  return `${W}×${H}`;
}

if (statSync(SRC).isDirectory()) {
  mkdirSync(OUT, { recursive: true });
  const files = readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort();
  let k = 0;
  for (const f of files) {
    await one(path.join(SRC, f), path.join(OUT, f));
    if (++k % 20 === 0 || k === files.length) process.stdout.write(`\r  ${k}/${files.length}`);
  }
  console.log(`\n→ ${OUT}  ${files.length} 帧  pixel=${PIXEL} aniso=${ANISO} contrast=${CONTRAST}`);
} else {
  const dim = await one(SRC, OUT);
  console.log(`→ ${OUT}  ${dim}  pixel=${PIXEL} aniso=${ANISO} contrast=${CONTRAST}`);
}
