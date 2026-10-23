#!/usr/bin/env node
/**
 * scripts/water-gates.mjs —— 水面的四道闸门,一条命令跑完
 *
 *   node scripts/water-gates.mjs              # 跑 ①②③(纯离线,不要浏览器)
 *   node scripts/water-gates.mjs --with-scene # 外加 ④(需要 dev server 在跑)
 *   node scripts/water-gates.mjs --url http://localhost:3111/lab/water
 *
 * 退出码 0 = 全绿;非 0 = 有闸门没过(可以直接挂进 pre-commit / CI)。
 *
 * ── 为什么要有这个脚本 ───────────────────────────────────────────────────
 * `docs/water-handover.md` §1 把四条红线写成了表格,但**文档会被跳读,
 * 一条会红的命令不会**。这个项目从 W1 到 W11 反复踩的同一类错是
 * 「改动看起来生效了其实没有」或「破坏了东西但九项指标全都没反应」——
 * 唯一不可能被自欺的判据是 md5,所以把它做成一道**必须跑**的闸门。
 *
 * ── 两层比对(这一层是故意的)─────────────────────────────────────────
 * 闸门不只比「这次渲出来的图 == 仓库里的黄金帧」,还比
 * 「**仓库里的黄金帧本身 == 写死在本文件里的 md5**」。
 *
 * 只做前者的话有一个很容易发生的自欺:改坏了画面 → 闸门红 →
 * 顺手把黄金帧重新生成一遍 → 闸门绿了,而画面已经不是定稿那张。
 * 后者把基线钉死在代码里,重设基线因此必须**显式改这个文件**,
 * 而那一行 diff 会出现在 PR 里,有人会问「为什么」。
 *
 * **没有 --update 开关,这是故意的。** 重设基线应该是一次需要解释的动作,
 * 不是一个能顺手敲的 flag。真要重设:改下面 `GOLDEN` 表里的 md5,
 * 在提交信息里写清楚为什么(掉的是哪一项指标、换到了什么)。
 *
 * ── 坑 7 的落点 ──────────────────────────────────────────────────────────
 * `golden/w3/preview.frag` 是**产物**。W3 时一整轮扫参出了六个相同的 md5,
 * 因为没人重建它。所以这里**第一次渲染故意不带 `--nobuild`**(强制重建一次),
 * 之后的四次才带 —— 既保证用的是当前源码,又不浪费四次 esbuild。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* 子进程(渲染台 run.mjs 及它 spawn 的 harness/metrics)靠 Node 的原生类型擦除
 * import 那些 .ts(presets / orb-light 等)。Node <23.6 需要显式 flag —— 用
 * NODE_OPTIONS 注入,子进程自动继承,一处搞定整条链。 */
const CHILD_ENV = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-strip-types`.trim(),
};
const argv = process.argv.slice(2);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};

/**
 * 三个 preset 的定稿帧。**基线钉死在这里**(见文件头「两层比对」)。
 *
 * `score` 是 `golden/w3/run.mjs` 的加权总分,对着实拍照量的相似度。
 * 它**只能证伪不能证真** —— 分数没变和分数变了一样需要解释 —— 但作为
 * 「有没有人不小心改了参数」的哨兵是够用的。
 */
const GOLDEN = {
  near: { png: "golden/refine/near-t2.5.png", md5: "4add2a379d1c5c496fab2c209f968ab6", score: "0.859" },
  mid: { png: "golden/refine/mid-t2.5.png", md5: "2644c60d6ff7826839c8e572150f50b0", score: "0.913" },
  night: { png: "golden/refine/night-t2.5.png", md5: "406fab322603b07ab4a9371807bca4f8", score: "0.930" },
};

/** lint 的既有问题数。**W2–W11 一条都没新增**,超过它说明这次改动引入了新问题。 */
const LINT_BASELINE = 20;

const C = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

const results = [];
function record(gate, name, pass, detail) {
  results.push({ gate, name, pass, detail });
  const tag = pass ? C.ok("PASS") : C.bad("FAIL");
  console.log(`  ${tag}  ${gate} ${name}${detail ? "  " + C.dim(detail) : ""}`);
}

const tmp = mkdtempSync(path.join(tmpdir(), "water-gates-"));
let rebuilt = false;

/** 渲一帧。第一次**强制重建** `preview.frag`(坑 7),之后走 --nobuild。 */
function render(preset, extra, out) {
  const args = [path.join(ROOT, "golden/w3/run.mjs"), preset, "--out", out];
  if (rebuilt) args.push("--nobuild");
  rebuilt = true;
  args.push(...extra);
  try {
    return execFileSync("node", args, { cwd: ROOT, encoding: "utf8", env: CHILD_ENV, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    // 渲染进程自己挂了也是一种 FAIL,把 stderr 带出去,别静默
    return `__RENDER_FAILED__\n${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  }
}

const scoreOf = (out) => (out.match(/加权总分\s+([\d.]+)/) ?? [])[1] ?? "—";

console.log(C.b("\n水面闸门 —— docs/water-handover.md §1\n"));

/* ── 闸门 ⓪ 黄金帧本身没被改过 ──────────────────────────────────────────
 * 先验这一条。它挂了的话,下面三条全都没有意义(基线已经不是基线了)。 */
console.log(C.b("⓪ 黄金帧本身"));
let baselineOk = true;
for (const [name, g] of Object.entries(GOLDEN)) {
  const abs = path.join(ROOT, g.png);
  if (!existsSync(abs)) {
    baselineOk = false;
    record("⓪", name, false, `缺文件 ${g.png}(纯代码 patch 不含黄金帧,见交接书 §0)`);
    continue;
  }
  const got = md5(abs);
  const pass = got === g.md5;
  if (!pass) baselineOk = false;
  record("⓪", name, pass, pass ? g.md5.slice(0, 12) : `${got.slice(0, 12)} ≠ ${g.md5.slice(0, 12)}`);
}
if (!baselineOk) {
  console.log(
    C.bad(
      "\n  黄金帧与钉死的 md5 对不上 —— 有人重新生成过基线。\n" +
        "  这不是「跑一下就好」的问题:先搞清楚为什么变了,再决定是回滚还是显式改本文件里的 GOLDEN 表。\n",
    ),
  );
}

/* ── 闸门 ① 三个 preset 的定稿帧逐字节不变 ────────────────────────────── */
console.log(C.b("\n① 三个 preset(不开灯球)"));
for (const [name, g] of Object.entries(GOLDEN)) {
  const out = path.join(tmp, `${name}.png`);
  const log = render(name, [], out);
  if (log.startsWith("__RENDER_FAILED__")) {
    record("①", name, false, "渲染进程失败:\n" + log.slice(0, 400));
    continue;
  }
  const got = existsSync(out) ? md5(out) : "(没有输出)";
  const score = scoreOf(log);
  const pass = got === g.md5 && score === g.score;
  record("①", name, pass, pass ? `${score} · ${got.slice(0, 12)}` : `分 ${score}(期望 ${g.score}) · ${got.slice(0, 12)}(期望 ${g.md5.slice(0, 12)})`);
}

/* ── 闸门 ② 灯球总闸门归零 ⇒ 逐字节回 night 定稿 ──────────────────────
 * 这条证明的是「没有灯球时就是那片湖」。实现上对应 light.glsl.ts 里
 * uOrbEnergy <= 0 时**精确 return 0.0**,让 x + 0.0 在 IEEE 下逐位恒等。 */
console.log(C.b("\n② 灯球 energy = 0"));
{
  const out = path.join(tmp, "orb0.png");
  const log = render("night", ["--orb", "--orb-energy", "0", "--noscore"], out);
  const got = existsSync(out) ? md5(out) : "(没有输出)";
  const pass = got === GOLDEN.night.md5;
  record("②", "night", pass, pass ? got.slice(0, 12) : `${got.slice(0, 12)} ≠ ${GOLDEN.night.md5.slice(0, 12)}`);
  if (!pass && log.startsWith("__RENDER_FAILED__")) console.log(C.dim(log.slice(0, 400)));
}

/* ── 闸门 ③ 聚焦闸门归零 ⇒ 逐字节回 mid 定稿 ──────────────────────────
 * 对应 waterOrbFocusDim 在 uOrbFocus <= 0 时**精确 return 1.0**(x × 1.0 ≡ x)。 */
console.log(C.b("\n③ 聚焦 focus = 0"));
{
  const out = path.join(tmp, "focus0.png");
  const log = render("mid", ["--focus", "0", "--noscore"], out);
  const got = existsSync(out) ? md5(out) : "(没有输出)";
  const pass = got === GOLDEN.mid.md5;
  record("③", "mid", pass, pass ? got.slice(0, 12) : `${got.slice(0, 12)} ≠ ${GOLDEN.mid.md5.slice(0, 12)}`);
  if (!pass && log.startsWith("__RENDER_FAILED__")) console.log(C.dim(log.slice(0, 400)));
}

/* ── 闸门 ④ 组件:每帧零 DOM 读取 + reduced-motion 定格 ────────────────
 * 需要 dev server,所以**默认跳过**而不是默认失败 —— 一个「没跑」被记成
 * 「没过」会让人开始无视这个脚本,那比不跑还糟。跳过时明确说怎么补上。 */
console.log(C.b("\n④ 组件(零 DOM 读取 / reduced-motion)"));
const withScene = argv.includes("--with-scene") || flag("--url") !== undefined;
if (!withScene) {
  console.log(
    `  ${C.dim("SKIP")}  需要 dev server。补跑:\n` +
      `        ${C.dim("npm run dev")}\n` +
      `        ${C.dim("node scripts/water-gates.mjs --with-scene")}`,
  );
} else {
  const url = flag("--url", "http://localhost:3000/lab/water");
  try {
    const log = execFileSync("node", [path.join(ROOT, "scripts/water-scene-check.mjs"), "--url", url], {
      cwd: ROOT,
      encoding: "utf8",
      env: CHILD_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // 这三行是 water-scene-check.mjs 自己打的判据,这里只做断言不重算
    const reads = (log.match(/回调内布局读取\s+(\d+)/) ?? [])[1];
    const rafDelta = (log.match(/rAF 回调增量\s+(\d+)/) ?? [])[1];
    const frozenSame = /逐字节相同\s*✓/.test(log);
    const spots = [...log.matchAll(/activeSpots\s+(\d+)/g)].map((m) => Number(m[1]));
    const scrollOk = spots.length >= 3 && spots.slice(0, 3).every((n) => n > 0);
    record("④", "每帧零 DOM 读取", reads === "0", `回调内布局读取 ${reads ?? "?"}`);
    record("④", "reduced-motion 定格", rafDelta === "0" && frozenSame, `rAF 增量 ${rafDelta ?? "?"} · 连拍两帧${frozenSame ? "同" : "异"}`);
    record("④", "行⑧ 滚动→球位", scrollOk, `activeSpots ${spots.slice(0, 3).join("/") || "?"}`);
  } catch (e) {
    record("④", "组件验收台", false, `跑不起来(dev server 在 ${url} 吗?)\n${String(e.stderr ?? e.message).slice(0, 300)}`);
  }
}

/* ── 附:lint 基线 ────────────────────────────────────────────────────────
 * 不是「红线」,但顺手 —— 20 problems 是水面之前就有的,W2–W11 一条没新增。 */
console.log(C.b("\n附 lint 基线"));
try {
  const log = execFileSync("npm", ["run", "lint"], { cwd: ROOT, encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const n = Number((log.match(/✖\s+(\d+)\s+problems/) ?? [])[1] ?? 0);
  record("附", "lint", n <= LINT_BASELINE, `${n} problems(基线 ${LINT_BASELINE})`);
} catch (e) {
  const log = String(e.stdout ?? "") + String(e.stderr ?? "");
  const n = Number((log.match(/✖\s+(\d+)\s+problems/) ?? [])[1] ?? -1);
  record("附", "lint", n >= 0 && n <= LINT_BASELINE, n >= 0 ? `${n} problems(基线 ${LINT_BASELINE})` : "eslint 跑不起来");
}

rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.pass);
console.log("");
if (failed.length === 0) {
  console.log(C.ok(C.b("  全部通过。")) + C.dim("  (④ 跳过的话记得在合并前补跑一次)"));
  process.exit(0);
}
console.log(C.bad(C.b(`  ${failed.length} 条没过:`)));
for (const f of failed) console.log(C.bad(`   · ${f.gate} ${f.name}`));
console.log(
  C.dim(
    "\n  分数变了但你什么都没改?先 `npx tsx golden/w3/build.ts` 重建 preview.frag(坑 7)。\n" +
      "  md5 变了而且是**故意的**?那是一次重设基线:改本文件 GOLDEN 表,并在提交信息里写清楚换到了什么。\n" +
      "  背景与全部 18 个坑:docs/water-handover.md · docs/water-reference-metrics.md\n",
  ),
);
process.exit(1);
