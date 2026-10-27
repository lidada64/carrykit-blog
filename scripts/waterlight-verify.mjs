#!/usr/bin/env node
/**
 * scripts/waterlight-verify.mjs —— B-4 `ball-waterlight` 的量尺 + 探针
 *
 * 跑法(必须带类型擦除,同 water-gates.mjs):
 *   NODE_OPTIONS=--experimental-strip-types node scripts/waterlight-verify.mjs <cmd> ...
 *
 * 两个子命令:
 *
 *   probe [preset]                     打印 mode A 的光斑在**场坐标**里的落点包围盒。
 *                                      用来定 uOrbLightmapRect 与 Blender 平面范围。
 *   corr <preset> <atlas.png> \        计算 mode A 与 mode B(渲染出的照度图集)在
 *        --rect x,z,w,h --cols 12 \    **同一帧、同一球位**下的皮尔逊相关。
 *        --rows 10 --frames 120        docs/blender-assets.md B-4 的验收:≥0.7。
 *
 * ── 为什么这条相关必须由本脚本算,而不是"看着像" ────────────────────────────
 * mode A(`orb-light.ts`)是这条通道的**唯一物理定义**:64 片球面 Fibonacci
 * 镜子对主光求反射、与 y=0 求交、按 (1−d²)³ 铺软斑。B-4 是同一件事的预渲染
 * 版本。两者不必逐像素相等(B 允许更软、更有真实光衰减),但**亮的地方必须落在
 * 同一处**——皮尔逊相关就是量这个的,对整体亮度/增益/伽马的线性缩放免疫。
 *
 * mode A 的 E(p) 直接复用 `computeOrbUniforms` 的产物(spots + 同一个核),
 * 不另写一份物理——抄一遍就是 docs §11 坑 7。
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = (p) => pathToFileURL(path.join(ROOT, p)).href;

const ORB = await import(W("src/components/lab/water/orb-light.ts"));
const PRE = await import(W("src/components/lab/water/presets.ts"));
const { computeOrbUniforms, DEFAULT_ORB_LIGHT_CONFIG } = ORB;
const CAMERAS = PRE.WATER_PRESET_CAMERAS;
const POSES = PRE.WATER_PRESET_ORB_POSES;

const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith("--"));
const flag = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const num = (k, d) => {
  const v = flag(k, undefined);
  return v === undefined ? d : Number(v);
};

/** 画布宽高比。screenX 固定为 0(球水平居中)时 aspect 不参与 center.x,取 16/9 无妨。 */
const ASPECT = 16 / 9;

/** 姿态覆盖:命令行可用 --radius/--world/--screenY 覆盖 preset 自带的球位。 */
function poseFor(preset) {
  const base = POSES[preset] ?? POSES.mid;
  return {
    screenY: num("screenY", base.screenY),
    radiusNdc: num("radius", base.radiusNdc),
    worldRadius: num("world", base.worldRadius),
  };
}

/** 构造一帧 OrbState:球水平居中(screenX=0),energy 满,自转相位 = frame/frames。 */
function orbStateFor(preset, frame, frames) {
  const pose = poseFor(preset);
  const spin = ((frame / frames) % 1 + 1) % 1;
  return {
    screen: [0, pose.screenY],
    radiusNdc: pose.radiusNdc,
    energy: 1,
    spinPhase: spin,
    lightmapFrame: Math.floor(spin * frames),
    worldRadius: pose.worldRadius,
  };
}

function uniformsFor(preset, frame, frames) {
  const cam = { ...CAMERAS[preset], aspect: ASPECT };
  return computeOrbUniforms(orbStateFor(preset, frame, frames), DEFAULT_ORB_LIGHT_CONFIG, cam);
}

/** mode A 的照度 E(p):对所有光斑求 (1−d²)³ 核和,与 light.glsl.ts 的 waterOrbSpotSum 同式。 */
function sampleE(spots, n, px, pz) {
  let e = 0;
  for (let i = 0; i < n; i++) {
    const sx = spots[i * 4];
    const sz = spots[i * 4 + 1];
    const inv = spots[i * 4 + 2];
    const w = spots[i * 4 + 3];
    if (!(w > 0)) continue;
    const dx = (px - sx) * inv;
    const dz = (pz - sz) * inv;
    const k = 1 - (dx * dx + dz * dz);
    if (k > 0) e += w * k * k * k;
  }
  return e;
}

if (cmd === "probe") {
  const named = positional.filter((p) => p in POSES);
  const presets = named.length ? named : ["near", "mid", "night"];
  const frames = num("frames", 120);
  for (const preset of presets) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let peakSpot = 0, maxActive = 0;
    let center = null;
    // 扫全 120 帧取落点并集:自转让斑扫过一圈,单帧的包围盒会漏
    for (let f = 0; f < frames; f++) {
      const u = uniformsFor(preset, f, frames);
      center = u.center;
      maxActive = Math.max(maxActive, u.activeSpots);
      for (let i = 0; i < u.activeSpots; i++) {
        const sx = u.spots[i * 4], sz = u.spots[i * 4 + 1];
        const r = 1 / Math.max(u.spots[i * 4 + 2], 1e-6);
        const w = u.spots[i * 4 + 3];
        if (!(w > 0)) continue;
        peakSpot = Math.max(peakSpot, w);
        minX = Math.min(minX, sx - r); maxX = Math.max(maxX, sx + r);
        minZ = Math.min(minZ, sz - r); maxZ = Math.max(maxZ, sz + r);
      }
    }
    if (!isFinite(minX)) { console.log(`${preset}: 没有落到水面的光斑`); continue; }
    // 能量盒:在整个落点范围上粗栅格化 E(p)(所有帧叠加),取横/纵两条边际
    // 分布各含 92% 能量的区间。这剔掉掠射长尾(t→400 的大而暗的斑),
    // 得到"亮结构真正住在哪"的实用矩形。
    const G = 220;
    const colE = new Float64Array(G), rowE = new Float64Array(G);
    for (let f = 0; f < frames; f++) {
      const u = uniformsFor(preset, f, frames);
      for (let gy = 0; gy < G; gy++) {
        const pz = minZ + ((gy + 0.5) / G) * (maxZ - minZ);
        for (let gx = 0; gx < G; gx++) {
          const px = minX + ((gx + 0.5) / G) * (maxX - minX);
          const e = sampleE(u.spots, u.activeSpots, px, pz);
          colE[gx] += e; rowE[gy] += e;
        }
      }
    }
    const band = (arr, lo0, span) => {
      const tot = arr.reduce((s, v) => s + v, 0);
      if (tot <= 0) return [lo0, lo0 + span];
      let acc = 0, a = 0, b = arr.length - 1;
      for (let i = 0; i < arr.length; i++) { acc += arr[i]; if (acc >= 0.04 * tot) { a = i; break; } }
      acc = 0;
      for (let i = 0; i < arr.length; i++) { acc += arr[i]; if (acc >= 0.96 * tot) { b = i; break; } }
      return [lo0 + (a / arr.length) * span, lo0 + ((b + 1) / arr.length) * span];
    };
    const [ex0, ex1] = band(colE, minX, maxX - minX);
    const [ez0, ez1] = band(rowE, minZ, maxZ - minZ);
    const pad = 0.08;
    const ew = ex1 - ex0, eh = ez1 - ez0;
    const rx = ex0 - ew * pad, rz = ez0 - eh * pad;
    const rw = ew * (1 + 2 * pad), rh = eh * (1 + 2 * pad);
    console.log(`── ${preset} ──`);
    console.log(`  球心(场坐标) x=${center[0].toFixed(2)} h=${center[1].toFixed(2)} z=${center[2].toFixed(2)}`);
    console.log(`  最多同时活跃光斑: ${maxActive}/${DEFAULT_ORB_LIGHT_CONFIG.maxSpots}   峰值强度: ${peakSpot.toExponential(2)}`);
    console.log(`  全落点包围盒 x∈[${minX.toFixed(2)}, ${maxX.toFixed(2)}]  z∈[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
    console.log(`  92%能量盒   x∈[${ex0.toFixed(2)}, ${ex1.toFixed(2)}]  z∈[${ez0.toFixed(2)}, ${ez1.toFixed(2)}]`);
    console.log(`  建议 uOrbLightmapRect (能量盒+8%边距): ${rx.toFixed(2)},${rz.toFixed(2)},${rw.toFixed(2)},${rh.toFixed(2)}`);
  }
  process.exit(0);
}

if (cmd === "emit") {
  // 把 Blender 烘焙要用的配置吐成一行 KEY=VALUE。球心来自 orbWorldCenter
  // (orb-light.ts,唯一物理定义处),Blender 侧不再重算 —— 避免 docs §11 坑 7 的漂移。
  const preset = positional[0] ?? "mid";
  const frames = num("frames", 120);
  const rect = flag("rect", "").split(",").map(Number);
  const u0 = uniformsFor(preset, 0, frames);
  const cfg = DEFAULT_ORB_LIGHT_CONFIG;
  const pose = poseFor(preset);
  const out = {
    PRESET: preset,
    FRAMES: frames,
    FACETS: cfg.facetCount,
    MAIN_ELEV: cfg.mainLightElev,
    MAIN_AZ: cfg.mainLightAz,
    SPOT_SPREAD: cfg.spotSpread,
    CENTER_X: u0.center[0],
    CENTER_H: u0.center[1],
    CENTER_Z: u0.center[2],
    ORB_R: pose.worldRadius,
    RECT: rect.length === 4 ? rect.join(",") : "",
  };
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
  process.exit(0);
}

if (cmd === "dumpA") {
  // 把 mode A 的 E(p) 在 rect 上栅格化成一张灰度 PNG,用来和 Blender 渲染肉眼对照。
  const preset = positional[0] ?? "mid";
  const out = positional[1] ?? "modeA.png";
  const rect = flag("rect", "").split(",").map(Number);
  const frames = num("frames", 120);
  const frame = num("frame", 0);
  const G = num("grid", 256);
  const u = uniformsFor(preset, frame, frames);
  const buf = Buffer.alloc(G * G);
  let mx = 0;
  const vals = new Float64Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const uu = (gx + 0.5) / G, vv = (gy + 0.5) / G;
      const px = rect[0] + uu * rect[2];
      const pz = rect[1] + vv * rect[3];
      const e = sampleE(u.spots, u.activeSpots, px, pz);
      // 图像行从上往下 = 大 z 在上(与 Blender 俯视一致):行 gy 对应 v = 1 - ...
      vals[(G - 1 - gy) * G + gx] = e;
      if (e > mx) mx = e;
    }
  }
  for (let i = 0; i < G * G; i++) buf[i] = Math.min(255, Math.round((vals[i] / (mx || 1)) * 255));
  await sharp(buf, { raw: { width: G, height: G, channels: 1 } }).png().toFile(out);
  console.log(`mode A E(p) frame ${frame}: peak=${mx.toExponential(2)} activeSpots=${u.activeSpots} → ${out}`);
  process.exit(0);
}

if (cmd === "corr") {
  const preset = positional[0];
  const atlas = positional[1];
  if (!preset || !atlas) { console.error("用法: corr <preset> <atlas.png> --rect x,z,w,h --cols 12 --rows 10 --frames 120 [--frame f] [--grid 128]"); process.exit(2); }
  const rect = flag("rect", "").split(",").map(Number);
  if (rect.length !== 4) { console.error("--rect x,z,w,h 必填"); process.exit(2); }
  const cols = num("cols", 12), rows = num("rows", 10), frames = num("frames", 120);
  const grid = num("grid", 128);
  const onlyFrame = flag("frame", undefined);

  const meta = await sharp(atlas).metadata();
  const sheetW = meta.width, sheetH = meta.height;
  const cellW = sheetW / cols, cellH = sheetH / rows;
  // toColourspace('b-w') 强制单通道 8-bit —— sharp 的 .greyscale().raw() 会给 3 通道 RGB
  const raw = await sharp(atlas).greyscale().toColourspace("b-w").raw().toBuffer();

  // 取图集第 f 帧在 (u,v)∈[0,1]² 的采样值(v 向上)。行从上往下排、行内翻转:
  // 与 light.glsl.ts 的 waterOrbLightmapSample 完全一致。
  const sampleB = (f, u, v) => {
    const cx = f % cols, cy = Math.floor(f / cols);
    const fx = (cx + u) * cellW;
    const fy = (cy + (1 - v)) * cellH;
    const x = Math.min(sheetW - 1, Math.max(0, Math.round(fx)));
    const y = Math.min(sheetH - 1, Math.max(0, Math.round(fy)));
    return raw[y * sheetW + x] / 255;
  };

  const frameList = onlyFrame !== undefined ? [Number(onlyFrame)]
    : Array.from({ length: 12 }, (_, i) => Math.floor((i * frames) / 12));

  const results = [];
  for (const f of frameList) {
    const u = uniformsFor(preset, f, frames);
    const A = [], B = [];
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const uu = (gx + 0.5) / grid, vv = (gy + 0.5) / grid;
        const px = rect[0] + uu * rect[2];
        const pz = rect[1] + vv * rect[3];
        A.push(sampleE(u.spots, u.activeSpots, px, pz));
        B.push(sampleB(f, uu, vv));
      }
    }
    results.push([f, pearson(A, B)]);
  }
  let sum = 0;
  for (const [f, r] of results) { console.log(`  frame ${String(f).padStart(3)}  pearson = ${r.toFixed(4)}`); sum += r; }
  const mean = sum / results.length;
  console.log(`── 平均皮尔逊相关: ${mean.toFixed(4)}  ${mean >= 0.7 ? "PASS (≥0.7)" : "FAIL (<0.7)"} ──`);
  process.exit(mean >= 0.7 ? 0 : 1);
}

function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    saa += da * da; sbb += db * db; sab += da * db;
  }
  if (saa === 0 || sbb === 0) return 0;
  return sab / Math.sqrt(saa * sbb);
}

console.error(`未知命令: ${cmd}. 用 probe | corr`);
process.exit(2);
