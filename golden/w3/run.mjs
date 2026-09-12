#!/usr/bin/env node
/**
 * golden/w3/run.mjs —— 三个 preset 的渲染 + 跑分入口(W3 扫参用)
 *
 *   node golden/w3/run.mjs <mid|near|night> [--time 2.5] [--out /tmp/x.png]
 *                          [--raw] [--set uX=1 ...] [--noscore]
 *
 * --raw = uDitherQuantize 0(连续灰度)。**调物理时先看这个**,抖动会掩盖问题(W1 教训)。
 * 未被 --set 覆盖的 uniform 走 PRESETS 里的值。
 *
 * **W8 起 PRESETS 不在本文件里** —— 它从 `src/components/lab/water/presets.ts`
 * import 进来,站点组件跑的是同一份数。想改参数请去那边改。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ── W8:参数只有一份 ──────────────────────────────────────────────────────
 * 三个 preset 的**全部**参数(相机 / 波场 / 着色 / 灯球 / 涟漪)现在住在
 * `src/components/lab/water/presets.ts` —— 站点组件 `water-scene.tsx` 与
 * 预览台跑的是同一份。本文件从**那里**取,不再自己抄一遍;
 * 抄一遍就是 docs §11 坑 7 那一族(产物与源悄悄漂移,而且沉默失效)。
 *
 * 用 `await import()` 而不是静态 import:presets.ts 是 TS,靠 Node 22 的
 * 原生类型擦除加载(同 orb-light.ts 那条路),而它只做 `import type`,
 * 所以裸 node 解析得动。`golden/w3/build.ts` 有一整组断言兜住漂移。 */
const PRESETS_MOD = await import(
  pathToFileURL(path.join(ROOT, "src/components/lab/water/presets.ts")).href
);

/** 三个 preset 的相机 + 波场 + 着色 + 灯球 + 涟漪参数。**唯一真相来源在 presets.ts。** */
export const PRESETS = PRESETS_MOD.WATER_PRESETS;

/** 三个 preset 的球位。W8 起它也是滚动插值的端点(见 water-director.ts 行⑧)。 */
export const ORB_POSES = PRESETS_MOD.WATER_PRESET_ORB_POSES;

/** `preview.frag` 里声明了的 uniform 的默认值(预览台要它,缺一个就拿到 0)。 */
export const UNIFORM_DEFAULTS = PRESETS_MOD.WATER_UNIFORM_DEFAULTS;

/** 三个 preset 的相机(灯球求解要它才能把 NDC 换成世界坐标)。 */
const CAMERA = PRESETS_MOD.WATER_PRESET_CAMERAS;

/** W11a:月光让位量按 energy 插值。**唯一实现在 presets.ts**,这里只是转出来
 *  给 `scripts/gen-water-preview.mjs` 用(它从本文件 import 参数,不另开一条路)。 */
export const moonSpecGainFor = PRESETS_MOD.moonSpecGainFor;


/* 本文件既是命令行入口,也被 scripts/gen-water-preview.mjs `import` 进来取 PRESETS
 * ——参数只该有一份。所以下面的执行部分必须只在**直接运行**时才跑,
 * 否则一次 import 会顺带渲一帧、跑一次分。 */
const SELF = path.resolve(fileURLToPath(import.meta.url));
const MAIN = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (SELF !== MAIN) { /* 被 import:只导出 PRESETS */ } else {

const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith("--")) ?? "mid";
const preset = PRESETS[name];
if (!preset) { console.error(`未知 preset: ${name}`); process.exit(1); }

const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const time = flag("--time", "2.5");
const out = flag("--out", `/tmp/w3-${name}.png`);

const set = { ...preset.set };

/** W11a 主光池的五个旋钮。CLI 名 → uniform 名,只在 `--orb` 分支里生效。 */
const POOL_KEYS = [
  ["--pool-gain", "uOrbPoolGain"],
  ["--pool-r", "uOrbPoolRadius"],
  ["--pool-flat", "uOrbPoolFlat"],
  ["--pool-far", "uOrbPoolFar"],
  ["--pool-near", "uOrbPoolNear"],
  /* W11b 退场后退。**不是美术旋钮,是编排器行⑪的每帧量** —— 放在这里只为
   * 能出退场那几档黄金帧(站点上它由 WaterDirector 驱动)。 */
  ["--pool-retreat", "uOrbPoolRetreat"],
];

/* ── W5 灯球 ──────────────────────────────────────────────────────────────
 *   --orb                 用演示驱动在 t 时刻的球位(orb-light.ts 的 orbDemoSource)
 *   --orb-energy 0.6      总闸门(0 = 完全关闭,输出与灯球接入前逐字节相同)
 *   --orb-x/-y/-r/-spin   直接指定球心 NDC / NDC 半径 / 自转相位,覆盖演示驱动
 *   --moon-halo           夜景的月晕(env-column.ts 的 NIGHT_MOON_HALO)
 *
 * 光斑中心与强度**在这里(CPU)算好**再 --set 进去,shader 里只做 K 次核求和。
 * orb-light.ts 是 TS,靠 Node 22 的原生类型擦除直接 import —— 预览台也 import
 * 同一个文件,两边跑的是同一份代码,不会像 docs §11 坑 7 那样抄着抄着就漂了。 */
const envLights = [];
const orbOn = argv.includes("--orb") || argv.some((a) => a.startsWith("--orb-"));
if (orbOn) {
  const { orbDemoSource, computeOrbUniforms, DEFAULT_ORB_LIGHT_CONFIG } =
    await import(pathToFileURL(path.join(ROOT, "src/components/lab/water/orb-light.ts")).href);
  const s = orbDemoSource()(Number(time));
  /* preset 级的球位(三个相机的几何差太多,一套球位不可能同时对,见 presets.ts 注释)。
   * W8 起这三个数同时是 `water-director.ts` 行⑧的滚动插值端点 —— 组件滚到
   * 某个 preset 的端点时解出来的球位与这里**逐位相同**。 */
  const pose = ORB_POSES[name];
  if (pose) {
    s.screen[1] = pose.screenY;
    s.worldRadius = pose.worldRadius;
    s.radiusNdc = pose.radiusNdc;
  }
  if (flag("--orb-x")) s.screen[0] = Number(flag("--orb-x"));
  if (flag("--orb-y")) s.screen[1] = Number(flag("--orb-y"));
  if (flag("--orb-r")) s.radiusNdc = Number(flag("--orb-r"));
  if (flag("--orb-spin")) s.spinPhase = Number(flag("--orb-spin"));
  if (flag("--orb-R")) s.worldRadius = Number(flag("--orb-R"));
  if (flag("--orb-energy") !== undefined) s.energy = Number(flag("--orb-energy", "1"));
  else s.energy = 1;
  s.lightmapFrame = Math.floor(s.spinPhase * 120);

  const cfg = { ...DEFAULT_ORB_LIGHT_CONFIG };
  if (preset.orb?.envGain !== undefined) cfg.envGain = preset.orb.envGain;
  if (flag("--orb-env-gain")) cfg.envGain = Number(flag("--orb-env-gain"));
  const cam = { ...CAMERA[name], aspect: 1920 / 1080 };
  const u = computeOrbUniforms(s, cfg, cam);

  for (const [k, v] of Object.entries(preset.orb ?? {})) if (k.startsWith("u")) set[k] = v;
  set.uOrbEnergy = s.energy;
  set.uOrbLightMode = 0;
  set.uOrbRadius = s.worldRadius;
  set.uOrbCenter = u.center.join(",");
  set.uOrbPatchCenter = u.patchCenter.join(",");
  set.uOrbPatchRadius = u.patchRadius;
  set.uOrbOmega = u.omega;   // 几何量,不是旋钮 —— preset 里的 uOrbOmega 会被它覆盖
  set.uOrbSpots = Array.from(u.spots).join(",");
  set.uOrbLightmapFrame = s.lightmapFrame;
  if (u.envLight) envLights.push(u.envLight);

  /* ── W11a 主光池 ─────────────────────────────────────────────────────────
   *   --pool-gain 0.04  --pool-r 20  --pool-flat 0.35  --pool-far 2.6  --pool-near 0.55
   *
   * preset 的 `pool` 块打底(near/mid 是 null —— 那两个不开主光池,想在它们上面
   * 试就得把五个旋钮显式给全)。池心**不在这里传** —— 它是 uOrbCenter.xz 的
   * 派生量,shader 直接取,再传一份就会漂(docs §11 坑 7)。 */
  for (const [k, v] of Object.entries(preset.pool ?? {})) set[k] = v;
  for (const [f, k] of POOL_KEYS) if (flag(f) !== undefined) set[k] = Number(flag(f));

  /* 月光让位:**唯一实现在 presets.ts 的 moonSpecGainFor**,这里只是调用。
   * energy=0 时它恒等返回 preset.set.uShadeSpecGain ⇒ 逐字节红线不受影响。 */
  set.uShadeSpecGain = moonSpecGainFor(preset, s.energy);

  console.log(
    `  灯球: NDC(${s.screen[0].toFixed(3)}, ${s.screen[1].toFixed(3)}) r=${s.radiusNdc} ` +
      `energy=${s.energy} spin=${s.spinPhase.toFixed(3)} → 世界(${u.center.map((c) => c.toFixed(2)).join(", ")}) ` +
      `光斑 ${u.activeSpots}/${cfg.maxSpots} 斑块 r=${u.patchRadius.toFixed(2)}m`,
  );
  if (set.uOrbPoolGain > 0) {
    console.log(
      `  主光池: 峰值 ${set.uOrbPoolGain} 横向 r=${set.uOrbPoolRadius}m 平顶 ${set.uOrbPoolFlat} ` +
        `拉长 远${set.uOrbPoolFar}/近${set.uOrbPoolNear} 后退 ${set.uOrbPoolRetreat ?? 0} · ` +
        `月光让位 ${preset.set.uShadeSpecGain} → ${set.uShadeSpecGain}`,
    );
  }
}
/* ── W10 聚焦态 ────────────────────────────────────────────────────────────
 *   --focus 0.75           聚焦渐晕的闸门 0..1
 *   --focus-pool 2.6       池半径(米)
 *   --focus-ambient 0.58   池外残留系数(乘在 body 上)
 *   --focus-grain 2.0      碎粒频率(1/米)
 *   --focus-grain-bias 0.42
 *   --focus-far-keep 0.45  远景带保护
 *
 * **`--focus 0` 必须与不给 `--focus` 逐字节相同** —— 本卡 §3 的硬验收。
 * 所以这个分支**只写渐晕那七个 uniform,一个字都不碰灯球的三条加法通道**:
 * 不设 uOrbEnergy、不打包 uOrbSpots、不往环境列注入。渐晕是乘法通道,
 * 与 energy 互不统属(见 light.glsl.ts 的 uOrbFocus 注释)。
 *
 * 光池的**落点**不是旋钮:它是球心的派生量(uOrbCenter.xz)。这里用同一份
 * `orbWorldCenter`(orb-light.ts)解出来,不另抄一份几何 —— 抄一份就会与球位
 * 悄悄漂开,docs §11 坑 7 那一族。 */
const focusArg = flag("--focus");
const FOCUS_KEYS = [
  ["--focus-pool", "uOrbPoolR"],
  ["--focus-ambient", "uOrbAmbient"],
  ["--focus-grain", "uOrbGrain"],
  ["--focus-grain-bias", "uOrbGrainBias"],
  ["--focus-far-keep", "uOrbFarKeep"],
];
if (focusArg !== undefined || FOCUS_KEYS.some(([f]) => flag(f) !== undefined)) {
  const { orbWorldCenter } = await import(
    pathToFileURL(path.join(ROOT, "src/components/lab/water/orb-light.ts")).href
  );
  const pose = ORB_POSES[name];
  const cam = { ...CAMERA[name], aspect: 1920 / 1080 };
  const c = orbWorldCenter(
    [Number(flag("--orb-x", "-0.44")), pose.screenY],
    pose.radiusNdc,
    pose.worldRadius,
    cam,
  );
  /* preset 的 focus 块打底(near/night 是 null —— 那两个 preset 本卡不动,
   * 想在它们上面试渐晕就得把五个旋钮显式给全)。 */
  for (const [k, v] of Object.entries(preset.focus ?? {})) set[k] = v;
  for (const [f, k] of FOCUS_KEYS) if (flag(f) !== undefined) set[k] = Number(flag(f));
  set.uOrbFocus = focusArg !== undefined ? Number(focusArg) : 1;
  set.uOrbGround = `${c[0]},${c[2]}`;
  if (flag("--orb-spin")) set.uOrbSpinPhase = Number(flag("--orb-spin"));
  console.log(
    `  聚焦: focus=${set.uOrbFocus} 落点(${c[0].toFixed(2)}, ${c[2].toFixed(2)})m 高 ${c[1].toFixed(2)}m ` +
      `池 r=${set.uOrbPoolR}m 池外×${set.uOrbAmbient} 碎粒 ${set.uOrbGrain}/m@${set.uOrbGrainBias} ` +
      `远景保护 ${set.uOrbFarKeep}`,
  );
}

if (argv.includes("--moon-halo")) {
  const { NIGHT_MOON_HALO } = await import(
    pathToFileURL(path.join(ROOT, "src/components/lab/water/env-column.ts")).href
  );
  const spec = flag("--moon-halo", "");
  if (spec && spec.includes(",")) {
    const [g, w] = spec.split(",").map(Number);
    envLights.push({ ...NIGHT_MOON_HALO, gain: g, width: w });
  } else envLights.push(NIGHT_MOON_HALO);
}

/* ── W6 涟漪 ──────────────────────────────────────────────────────────────
 *   --ripple                 用本 preset 的默认涟漪(见各 preset 的 ripple 块)
 *   --ripple-steps / -dt / -world / -speed / -damping / -sponge / -sponge-k
 *   --ripple-amp / -size / -probe        任何一个都覆盖 preset 默认值
 *   --ripple-impulse x,y,强度,半径[,步]   可重复;给了就完全取代 preset 的冲击
 *
 * 全部原样透传给渲染台 —— 求解与探针都在那边(scripts/water-harness.mjs)。
 * **near 没有 ripple 块**:用户明确要求 near 不做下一步,涟漪在 near 上保持关闭。 */
const RIPPLE_KEYS = ["steps", "dt", "world", "speed", "damping", "sponge", "sponge-k", "amp", "size", "probe"];
const rippleArgs = [];
if (argv.includes("--ripple") || argv.some((a) => a.startsWith("--ripple-"))) {
  const rp = preset.ripple;
  if (!rp) {
    console.error(`  preset ${name} 没有配涟漪(near 按用户要求保持关闭)。要试就显式给 --ripple-* 全套。`);
  }
  const opt = { ...(rp ?? {}) };
  for (const k of RIPPLE_KEYS) {
    const v = flag(`--ripple-${k}`);
    if (v !== undefined) opt[k] = v;
  }
  const cli = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--ripple-impulse") cli.push(argv[i + 1]);
  const impulses = cli.length ? cli : opt.impulse ? [opt.impulse] : [];
  delete opt.impulse;
  for (const k of RIPPLE_KEYS) if (opt[k] !== undefined) rippleArgs.push(`--ripple-${k}`, String(opt[k]));
  for (const s of impulses) rippleArgs.push("--ripple-impulse", s);
}

for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--set") continue;
  const [k, v] = argv[i + 1].split("=");
  set[k] = v.includes(",") ? v : Number(v);
}
if (argv.includes("--raw")) set.uDitherQuantize = 0;

/* preview.frag 是 build.ts 从 field/shade.glsl.ts 拼出来的产物。W2 手抄 preview.frag
 * 导致过悄悄漂移;这里再踩了一次同一个坑的变体——build.ts 存在但没人跑,改了
 * field.glsl.ts 却在用旧 .frag 跑分,一整轮扫参出来六个完全相同的 md5。
 * 所以每次跑分前强制重建,除非显式 --nobuild。 */
if (!argv.includes("--nobuild")) {
  /* 环境列的注入项(灯球在水里的倒影 / 夜景月晕)是**烘进 LUT** 的,不是 shader 里
   * 现算的 —— 所以要在这里传给 build.ts。一个都不注入时 LUT 与 W4 定稿逐字节相同。 */
  const bargs = ["golden/w3/build.ts"];
  for (const l of envLights) bargs.push("--env-light", `${name}=${l.sinElev},${l.width},${l.gain}`);
  /* 用 `node --import tsx` 跑 build.ts,而不是 spawn `node_modules/.bin/tsx`:后者在
   * Windows 上要么找不到(无扩展的 Unix 可执行)、要么走 shell 时正斜杠被 cmd 拆成
   * `node_modules` 当命令。走 process.execPath + tsx loader 是纯 node 调用,跨平台无坑。
   * build.ts 有无扩展的 import(assemble),必须用 tsx 解析,不能裸 node --experimental-strip-types。 */
  const b = spawnSync(process.execPath, ["--import", "tsx", ...bargs], { cwd: ROOT, encoding: "utf8" });
  if (b.status !== 0) { console.log(b.stdout, b.stderr); process.exit(1); }
}

const args = [
  "scripts/water-harness.mjs",
  "--shader", "golden/w3/preview.frag",
  "--out", out,
  "--time", time,
  "--tex", "uDitherNoise=public/water/blue-noise-128.png",
  "--tex", `uShadeEnvLut=${preset.lut}`,
  ...rippleArgs,
];
if (argv.includes("--cost")) args.push("--cost");
for (const [k, v] of Object.entries(set)) args.push("--set", `${k}=${v}`);

const r = spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
if (r.status !== 0) { console.log(r.stdout, r.stderr); process.exit(1); }
if (r.stderr.trim() && !r.stderr.includes("MODULE_TYPELESS_PACKAGE_JSON")) console.log(r.stderr.trim());
/* 涟漪开着时把渲染台的 stdout 透出来 —— 库朗数、波前探针表都在那儿,
 * 而「波前是不是恒速扩散」这条验收全靠它。平时(不开涟漪)照旧只打分数。 */
if (rippleArgs.length && r.stdout.trim()) console.log(r.stdout.trimEnd());
if (argv.includes("--noscore")) { console.log(`  → ${out}`); process.exit(0); }

const m = spawnSync("node", ["scripts/water-metrics.mjs", out, "--baseline", preset.baseline],
  { cwd: ROOT, encoding: "utf8" });
console.log(m.stdout);

}
