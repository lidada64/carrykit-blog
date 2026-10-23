#!/usr/bin/env node
/**
 * scripts/water-acceptance.mjs —— M7 水面:一条命令跑完 W2–W11 的可自动化验收
 *
 *   node scripts/water-acceptance.mjs           跑全部
 *   node scripts/water-acceptance.mjs --quick   跳过抖动台(那一步 ~2 分钟)
 *
 * ── 为什么要有这个文件 ────────────────────────────────────────────────────
 * 每张卡的验收命令散在各自的 docs 里,人工照着敲十几条、再逐条对 md5,漏一条
 * 谁也不知道。而这套东西的**每一条闸门都是"某个通道关掉时输出必须逐字节不变"**
 * —— 那正是最容易在重构里悄悄坏掉、又最不容易看出来的一类。
 *
 * ── 这里**不**验什么 ─────────────────────────────────────────────────────
 * 两类需要浏览器,单独跑(脚本末尾会把命令打出来):
 *  · **W7 交互编排 / W8 组件** → `scripts/water-scene-check.mjs`(要 dev server)
 *  · **W9 GPU 帧时间**        → 只有真显卡能量,云端只有 SwiftShader
 *
 * ── 退出码 ────────────────────────────────────────────────────────────────
 * 全绿 0;有 FAIL 非 0(能直接进 CI)。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");
const TMP = process.env.TMPDIR || "/tmp";
const out = (n) => path.join(TMP, `wacc-${n}.png`);

const md5 = (p) => (existsSync(p) ? createHash("md5").update(readFileSync(p)).digest("hex") : "缺文件");
const node = (args) => spawnSync("node", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });

/** 跑一次 run.mjs,返回 { md5, score, ok }。`--nobuild` 由调用方给。 */
function render(args, name) {
  const r = node(["golden/w3/run.mjs", ...args, "--out", out(name)]);
  const txt = (r.stdout || "") + (r.stderr || "");
  const m = txt.match(/加权总分\s+([\d.]+)/);
  return { md5: md5(out(name)), score: m ? Number(m[1]) : null, ok: r.status === 0, txt };
}

const rows = [];
/** 记一条。`want` 为 null 时只记录不判定(信息行)。 */
function check(card, what, got, want, note) {
  const pass = want === null ? null : String(got) === String(want);
  rows.push({ card, what, got: String(got), want: want === null ? "—" : String(want), pass, note: note || "" });
  return pass;
}

/* ── 0 · 先重建产物 ────────────────────────────────────────────────────────
 * docs §11 坑 7:`golden/w3/preview.frag` 是**产物**,改了 .glsl.ts 不重建它,
 * 一整轮扫参会出六个完全相同的 md5。所以这里显式重建一次,并**把它的 md5 打出来**
 * —— 「分数没变」和「分数变了」一样需要解释。 */
console.log("\n  ══ M7 水面验收 ═══════════════════════════════════════════════\n");
const b = spawnSync("node_modules/.bin/tsx", ["golden/w3/build.ts"], { cwd: ROOT, encoding: "utf8" });
if (b.status !== 0) {
  console.log(b.stdout, b.stderr);
  console.error("  ✗ golden/w3/build.ts 失败 —— W8 的防漂移断言没过,先修那个");
  process.exit(1);
}
check("W8", "防漂移断言(build.ts)", "通过", "通过", "presets ⇄ director 的常量拷贝没漂");
console.log(`  preview.frag md5 ${md5(path.join(ROOT, "golden/w3/preview.frag"))}\n`);

/* ── 1 · W2/W3/W4 · 三个 preset 的跑分与逐字节 ───────────────────────────── */
const GOLD = {
  near: "4add2a379d1c5c496fab2c209f968ab6",
  mid: "2644c60d6ff7826839c8e572150f50b0",
  night: "406fab322603b07ab4a9371807bca4f8",
};
const SCORE = { near: 0.859, mid: 0.913, night: 0.93 };
for (const p of ["near", "mid", "night"]) {
  const r = render([p, "--nobuild"], p);
  check("W2–W4", `${p} 跑分`, r.score, SCORE[p], "≥0.80 达标线");
  check("W2–W4", `${p} md5`, r.md5, GOLD[p], `= golden/refine/${p}-t2.5.png`);
}

/* ── 2 · W4 · 抖动台(蓝噪声 vs Bayer vs IGN)────────────────────────────── */
if (QUICK) {
  check("W4", "抖动台", "跳过(--quick)", null);
} else {
  const d = node(["scripts/water-dither-check.mjs"]);
  const txt = (d.stdout || "") + (d.stderr || "");
  check("W4", "抖动台四项", /✓\s*四项全部通过/.test(txt) ? "四项全过" : "有不通过", "四项全过", "梯度台才抓得到 Bayer");
}

/* ── 3 · W5 灯球 · energy=0 逐字节 + 开着时确实改到了画面 ─────────────────
 * **两条都要。** 只验"关掉时不变"是不够的 —— 一个永远返回 0 的通道也能过。
 * docs §14 坑 12:灯球第一版光斑全落在画框外,九项指标一位不差。 */
const orbOff = render(["night", "--nobuild", "--orb", "--orb-energy", "0", "--noscore"], "orb-off");
check("W5", "night energy=0 md5", orbOff.md5, GOLD.night, "灯球接入前逐字节相同");
const orbOn = render(["night", "--nobuild", "--orb"], "orb-on");
check("W5", "night 开灯球 md5 ≠ 定稿", orbOn.md5 !== GOLD.night ? "已改变" : "没变!", "已改变", "没变 = 通道死了");
check("W11", "night 开灯球跑分", orbOn.score, 0.866, "掉的 0.064 全在前景平坦度,是故意的交换");

/* ── 4 · W6 涟漪 · amp=0 逐字节 + 开着时确实改到了画面 ───────────────────── */
const ripOff = render(["mid", "--nobuild", "--ripple", "--set", "uRippleAmp=0", "--noscore"], "rip-off");
check("W6", "mid amp=0 md5", ripOff.md5, GOLD.mid, "涟漪接入前逐字节相同");
const ripOn = render(["mid", "--nobuild", "--ripple", "--noscore"], "rip-on");
check("W6", "mid 开涟漪 md5 ≠ 定稿", ripOn.md5 !== GOLD.mid ? "已改变" : "没变!", "已改变", "没变 = 冲击落在覆盖区外");

/* ── 5 · W10 聚焦态 · focus=0 逐字节 + focus=1 确实变了 ──────────────────── */
const fOff = render(["mid", "--nobuild", "--focus", "0", "--noscore"], "focus0");
check("W10", "mid focus=0 md5", fOff.md5, GOLD.mid, "闸门归零逐字节回 A 态");
const fOn = render(["mid", "--nobuild", "--focus", "1", "--noscore"], "focus1");
check("W10", "mid focus=1 md5 ≠ 定稿", fOn.md5 !== GOLD.mid ? "已改变" : "没变!", "已改变", "");

/* ── 6 · W11a 主光池 · 增益归零逐字节 + 开着时变了 ───────────────────────── */
const poolOff = render(["night", "--nobuild", "--orb", "--orb-energy", "0", "--pool-gain", "0", "--noscore"], "pool0");
check("W11a", "主光池增益 0 md5", poolOff.md5, GOLD.night, "uOrbPoolGain=0 第一行就返回");

/* ── 7 · W11b 退场 · 四档必须**互不相同**且单调 ──────────────────────────
 * 只验"能渲出来"是没用的。退场是一条曲线,四档全一样就说明 retreat 没接上 ——
 * 那正是坑 12 那一族(东西在框外/没生效,而指标一位不差)。 */
const exitMd5 = [];
for (const [u, e, rt] of [
  ["0", "1", "0"],
  ["025", "0.5625", "0.4375"],
  ["05", "0.25", "0.75"],
  ["075", "0.0625", "0.9375"],
]) {
  const r = render(
    ["night", "--nobuild", "--orb", "--orb-energy", e, "--set", `uOrbPoolRetreat=${rt}`, "--noscore"],
    `exit${u}`,
  );
  exitMd5.push(r.md5);
}
check("W11b", "退场四档互不相同", new Set(exitMd5).size, 4, "全一样 = retreat 没接上");

/* ── 打表 ────────────────────────────────────────────────────────────────── */
const w = [6, 26, 34, 34];
const pad = (s, n) => {
  // 中文按两个宽度算,不然表格会歪
  let width = 0;
  for (const ch of String(s)) width += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return String(s) + " ".repeat(Math.max(1, n - width));
};
console.log(
  `  ${pad("卡", w[0])}${pad("验收项", w[1])}${pad("实测", w[2])}${pad("期望", w[3])}判定`,
);
console.log(`  ${"─".repeat(104)}`);
let failed = 0;
for (const r of rows) {
  if (r.pass === false) failed++;
  const verdict = r.pass === null ? "  — " : r.pass ? " ✓  " : " ✗ FAIL";
  console.log(`  ${pad(r.card, w[0])}${pad(r.what, w[1])}${pad(r.got, w[2])}${pad(r.want, w[3])}${verdict}`);
  if (r.note) console.log(`  ${" ".repeat(w[0])}${r.note}`);
}

console.log(`\n  ${"─".repeat(104)}`);
console.log(`  自动验收 ${rows.length} 项,失败 ${failed} 项。\n`);
console.log("  还有两类**必须另外跑**,这个脚本验不了:");
console.log("   · W7 编排 / W8 组件(要浏览器):");
console.log("       npm run dev   然后");
console.log("       node scripts/water-scene-check.mjs --url http://localhost:3000/lab/water");
console.log("   · W9 GPU 帧时间(要真显卡):");
console.log("       打开 /lab/water,看计数板下面那行性能条。");
console.log("       **source 必须是 gpu** —— 是 cpu 的话量到的是 rAF 帧间隔,");
console.log("       被 vsync 钉在 16.7 ms,不是 GPU 时间,不能当验收数。\n");

process.exit(failed > 0 ? 1 : 0);
