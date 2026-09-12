#!/usr/bin/env node
/**
 * water-director-check.mjs —— W7 交互编排的**实测**台
 *
 *   node scripts/gen-water-preview.mjs /tmp/water-preview.html
 *   node scripts/water-director-check.mjs [--out /tmp/w7] [--curves-only] [--browser-only]
 *
 * 分两段,因为两段该在不同地方量:
 *
 * ── A. 响应曲线(纯 Node,固定 dt=1/60)─────────────────────────────────────
 * 弹簧/阻尼/包络是**时间的函数**,和渲染快慢无关。本容器没有 GPU,预览台在
 * SwiftShader 上只有 ~1 fps,拿 rAF 去采样曲线量到的是软件光栅的抖动,不是
 * 编排器的响应。所以曲线在 Node 里用固定步长驱动 —— 确定性,可复现,可比对。
 *
 * ── B. 真事件(headless Chromium)───────────────────────────────────────────
 * 阈值/节流的计数必须来自**真的划一次鼠标**(真 `pointermove`、真 `timeStamp`),
 * 这个 Node 造不出来。零 DOM 读取同理:要在真浏览器里把
 * `getBoundingClientRect` / `offset*` / `client*` 全包一层计数,并按
 * 「是否在 rAF 回调里」分桶 —— 承诺的是**每帧零次**,不是"总共零次"。
 * reduced-motion 的定格也在这里量:`gl.readPixels` 连拍两帧逐像素比。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (k) => argv.includes(k);
const OUT = arg("--out", "/tmp/w7");
const PAGE = arg("--page", "/tmp/water-preview.html");
mkdirSync(OUT, { recursive: true });

const report = {};
const row = (label, pairs) =>
  "  " + label.padEnd(18) + pairs.map(([a, b]) => `${a}:${b}`).join("  ");

/* ══ A. 响应曲线 ══════════════════════════════════════════════════════════ */
if (!has("--browser-only")) {
  const { WaterDirector, WATER_DIRECTOR_TUNING } = await import(
    pathToFileURL(path.join(ROOT, "src/components/lab/water/water-director.ts")).href
  );
  const DT = 1 / 60;
  const mk = (opts) =>
    new WaterDirector({ viewport: { left: 0, top: 0, width: 1920, height: 1080 }, ...opts });
  /** 跑 n 帧,每帧记一次 pick(d) */
  const run = (d, n, pick) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      d.update(DT);
      out.push([(i + 1) * DT * 1000, pick(d)]);
    }
    return out;
  };
  const at = (tr, ms) => {
    let best = tr[0];
    for (const p of tr) if (Math.abs(p[0] - ms) < Math.abs(best[0] - ms)) best = p;
    return best[1];
  };

  console.log("\n  ══ A. 响应曲线(纯 Node,固定 dt = 1/60 s)══════════════════════");

  // ④ 滚动 → camHeight(night 4.00 → mid 1.60,阻尼 0.12/帧@60)
  const dCam = mk({ from: "night", to: "mid" });
  dCam.setScroll(1);
  const camTr = run(dCam, 120, (d) => d.getFrameState().camHeight);
  console.log("\n  ── ④ 滚动 → camHeight ──");
  console.log(row("camHeight (m)", [50, 100, 200, 300, 500, 800, 1200, 2000].map(
    (ms) => [ms + "ms", at(camTr, ms).toFixed(3)])));
  const settle = camTr.find((p) => Math.abs(p[1] - 1.6) < 0.01);
  console.log("  到 1.60±0.01 用时 " + (settle ? settle[0].toFixed(0) : ">2000") + " ms" +
    "  (阻尼 " + WATER_DIRECTOR_TUNING.scrollDamping + "/帧@60 → τ = " +
    (-1 / (60 * Math.log(1 - WATER_DIRECTOR_TUNING.scrollDamping)) * 1000).toFixed(0) + " ms)");
  report.camTrace = camTr;

  // ② 悬停 → energy(ζ=0.8 ω=12)
  const dHov = mk({});
  dHov.setOrbHover(true);
  const eTr = run(dHov, 120, (d) => d.getFrameState().orb.energy);
  const peak = Math.max(...eTr.map((p) => p[1]));
  const peakAt = eTr.find((p) => p[1] === peak)[0];
  console.log("\n  ── ② 悬停灯球 → uOrbEnergy(ζ=0.8 ω=12 rad/s,1.00 → 1.45)──");
  console.log(row("energy", [50, 100, 150, 200, 300, 500, 800, 2000].map(
    (ms) => [ms + "ms", at(eTr, ms).toFixed(3)])));
  console.log("  峰值 " + peak.toFixed(4) + " @ " + peakAt.toFixed(0) + " ms" +
    " · 过冲 " + (((peak - 1.45) / 0.45) * 100).toFixed(1) + "%" +
    "(ζ=0.8 的理论过冲 e^(−πζ/√(1−ζ²)) = " +
    (Math.exp((-Math.PI * 0.8) / Math.sqrt(1 - 0.64)) * 100).toFixed(1) + "%)");
  dHov.setOrbHover(false);
  const eBack = run(dHov, 120, (d) => d.getFrameState().orb.energy);
  console.log(row("松开后", [50, 100, 200, 400, 800].map((ms) => [ms + "ms", at(eBack, ms).toFixed(3)])));
  report.energyTrace = eTr;

  // ⑤ 点击曝光包络(60 ms attack / τ=0.6 s)
  const dClk = mk({});
  dClk.setViewport({ left: 0, top: 0, width: 1920, height: 1080 });
  dClk.pointerDown(960, 900);
  const xTr = run(dClk, 180, (d) => d.exposureBoost());
  console.log("\n  ── ⑤ 点击 → 曝光包络(60 ms attack / τ=0.6 s)──");
  console.log(row("Δexposure", [17, 33, 50, 67, 100, 300, 600, 1800].map(
    (ms) => [ms + "ms", at(xTr, ms).toFixed(4)])));
  console.log("  峰值 " + Math.max(...xTr.map((p) => p[1])).toFixed(4) +
    " · 1.8 s 处残留 " + ((at(xTr, 1800) / WATER_DIRECTOR_TUNING.clickExposure) * 100).toFixed(1) + "%");
  report.expTrace = xTr;

  // ⑦ 退场 800 ms ease-out
  const dExit = mk({});
  dExit.beginOrbExit();
  const qTr = run(dExit, 90, (d) => d.getFrameState().orb.energy);
  console.log("\n  ── ⑦ 退场 → energy → 0(800 ms ease-out)──");
  console.log(row("energy", [100, 200, 400, 600, 800, 900].map(
    (ms) => [ms + "ms", at(qTr, ms).toFixed(3)])));
  console.log("  800 ms 后 energy = " + at(qTr, 810).toFixed(6) +
    (at(qTr, 810) === 0 ? "  ✓ 精确 0(水面光归零 = 与灯球未接入逐字节相同)" : "  ✗"));
  report.exitTrace = qTr;

  // ③ 球位 20 ms 一阶跟随:给一个匀速扫掠,量稳态滞后
  const sweep = (ts) => ({
    screen: [Math.sin(ts * 1.6) * 0.8, 0.42],
    radiusNdc: 0.1, energy: 1, spinPhase: 0, lightmapFrame: 0, worldRadius: 0.22,
  });
  const dFollow = mk({ orbSource: sweep });
  const dSnap = mk({ orbSource: sweep, flags: { orbFollow: false } });
  let lagMax = 0;
  let snapMax = 0;
  for (let i = 0; i < 240; i++) {
    dFollow.update(DT);
    dSnap.update(DT);
    const want = sweep(dFollow.time).screen[0];
    lagMax = Math.max(lagMax, Math.abs(want - dFollow.getFrameState().orb.screen[0]));
    snapMax = Math.max(snapMax, Math.abs(sweep(dSnap.time).screen[0] - dSnap.getFrameState().orb.screen[0]));
  }
  console.log("\n  ── ③ 球位 → 光斑路径(20 ms 一阶跟随)──");
  console.log("  开:最大滞后 Δx = " + lagMax.toFixed(4) + " NDC  ≈ " + (lagMax * 960).toFixed(1) +
    " px@1920 · 关:" + snapMax.toFixed(6) + " NDC(同帧硬跟)");
  report.follow = { lagMax, snapMax };

  // ⑥ 静置 → 风速
  const dWind = mk({});
  const wTr = [];
  for (let i = 0; i < 60 * 40; i++) {
    dWind.update(DT);
    if (i % (60 * 5) === 0) wTr.push([(i * DT).toFixed(0) + "s", dWind.getFrameState().wind.speed.toFixed(3)]);
  }
  console.log("\n  ── ⑥ 静置 >4 s → wind.speed(30 s 缓降到 ×0.6)──");
  console.log(row("wind.speed", wTr));
  dWind.pointerMove(100, 100, 1e6); // 一次交互
  const rec = [];
  for (let i = 0; i < 60 * 8; i++) {
    dWind.update(DT);
    if (i % 60 === 0) rec.push([(i / 60).toFixed(0) + "s", dWind.getFrameState().wind.speed.toFixed(3)]);
  }
  console.log(row("动一下之后", rec));
  report.wind = { decay: wTr, recover: rec };

  // ① 冲击尺度随滚动的对数插值
  const dScale = mk({ from: "night", to: "mid" });
  const rows = [];
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    dScale.scroll = u;
    dScale.scrollTarget = u;
    const s = dScale.impulseScale();
    rows.push([u.toFixed(2), s.clickRadius.toFixed(3) + "m/" + (s.clickStrength * 1000).toFixed(1) + "mm"]);
  }
  console.log("\n  ── ① 冲击尺度(click 档)随滚动的**对数**插值 ──");
  console.log(row("night→mid", rows));
  console.log("  hover 档 = click 的 半径×0.4 / 强度×0.2:" +
    "mid 0.060 m / 1.20 mm@v=1;night 1.000 m / 12.00 mm@v=1");
  report.scale = rows;

  // reduced-motion:两次 update 之后帧状态必须逐字段相同
  const dRm = mk({ orbSource: sweep });
  dRm.setReducedMotion(true);
  dRm.update(1 / 60);
  const a = JSON.stringify(dRm.getFrameState());
  dRm.update(1 / 60);
  const b = JSON.stringify(dRm.getFrameState());
  dRm.pointerMove(100, 100, 1000);
  dRm.pointerMove(400, 400, 1016);
  dRm.pointerMove(700, 700, 1032);
  const rmImp = dRm.drainImpulses().length;
  console.log("\n  ── reduced-motion(帧状态层面)──");
  console.log("  连续两帧 WaterFrameState " + (a === b ? "完全相同 ✓" : "不同 ✗"));
  console.log("  time = " + dRm.getFrameState().time.toFixed(2) + "(contract 规定 8.00)" +
    " · 划 3 下注入 " + rmImp + " 个冲击 " + (rmImp === 0 ? "✓" : "✗") +
    " · 闸门挡掉 " + dRm.stats().suppressedByGate);
  report.rmFrameState = { identical: a === b, injected: rmImp };
}

/* ══ B. 真事件(headless Chromium)═════════════════════════════════════════ */
if (!has("--curves-only")) {
  const { chromium } = await import("playwright");

  /* 布局读取探针。必须在页面脚本之前装上(addInitScript)。 */
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

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-lcd-text"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 980 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => {
    // 被 route 拦掉的 Google Fonts 会报一条 ERR_FAILED —— 是我们自己拦的,不算错
    if (m.type() === "error" && !m.text().includes("ERR_FAILED")) errors.push("console: " + m.text());
  });
  /* 预览台的 <link> 指向 Google Fonts,容器出口白名单挡掉它 —— 不拦的话
   * `goto` 会一直等 CONNECT 超时。字体只影响 chrome 的字形,不影响画布。 */
  await page.route("**://**", (r) => {
    const u = r.request().url();
    return u.startsWith("file://") || u.startsWith("data:") ? r.continue() : r.abort();
  });
  await page.addInitScript(PROBE);
  await page.goto("file://" + path.resolve(PAGE), { waitUntil: "commit" });
  await page.waitForFunction("window.__wd && window.__wd.director && window.__layout.frames > 2",
    { timeout: 120000 });

  console.log("\n  ══ B. 真事件(headless Chromium + SwiftShader)══════════════════");
  console.log("  " + (await page.textContent("#hud")).replace(/\s+/g, " ").trim());

  /* 画布的位置每次都重新问一次:点页面下方的按钮会让浏览器把它滚进视口,
   * 上一次量到的 box 就作废了(第一版栽在这:后面几段"收到 0 个 pointermove")。
   * 按钮一律用 `el.click()` 触发,不走 Playwright 的 auto-scroll。 */
  const bb = () => page.locator("#cv").boundingBox();
  const tap = (sel) => page.evaluate((s2) => document.querySelector(s2).click(), sel);
  let box = await bb();
  /* 划动期间把**后备缓冲**降到 384×216。本容器没有 GPU:1920×1080 的软件光栅
   * 一帧要 ~1 s,主线程被占死之后 Playwright 的每一发 `mouse.move` 都要等一帧
   * 才被派发 —— 量到的就成了软件光栅的速度,不是编排器的阈值与节流。
   * CSS 尺寸不变,所以 offsetX/offsetY 与 ResizeObserver 的 contentRect 不变,
   * 阈值/节流的判定与分辨率无关。量完再切回 1920×1080 做定格与截图。 */
  await page.evaluate(() => window.__wd.setSize(384, 216));
  await page.waitForTimeout(2500);
  box = await bb();
  await page.evaluate(() => window.__wd.director.resetCounters());

  /* ── ① 真的划一次 ─────────────────────────────────────────────────── */
  const y0 = box.y + box.height * 0.74; // 下部 —— 三个 preset 那里都是水面
  const x0 = box.x + box.width * 0.1;
  const x1 = box.x + box.width * 0.9;
  const STEPS = Number(arg("--drag-steps", "140"));
  await page.mouse.move(x0, y0);
  const t0 = Date.now();
  /* 甲段:一发一发地划(每发一次协议往返)。三个来回 + 纵向抖动,
   * 拐点处速度趋近 0 —— **阈值**要挡的就是那一段。 */
  for (let i = 1; i <= STEPS; i++) {
    const u = i / STEPS;
    const x = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(u * Math.PI * 3));
    const y = y0 + Math.sin(u * Math.PI * 7) * box.height * 0.05;
    await page.mouse.move(x, y);
  }
  const slow = await page.evaluate(() => window.__wd.director.stats());
  const slowMs = Date.now() - t0;
  /* 乙段:一次甩过去。`{steps}` 让浏览器**连发**一串 pointermove(毫秒级间隔),
   * 这才是真机上 120 Hz 指针的样子 —— **节流**要挡的就是这一段。
   * 甲段在这个容器里量不到节流:没有 GPU,主线程 ~1 fps,Playwright 的每一发
   * mouse.move 要等 ~127 ms 才被派发,本来就超过 40 ms 了。 */
  const t1 = Date.now();
  await page.mouse.move(x1, y0 - box.height * 0.05, { steps: 80 });
  await page.mouse.move(x0, y0 + box.height * 0.05, { steps: 80 });
  const flickMs = Date.now() - t1;
  const dragMs = Date.now() - t0;
  const drag = await page.evaluate(() => {
    const d = window.__wd.director;
    return { c: d.stats(), scale: d.impulseScale(), from: d.from, to: d.to, vp: d.viewport };
  });
  const c = drag.c;
  const sum = c.injected + c.suppressedByThreshold + c.suppressedByThrottle +
    c.suppressedOffSurface + c.suppressedByGate;
  const fl = {
    pointerEvents: c.pointerEvents - slow.pointerEvents,
    injected: c.injected - slow.injected,
    th: c.suppressedByThreshold - slow.suppressedByThreshold,
    tr: c.suppressedByThrottle - slow.suppressedByThrottle,
  };
  console.log("\n  ── ① 阈值与节流(真划 " + dragMs + " ms:慢划 " + slowMs +
    " ms + 两次快甩 " + flickMs + " ms)──");
  console.log("  收到 pointermove  " + c.pointerEvents);
  console.log("  注入              " + c.injected);
  console.log("  阈值挡掉          " + c.suppressedByThreshold + "  (< 0.15 px/ms)");
  console.log("  节流挡掉          " + c.suppressedByThrottle + "  (距上次注入 < 40 ms)");
  console.log("  不在水面          " + c.suppressedOffSurface);
  console.log("  闸门挡掉          " + c.suppressedByGate);
  console.log("  不变式            " + c.pointerEvents + " = " + sum +
    (sum === c.pointerEvents ? "  ✓" : "  ✗"));
  console.log("  注入率            " + ((c.injected / Math.max(1, c.pointerEvents)) * 100).toFixed(1) +
    "%  · 40 ms 节流在 " + dragMs + " ms 里的理论上限 " + Math.floor(dragMs / 40) + " 发");
  console.log("  当前冲击尺度      hover " + drag.scale.hoverRadius.toFixed(3) + " m / " +
    (drag.scale.hoverStrength * 1000).toFixed(2) + " mm@v=1  ·  click " +
    drag.scale.clickRadius.toFixed(3) + " m / " + (drag.scale.clickStrength * 1000).toFixed(1) +
    " mm   [" + drag.from + " → " + drag.to + "]");
  console.log("  缓存的 viewport   " + JSON.stringify(drag.vp));
  console.log("  ── 拆开看两段 ──");
  console.log("  慢划 " + slowMs + " ms  收到 " + slow.pointerEvents + " · 注入 " + slow.injected +
    " · 阈值 " + slow.suppressedByThreshold + " · 节流 " + slow.suppressedByThrottle +
    "   ← 每发间隔 " + (slowMs / Math.max(1, slow.pointerEvents)).toFixed(0) + " ms,本来就 >40 ms");
  console.log("  快甩 " + flickMs + " ms  收到 " + fl.pointerEvents + " · 注入 " + fl.injected +
    " · 阈值 " + fl.th + " · 节流 " + fl.tr +
    "   ← 每发间隔 " + (flickMs / Math.max(1, fl.pointerEvents)).toFixed(1) + " ms,节流开始咬");
  report.drag = { ...drag, dragMs, slow, slowMs, flick: fl, flickMs };
  await page.screenshot({ path: path.join(OUT, "02-page-counters.png") });
  await page.evaluate(() => window.__wd.setSize(1920, 1080));
  await page.waitForTimeout(3000);
  await page.locator("#cv").screenshot({ path: path.join(OUT, "01-after-drag.png") });

  /* ── ② 布局读取 ───────────────────────────────────────────────────── */
  const L = await page.evaluate(() => window.__layout);
  console.log("\n  ── ② 强制回流(布局读取)──");
  console.log("  已渲染帧数        " + L.frames);
  console.log("  rAF 回调**内**    " +
    (Object.keys(L.frame).length ? JSON.stringify(L.frame) + "  ✗" : "0 次  ✓"));
  console.log("  rAF 回调外        " +
    (Object.keys(L.outside).length ? JSON.stringify(L.outside) : "0 次") +
    "   ← 事件/初始化里的,不进每帧预算");
  report.layout = L;

  /* ── ③ reduced-motion 定格 ────────────────────────────────────────── */
  await tap("#rm");
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__wd.reset(); window.__wd.want = 3; });
  await page.waitForFunction("window.__wd.grabs.length >= 3", { timeout: 120000 });
  const g = await page.evaluate(() => window.__wd.grabs);
  console.log("\n  ── ③ reduced-motion 定格(1920×1080,gl.readPixels 逐像素)──");
  console.log("  三帧 hash         " + g.map((x) => x.hash.toString(16)).join(" / "));
  console.log("  三帧 t            " + g.map((x) => x.t.toFixed(3)).join(" / "));
  console.log("  逐像素差          帧1→2: " + g[1].diff + " · 帧2→3: " + g[2].diff +
    (g[1].diff === 0 && g[2].diff === 0 ? "   ✓ 定格" : "   ✗ 还在动"));
  await page.evaluate(() => { window.__wd.setSize(384, 216); window.__wd.director.resetCounters(); });
  await page.waitForTimeout(1500);
  box = await bb();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.74);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.6, { steps: 40 });
  const rmC = await page.evaluate(() => window.__wd.director.stats());
  console.log("  定格中再划 40 下  收到 " + rmC.pointerEvents + " · 注入 " + rmC.injected +
    " · 闸门挡掉 " + rmC.suppressedByGate + (rmC.injected === 0 ? "   ✓" : "   ✗"));
  report.reducedMotion = { grabs: g, counters: rmC };
  await page.evaluate(() => window.__wd.setSize(1920, 1080));
  await page.waitForTimeout(2500);
  await page.locator("#cv").screenshot({ path: path.join(OUT, "03-reduced-motion.png") });

  await tap("#rm");
  await tap("#pl");

  /* ── ④ 关掉一条:pointerRipple ────────────────────────────────────── */
  await page.evaluate(() => {
    window.__wd.setSize(384, 216);
    window.__wd.director.setFlag("pointerRipple", false);
    window.__wd.director.resetCounters();
  });
  await page.waitForTimeout(1500);
  box = await bb();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.74);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.6, { steps: 40 });
  const offC = await page.evaluate(() => window.__wd.director.stats());
  console.log("\n  ── ④ 关掉「① 指针划水」之后再划 40 下 ──");
  console.log("  收到 " + offC.pointerEvents + " · 注入 " + offC.injected +
    " · 闸门挡掉 " + offC.suppressedByGate + (offC.injected === 0 ? "   ✓ 一发都没有" : "   ✗"));
  await page.evaluate(() => {
    window.__wd.director.setFlag("pointerRipple", true);
    window.__wd.setSize(1920, 1080);
  });
  report.flagOff = offC;

  /* ── ⑤ 点击 + 悬停 + 退场的画面 ───────────────────────────────────── */
  box = await bb();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.82);
  await page.waitForTimeout(2500);
  await page.locator("#cv").screenshot({ path: path.join(OUT, "04-after-click.png") });

  const orbPt = await page.evaluate(() => {
    const f = window.__wd.director.getFrameState();
    return { x: (f.orb.screen[0] + 1) / 2, y: (1 - f.orb.screen[1]) / 2 };
  });
  box = await bb();
  await page.mouse.move(box.x + box.width * orbPt.x, box.y + box.height * orbPt.y);
  /* 弹簧要 ~500 ms 才到峰值,而这里一帧 ~1 s(dt 被夹在 0.1 s)——
   * 先降分辨率让它跑够帧,再切回来截图。 */
  await page.evaluate(() => window.__wd.setSize(384, 216));
  await page.waitForTimeout(3000);
  const hov = await page.evaluate(() => ({
    over: window.__wd.director.orbHover,
    e: window.__wd.director.getFrameState().orb.energy,
  }));
  console.log("\n  ── ⑤ 悬停灯球(页面上)──");
  console.log("  命中球体 " + hov.over + " · energy " + hov.e.toFixed(3));
  await page.evaluate(() => window.__wd.setSize(1920, 1080));
  await page.waitForTimeout(2500);
  await page.locator("#cv").screenshot({ path: path.join(OUT, "05-orb-hover.png") });
  report.hover = hov;

  await tap("#exit");
  await page.evaluate(() => window.__wd.setSize(384, 216));
  await page.waitForTimeout(3000);
  const gone = await page.evaluate(() => window.__wd.director.getFrameState().orb.energy);
  console.log("  退场后 energy " + gone.toFixed(6));
  await page.evaluate(() => window.__wd.setSize(1920, 1080));
  await page.waitForTimeout(2500);
  await page.locator("#cv").screenshot({ path: path.join(OUT, "06-orb-gone.png") });

  /* ── ⑥ 滚动到 mid ─────────────────────────────────────────────────── */
  await page.evaluate(() => {
    window.__wd.director.cancelOrbExit();
    const el = document.querySelector("#presets .pz:nth-child(3)"); // night
    el.click();
  });
  await page.waitForTimeout(2500);
  await page.locator("#cv").screenshot({ path: path.join(OUT, "07-night-scroll0.png") });
  await page.evaluate(() => {
    const inp = document.querySelector("#s_dirScroll");
    inp.value = "1";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(4000);
  const camNow = await page.evaluate(() => window.__wd.director.getFrameState().camHeight);
  console.log("\n  ── ⑥ 夜景 preset + 滚动滑块拖到 1 ──");
  console.log("  camHeight = " + camNow.toFixed(3) + " m(夜景着色 + 中景相机)");
  await page.locator("#cv").screenshot({ path: path.join(OUT, "08-night-scroll1.png") });

  const L2 = await page.evaluate(() => window.__layout);
  console.log("\n  ── 布局读取总结(全程 " + L2.frames + " 帧)──");
  console.log("  rAF 回调内 " + (Object.keys(L2.frame).length ? JSON.stringify(L2.frame) + "  ✗" : "0 次  ✓"));
  console.log("  rAF 回调外 " + (Object.keys(L2.outside).length ? JSON.stringify(L2.outside) : "0 次"));
  report.layoutFinal = L2;
  report.errors = errors;

  console.log(errors.length ? "\n  ✗ 页面报错:\n" + errors.map((e) => "    " + e).join("\n")
    : "\n  页面无 error。");
  await browser.close();
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
console.log("\n  截图与原始数据 → " + OUT + "\n");
