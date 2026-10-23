#!/usr/bin/env node
/**
 * water-scene-check.mjs —— W8 组件的**实测**台(headless Chromium + SwiftShader)
 *
 *   npm run dev &                                  # 站点要跑起来
 *   node scripts/water-scene-check.mjs [--url http://localhost:3000/lab/water]
 *                                     [--out golden/w8] [--shots-only]
 *
 * 量四件事,全部通过**真页面**,不走任何私有钩子 —— 面板上显示的数就是证据:
 *
 *  ① **三个 preset 各一张截图** → `golden/w8/`。
 *  ② **滚动联动**:滚动进度 0 / 0.5 / 1 三档的 `activeSpots`(面板的
 *     `data-testid="water-spots"` 格子)。W7 挖出来的那个真问题是「滚到 mid
 *     灯从 22 斑变成 0 斑」,所以这三个数必须都 >0。
 *  ③ **每帧零 DOM 读取**:在页面脚本之前包一层计数器(`addInitScript`),
 *     把 `getBoundingClientRect` / `getComputedStyle` / `offset*` / `client*` /
 *     `scroll*` / `innerWidth` 全部拦下来,**按是否在 rAF 回调里分桶**。
 *     承诺的是"每帧零次",不是"总共零次" —— 初始化时读一次主题色是允许的。
 *  ④ **reduced-motion**:打开页面的模拟开关,量 rAF 回调数是否停止增长,
 *     并连拍两张画布截图比 md5。`element.screenshot()` 抓的是合成后的前缓冲,
 *     两张逐字节相同 = 画面真的定格了(比 readPixels 更端到端)。
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = arg("--url", "http://localhost:3000/lab/water");
const OUT = path.resolve(ROOT, arg("--out", "golden/w8"));
mkdirSync(OUT, { recursive: true });

/* 布局读取探针。**必须在页面脚本之前装上**,否则 React 已经拿到原始的
 * 描述符了。分桶靠包一层 requestAnimationFrame:回调执行期间 inFrame=true。 */
const PROBE = `
(() => {
  const rec = { frame: {}, outside: {}, inFrame: false, frames: 0 };
  window.__layout = rec;
  const bump = (n) => { const b = rec.inFrame ? rec.frame : rec.outside; b[n] = (b[n] || 0) + 1; };
  const wrapFn = (o, n) => { const f = o[n];
    if (typeof f === "function") o[n] = function (...a) { bump(n); return f.apply(this, a); }; };
  const wrapGet = (o, n) => { const d = Object.getOwnPropertyDescriptor(o, n);
    if (!d || typeof d.get !== "function") return;
    Object.defineProperty(o, n, { configurable: true, enumerable: d.enumerable,
      get() { bump(n); return d.get.call(this); }, set: d.set }); };
  wrapFn(Element.prototype, "getBoundingClientRect");
  wrapFn(Element.prototype, "getClientRects");
  wrapFn(window, "getComputedStyle");
  for (const p of ["offsetWidth","offsetHeight","offsetTop","offsetLeft","offsetParent"])
    wrapGet(HTMLElement.prototype, p);
  for (const p of ["clientWidth","clientHeight","clientTop","clientLeft","scrollTop","scrollLeft","scrollWidth","scrollHeight"])
    wrapGet(Element.prototype, p);
  for (const p of ["innerWidth","innerHeight","scrollX","scrollY","pageXOffset","pageYOffset"])
    wrapGet(window, p);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((tt) => {
    rec.inFrame = true; rec.frames++;
    try { return cb(tt); } finally { rec.inFrame = false; }
  });
})();
`;

const { chromium } = await import("playwright");
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-lcd-text",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("ERR_FAILED")) errors.push("console: " + m.text());
});
/* 容器出口白名单挡掉 Google Fonts —— 不拦的话 goto 会一直等 CONNECT 超时。
 * 字体只影响面板的字形,不影响画布。 */
await page.route("**://**", (r) => {
  const u = r.request().url();
  return u.startsWith("http://localhost") || u.startsWith("data:") ? r.continue() : r.abort();
});
await page.addInitScript(PROBE);
await page.goto(URL_, { waitUntil: "domcontentloaded" });
/* Next 的开发指示器(左下角那个圆形 N)会盖住面板一角 —— 截图里不要它。 */
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

const hud = page.locator('[data-testid="water-hud"]');
const spots = page.locator('[data-testid="water-spots"]');
const canvas = page.locator("canvas");
const scroll = page.locator('[data-testid="water-scroll"]');

/* SwiftShader 上 1440×900 软件光栅一帧要几百毫秒,等帧数而不是等固定时长。 */
const waitFrames = async (n) => {
  const at = await page.evaluate(() => window.__layout.frames);
  await page.waitForFunction((k) => window.__layout.frames > k, at + n, { timeout: 300000 });
};
const md5 = (buf) => createHash("md5").update(buf).digest("hex");

await waitFrames(6);
console.log("\n  ══ W8 组件实测 ═══════════════════════════════════════════════");
console.log("  " + (await hud.textContent()).replace(/\s+/g, " ").trim());

const report = { shots: {}, scrollSpots: {}, layout: null, reducedMotion: null, errors };

/* ── ① 三个 preset 各一张 ─────────────────────────────────────────────── */
/* 换 preset 时相机走 0.12/帧 的滚动阻尼(night↔mid 的区间端点没变,所以是
 * 滑过去不是跳过去)。**必须等它追到位再截**,否则截到的是半路上的相机高度
 * —— 第一版就截出了 3.90 m 的夜景,和 preset 的 4.00 m 差着 10 cm。 */
const CAM_SETTLED = { near: "0.35 m", mid: "1.60 m", night: "4.00 m" };
for (const p of ["near", "mid", "night"]) {
  await page.click(`[data-preset="${p}"]`);
  await page.waitForFunction(
    (want) => (document.querySelector('[data-testid="water-hud"]')?.textContent ?? "").includes(want),
    CAM_SETTLED[p],
    { timeout: 300000 },
  );
  await waitFrames(4);
  const file = path.join(OUT, `scene-${p}.png`);
  const buf = await page.screenshot({ path: file });
  const hudText = (await hud.textContent()).replace(/\s+/g, " ").trim();
  report.shots[p] = { file, md5: md5(buf), hud: hudText };
  console.log(`  ${p.padEnd(6)} → ${path.relative(ROOT, file)}  md5 ${md5(buf).slice(0, 12)}  ${hudText}`);
}

/* ── ② 滚动联动:0 / 0.5 / 1 三档的 activeSpots ───────────────────────── */
if (!argv.includes("--shots-only")) {
  console.log("\n  ── ② 滚动 → 球位(行⑧)。三档的 activeSpots 都必须 >0 ──────────");
  /* night 这一档区间是 night(0) → mid(1) —— 正是 W7 挖出来那条路。 */
  await page.click('[data-preset="night"]');
  await waitFrames(6);
  for (const v of [0, 0.5, 1]) {
    await scroll.fill(String(v));
    await scroll.dispatchEvent("input");
    /* 滚动有 0.12/帧 的阻尼,要等它追到目标(camHeight 稳下来)再读。 */
    await waitFrames(60);
    const n = Number((await spots.textContent()).trim());
    const h = (await hud.textContent()).replace(/\s+/g, " ").trim();
    report.scrollSpots[v] = { activeSpots: n, hud: h };
    console.log(`  scroll ${v.toFixed(2)} → activeSpots ${String(n).padStart(3)}   ${h}`);
  }

  /* 对照组:把行⑧关掉 = 退回 W7 的行为(球位只听时间线,不跟滚动)。
   * 这一组数就是任务书 §2.4 描述的那个真问题 —— 滚到 mid 灯直接熄。 */
  console.log("\n  ── ②b 对照:关掉行⑧(= W7 的行为)──────────────────────────────");
  const flag8 = page.getByRole("button", { name: /8 · Scroll to orb pose/i });
  await flag8.click();
  report.scrollSpotsFlagOff = {};
  for (const v of [0, 0.5, 1]) {
    await scroll.fill(String(v));
    await scroll.dispatchEvent("input");
    await waitFrames(60);
    const n = Number((await spots.textContent()).trim());
    const h = (await hud.textContent()).replace(/\s+/g, " ").trim();
    report.scrollSpotsFlagOff[v] = { activeSpots: n, hud: h };
    console.log(`  scroll ${v.toFixed(2)} → activeSpots ${String(n).padStart(3)}   ${h}`);
  }
  await flag8.click(); // 恢复
  await scroll.fill("0");
  await scroll.dispatchEvent("input");
  await waitFrames(40);

  /* ── ③ 每帧零 DOM 读取 ──────────────────────────────────────────────── */
  console.log("\n  ── ③ 每帧零 DOM 读取(rAF 回调里的布局读取次数)────────────────");
  await page.mouse.move(700, 500);
  await page.mouse.move(900, 620);
  await page.mouse.move(1100, 700);
  await waitFrames(20);
  const L = await page.evaluate(() => window.__layout);
  report.layout = L;
  const inFrame = Object.entries(L.frame);
  console.log(`  rAF 回调 ${L.frames} 次 · 回调内布局读取 ${inFrame.length === 0 ? 0 : ""}` +
    (inFrame.length ? inFrame.map(([k, v]) => `${k}:${v}`).join(" ") : " ✓"));
  console.log(
    "  回调外(初始化 / 主题 / React 提交,允许):" +
      (Object.entries(L.outside).map(([k, v]) => `${k}:${v}`).join(" ") || "无"),
  );

  /* ── ④ reduced-motion:不再进 rAF + 连拍两帧逐字节相同 ────────────────── */
  console.log("\n  ── ④ reduced-motion(定格单帧,不再进 rAF)────────────────────");
  await page.getByRole("button", { name: /reduced motion|reduced-motion/i }).click();
  await waitFrames(3); // 让它把最后一帧渲完
  await page.waitForTimeout(1500);
  const f0 = await page.evaluate(() => window.__layout.frames);
  const a = await canvas.screenshot();
  await page.waitForTimeout(2500);
  const f1 = await page.evaluate(() => window.__layout.frames);
  const b = await canvas.screenshot();
  report.reducedMotion = {
    rafBefore: f0,
    rafAfter: f1,
    rafDelta: f1 - f0,
    md5A: md5(a),
    md5B: md5(b),
    identical: md5(a) === md5(b),
  };
  console.log(`  2.5 s 内 rAF 回调增量 ${f1 - f0}(0 = 真的不再进 rAF)`);
  console.log(`  连拍两张画布 md5 ${md5(a).slice(0, 16)} / ${md5(b).slice(0, 16)} → ` +
    (md5(a) === md5(b) ? "逐字节相同 ✓" : "不同 ✗"));
}

if (errors.length) console.log("\n  ⚠ 页面报错:\n   " + errors.slice(0, 5).join("\n   "));
writeFileSync(path.join(OUT, "scene-check.json"), JSON.stringify(report, null, 2));
console.log(`\n  → ${path.relative(ROOT, path.join(OUT, "scene-check.json"))}\n`);
await browser.close();
