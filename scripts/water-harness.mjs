#!/usr/bin/env node
/**
 * water-harness.mjs —— 黄金帧渲染与相对成本测量台 (W0/W1 基建)
 *
 * 把一段片元着色器在**确定性条件**下渲成 PNG,供 water-metrics.mjs 打分。
 * 所有水面任务卡的验收截图都必须经这里产出,不能靠手动截屏——否则时间、
 * 分辨率、dpr 不一致,分数不可比。
 *
 *   node scripts/water-harness.mjs --shader <a.frag|a.glsl.ts> --out golden/x.png \
 *        [--time 2.5] [--w 1920] [--h 1080] [--set uName=1,2,3 ...] [--cost]
 *
 * 确定性约定(对应计划 §5 黄金帧协议):
 *   · uTime 由 --time 显式给定,**绝不使用 performance.now()**
 *   · 画布固定 1920×1080,devicePixelRatio 恒为 1
 *   · preserveDrawingBuffer: true,读回同一帧
 *
 * ── 关于 --cost 的诚实说明 ────────────────────────────────────────────────
 * 本容器没有 GPU,headless Chromium 走 SwiftShader 软件光栅。所以 --cost 报的
 * 是**软件光栅下的每帧墙钟时间**,只能用于三条路线之间的**相对**比较(软件
 * 光栅耗时随每像素 ALU 量增长,恰好是区分 A/B/C 的那个量),不能当作 GPU
 * 预算的绝对值。真实 GPU 帧时间必须在有显卡的机器上用
 * EXT_disjoint_timer_query_webgl2 量(见 W9)。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

/** 仓库根 —— 从本文件位置推,不靠 cwd(`npm run water:frame` 与 run.mjs 的 cwd 不一定同) */
const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (k) => argv.includes(k);

const shaderPath = arg("--shader");
const outPath = arg("--out", "golden/frame.png");
const time = parseFloat(arg("--time", "2.5"));
const W = parseInt(arg("--w", "1920"), 10);
const H = parseInt(arg("--h", "1080"), 10);
const wantCost = has("--cost");

if (!shaderPath) {
  console.log(
    "\n  用法: node scripts/water-harness.mjs --shader <file> --out <png> [--time 2.5] [--set uX=1] [--cost]\n"
  );
  process.exit(1);
}

/** 从 .glsl.ts 里抠出模板串;.frag/.glsl 直接读。 */
function loadShader(p) {
  const raw = readFileSync(p, "utf8");
  if (!p.endsWith(".ts")) return raw;
  const m = raw.match(/export\s+const\s+\w+\s*(?::\s*string\s*)?=\s*`([\s\S]*?)`\s*;/);
  if (!m) throw new Error(`${p}: 找不到 export const X = \`...\` 形式的着色器源`);
  return m[1];
}

/** 解析 uniform 声明,给出默认值。未在此表中的类型需用 --set 显式给。 */
function defaultsFor(src) {
  const out = {};
  /* W5 起要认**数组** uniform(`uniform vec4 uOrbSpots[24];`)——灯球的 K 个光斑
   * 中心是 CPU 每帧算好的(orb-light.ts),以数组一次传进去,shader 里只做 K 次
   * 核求和。不认数组的话它会被当成"着色器里没有这个 uniform"直接忽略,
   * 画面上一个光斑都不会有,而且**不报错** —— 正是 docs §11 坑 7 那种沉默失效。 */
  const re = /uniform\s+(float|int|vec2|vec3|vec4|sampler2D)\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?\s*;/g;
  let m;
  while ((m = re.exec(src))) {
    const [, type, name, arrLen] = m;
    if (type === "sampler2D") continue;
    if (arrLen) {
      const n = { float: 1, int: 1, vec2: 2, vec3: 3, vec4: 4 }[type];
      out[name] = { type, array: parseInt(arrLen, 10), value: new Array(n * parseInt(arrLen, 10)).fill(0) };
      continue;
    }
    const preset = {
      uRes: [W, H],
      uResolution: [W, H],
      uTime: [time],
      uPixel: [3],
      uMouse: [0.5, 0.5],
      uMouseOn: [0],
      uSpeed: [1],
      uBright: [1],
      uContrast: [1.2],
      uGlint: [1],
      uWarp: [1],
      uFetchLen: [4.0],
      uLodBias: [1.0],
      uFlowBend: [1],
      uAngle: [0],
      uCalmTop: [0],
      /* uInk/uPaper 与下面的 uDitherInk/uDitherPaper 是同一对颜色的两套名字:
       * 这里(旧名)只服务 W0/W1/W2 的 spike-a、golden/w2/preview.frag 与
       * baseline/current-water-dither.frag,**不要删**,删了旧黄金帧就复现不出来。
       * 数值是 CSS token `--water-ink` / `--water-paper` 的 sRGB 归一值,
       * 唯一定义处是 src/styles/globals.css 的 :root(AGENTS.md 扩展性红线)。
       * 这是脚本不是组件,所以允许出现字面量;组件必须从 token 读。 */
      uInk: [0.196, 0.2, 0.102], // #32331A
      uPaper: [0.902, 0.996, 0.992], // #E6FEFD
      // —— spike / 水面模块默认值(mid preset)——
      uCamHeight: [1.6],
      uCamPitch: [0.3],
      uFovY: [0.35],
      uWindDir: [1.5708],
      uWindSpeed: [1.0],
      uSpread: [0.35],
      uAmp: [1.0],
      uBody: [0.18],
      uEnvShore: [0.10],
      uEnvSky: [0.86],
      uEnvGlow: [0.0],
      uEnvEdge: [0.08],
      uLightOmega: [6.8e-5],
      uSpecGain: [0.0],
      uLightElev: [0.22],
      uLightAz: [1.5708],
      uExposure: [0.0],
      uDitherAniso: [0.7],
      uQuantize: [1],
      uFieldTex: [0],
      /* —— W2 field.glsl.ts(uField 前缀,契约 §3)——
       * 默认值即 **mid preset**,所以 `--shader golden/w2/preview.frag` 不带任何
       * --set 就是 W2 的验收帧。注意名字与 spike-a 的 uCamHeight/uSpread/... 不同:
       * 模块化之后每个模块独占自己的前缀,拼装时 grep 不撞车。 */
      uFieldCamHeight: [1.6],
      uFieldCamPitch: [0.37],
      uFieldFovY: [0.61],
      uFieldWindDir: [1.5708], // π/2。0 会让波脊沿 z 排列 → 屏幕上是竖线,不是横纹
      uFieldWindSpeed: [1.0],
      uFieldSpread: [0.25],   // W2 消融:0.5→0.25 买到 +0.029 相干度余量,再花在摆动上
      uFieldAmp: [1.5],
      uFieldSpectralSlope: [0.9], // 默认 = W1/W2 的硬编码值,不改分
      uFieldWarp: [1.0],
      uFieldFetchLen: [7.0],
      uFieldLodBias: [5.0],
      // ① 风阵斑块
      uFieldPatchScale: [0.65],   // W2 实测:0.35 在这个构图下只有 2 个斑块横跨全屏
      uFieldPatchMin: [0.15],
      uFieldPatchMax: [2.0],      // 必须 >1,见 field.glsl.ts 里的阈值说明
      uFieldPatchEdge: [0.06],
      uFieldPatchBias: [0.40],
      uFieldPatchDrift: [0.03],
      uFieldOrbPatchGain: [0.0], // W5 接上 orbPatch 之前保持 0
      // ② 长尾划线
      uFieldTail: [1.0],
      // ③ 局部方向摆动
      uFieldWander: [0.30],   // 0.45 分更高(0.840)但会拉出贯穿全幅的直划,取中
      uFieldWanderScale: [0.25],
      /* ④ 波脊断裂。默认 **0 = 关闭**,与 W2/W3 的旧黄金帧逐字等价;
       * 三个 preset 在 golden/w3/run.mjs 里各自开到自己的值(见 docs §13)。 */
      uFieldChop: [0.0],
      uFieldChopLen: [0.55],
      uFieldChopAniso: [0.5],   // <1 才是短波脊;>1 会连成竖帘
      uFieldChopMin: [0.10],
      uFieldChopMax: [1.7],     // 必须 >1,否则等于偷偷把 uFieldAmp 调小
      uFieldChopEdge: [0.14],
      uFieldChopBias: [0.55],

      /* —— W3 shade.glsl.ts + env-column.ts(uShade 前缀,契约 §3)——
       * 同样以 **mid preset** 为默认值。环境列是纹理,必须显式绑:
       *   --tex uShadeEnvLut=golden/w3/env-mid.png
       * 三个 preset 的完整参数在 golden/w3/run.mjs 的 PRESETS 里。 */
      uShadeEnvLutScale: [2.0],   // env-column.ts 的 ENV_LUT_SCALE
      uShadeEnvLutMin: [-0.2],    // 域:反射方向的 sin(仰角)
      uShadeEnvLutMax: [1.0],
      uShadeBody: [0.62],         // 水体亮度。mid 是乳白湖水,前景那片平静的亮面就是它
      uShadeEnvGain: [1.0],
      uShadeSpecGain: [0.0],      // 白天没有点光源;夜景 preset 才开
      uShadeLightOmega: [6.8e-5], // 月亮立体角。**不许省**,少了这项近场烧成全白
      uShadeLightElev: [0.06],
      uShadeLightAz: [0.0],
      uShadeSigmaFloor: [2e-4],
      uShadeSpecClip: [1.5],
      uShadeExposure: [0.10],
      uShadeContrast: [8.0],      // 1-bit 输出的显示对比度,不是物理量
      uShadePivot: [0.48],
      uShadeSkyGain: [1.0],
      /* 天空专属的地平线辉光。默认 0 = 关闭(mid/near 不需要,旧黄金帧逐字等价);
       * night 在 golden/w3/run.mjs 里开到 0.9 / 0.030,见 docs §13。 */
      uShadeSkyGlowGain: [0.0],
      uShadeSkyGlowWidth: [0.030],
      /* 地平线起伏。默认 0 = 关闭(旧黄金帧逐字等价)。 */
      uShadeHorizonJitter: [0.0],
      uShadeHorizonJitterScale: [14.0],

      /* —— W4 dither.glsl.ts(uDither 前缀,契约 §3)——
       * 阈值图是纹理,必须显式绑:
       *   --tex uDitherNoise=public/water/blue-noise-128.png
       * uDitherPixel/uDitherAniso 的三个 preset 值在 golden/w3/run.mjs 的 PRESETS 里
       * (near 0 / mid 0.8 / night 0 —— 别照 W3 那句"越各向异性越好",见 docs §12)。
       * 这里的默认值沿用旧 uPixel/uDitherAniso/uQuantize,保证不带 --set 的行为不变。 */
      /* —— W5 light.glsl.ts(uOrb 前缀,契约 §3)——
       * **默认全部关闭**:uOrbEnergy = 0 → 所有出口精确返回 0.0 →
       * 与灯球接入前的黄金帧逐字节相同。这是 W5 §5 那条硬性回归的落点,
       * 别把默认值调成非零"图省事"。
       * uOrbSpots[] 由 golden/w3/run.mjs 从 orb-light.ts 每帧算好后 --set 进来。 */
      uOrbLightMode: [0],
      uOrbEnergy: [0.0],
      uOrbCenter: [0, 2.0, 6.0], // (x, 离水面高度, y_field),米
      uOrbRadius: [0.35],
      uOrbBodyGain: [0.25],
      uOrbSpecGain: [1.0],
      uOrbPatchGain: [0.8],
      uOrbPatchCenter: [0, 6.0],
      uOrbPatchRadius: [2.0],
      uOrbOmega: [3.0e-4], // 单片镜子在水面处张开的立体角
      uOrbSigmaFloor: [2e-4],
      uOrbSpecClip: [1.5],
      uOrbLightmapFrame: [0],
      uOrbLightmapCols: [12],
      uOrbLightmapRows: [10], // 12×10 = 120 帧,与 ball-loop 同长
      uOrbLightmapRect: [-8, 0, 16, 24], // 照度图覆盖的场坐标矩形

      /* —— W10 聚焦渐晕(light.glsl.ts 的第四条通道)——
       * **默认关闭**:uOrbFocus = 0 → waterOrbFocusDim 精确返回 1.0 →
       * body × 1.0 逐位不变 → 与 W8 定稿的黄金帧逐字节相同。
       * 这是 W10 §3 那条硬性回归的落点,别把默认值调成非零"图省事"。
       * 其余五个是 mid 的定标值(presets.ts 的 WATER_PRESETS.mid.focus),
       * uOrbGround 由 golden/w3/run.mjs 从球心 --set 进来。 */
      uOrbFocus: [0.0],
      uOrbGround: [-1.12, 6.85], // 球在水面的落点(场坐标,米)
      uOrbPoolR: [2.6],
      uOrbAmbient: [0.58],
      uOrbGrain: [2.0],
      uOrbGrainBias: [0.42],
      uOrbFarKeep: [0.28],
      uOrbSpinPhase: [0.0],

      /* —— W6 ripple.glsl.ts(uRipple 前缀,契约 §3)——
       * **默认全部关闭**:uRippleAmp = 0 且 uRippleTexSize = (0,0) →
       * `waterRipple` 精确返回 vec3(0.0),而 field.glsl.ts 里那段耦合根本不进分支,
       * 输出与 W5 定稿逐字节相同。这是 W6 §4.1 那条硬性回归的落点。
       * 求解纹理不是 PNG,不走 --tex:由 --ripple-steps 触发,页面里跑完 N 步
       * 再把结果绑上来,同时把 uRippleTexSize 改成 (256,256)。 */
      uRippleTexSize: [0, 0],
      uRippleWorldMin: [-4.0, 2.0],
      uRippleWorldSize: [8.0],
      uRippleAmp: [0.0],
      uRippleLodBias: [1.5],
      uRippleEdgeFade: [8.0],

      uDitherPixel: [3],
      uDitherQuantize: [1],
      uDitherInk: [0.196, 0.2, 0.102], // --water-ink  #32331A
      uDitherPaper: [0.902, 0.996, 0.992], // --water-paper #E6FEFD
    }[name];
    const size = { float: 1, int: 1, vec2: 2, vec3: 3, vec4: 4 }[type];
    out[name] = { type, value: preset ?? new Array(size).fill(0) };
  }
  return out;
}

const src = loadShader(shaderPath);
const uniforms = defaultsFor(src);

/* ── W6 涟漪:时间演化的确定性复现 ─────────────────────────────────────────
 * 渲染台原本只渲**一帧**,而涟漪是时间演化的。加的模式是:
 * 从一组**确定的初始冲击**出发,以**固定 dt** 跑 N 步显式波动方程,再渲染读回。
 *
 *   --ripple-steps 60                跑多少步(0 = 关闭涟漪,默认)
 *   --ripple-dt 0.016                每步秒数。**绝不用 performance.now()**
 *   --ripple-impulse x,y,强度,半径[,步] 世界坐标下丢一个冲击,可重复
 *   --ripple-world minX,minY,边长     纹理覆盖的世界矩形(米)
 *   --ripple-speed / --ripple-damping / --ripple-sponge / --ripple-sponge-k
 *   --ripple-amp                     消费端幅度(0 = 关闭)
 *   --ripple-probe 20,40,60          在这些步数上读回状态图,打波前半径/环宽/峰值
 *
 * 同一组参数跑两次必须逐字节相同 —— 这条在 docs/water-ripple.md §6 有实测。
 * 求解器用的是 `src/components/lab/water/ripple.ts` 的 `RippleSolver` **本体**
 * (源码 toString() 内联进页面),不是抄一份;着色器取自 `ripple.glsl.ts`。 */
const rippleSteps = parseInt(arg("--ripple-steps", "0"), 10);
let ripple = null;
let RIPPLE_JS = "";
if (rippleSteps > 0) {
  const RGL = await import(
    pathToFileURL(path.join(HARNESS_ROOT, "src/components/lab/water/ripple.glsl.ts")).href
  );
  const RTS = await import(
    pathToFileURL(path.join(HARNESS_ROOT, "src/components/lab/water/ripple.ts")).href
  );
  RIPPLE_JS = [
    RTS.RippleSolver.toString(),
    RTS.createRippleSolver.toString(),
    `const RIPPLE_TEX_SIZE=${RTS.RIPPLE_TEX_SIZE};`,
    `const RIPPLE_IMPULSE_SLOTS=${RTS.RIPPLE_IMPULSE_SLOTS};`,
    `const RIPPLE_CFL_MAX=${RTS.RIPPLE_CFL_MAX};`,
    `const RIPPLE_HOVER_STRENGTH=${RTS.RIPPLE_HOVER_STRENGTH};`,
    `const RIPPLE_DEFAULT_RADIUS=${RTS.RIPPLE_DEFAULT_RADIUS};`,
    `const RIPPLE_SOLVE_SRC=${JSON.stringify(RGL.SOLVE_SRC)};`,
  ].join("\n");

  const impulses = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--ripple-impulse") continue;
    const n = argv[i + 1].split(",").map(Number);
    impulses.push({
      x: n[0], y: n[1],
      strength: n[2] === undefined ? 0.002 : n[2],
      radius: n[3] === undefined ? 0.06 : n[3],
      step: n[4] === undefined ? 0 : n[4],
    });
  }
  const w = arg("--ripple-world", "-4,2,8").split(",").map(Number);
  ripple = {
    steps: rippleSteps,
    dt: parseFloat(arg("--ripple-dt", "0.016")),
    worldMin: [w[0], w[1]],
    worldSize: w[2],
    waveSpeed: parseFloat(arg("--ripple-speed", "0.45")),
    damping: parseFloat(arg("--ripple-damping", "0.997")),
    spongeTexels: parseFloat(arg("--ripple-sponge", "24")),
    spongeStrength: parseFloat(arg("--ripple-sponge-k", "0.12")),
    size: parseInt(arg("--ripple-size", "256"), 10),
    impulses,
    probe: arg("--ripple-probe", "").split(",").filter(Boolean).map(Number),
    probeAt: impulses.length ? [impulses[0].x, impulses[0].y] : [w[0] + w[2] / 2, w[1] + w[2] / 2],
    /* 前沿判定的**绝对**阈值 = 首个冲击幅度的 2%。取百分比 of 当前环峰
     * 会让前沿跟着环峰一起振荡,读不出匀速(见 ripple.ts 的说明)。 */
    edgeThreshold: (impulses.length ? impulses[0].strength : 0.002) * 0.02,
  };
  if (uniforms.uRippleWorldMin) uniforms.uRippleWorldMin.value = ripple.worldMin;
  if (uniforms.uRippleWorldSize) uniforms.uRippleWorldSize.value = [ripple.worldSize];
  if (uniforms.uRippleAmp) uniforms.uRippleAmp.value = [parseFloat(arg("--ripple-amp", "1"))];
}

// --tex uName=path.png:把一张 PNG 作为 sampler2D 绑上去(NEAREST + REPEAT)
const textures = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--tex") continue;
  const [name, file] = argv[i + 1].split("=");
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  textures.push({ name, w: info.width, h: info.height, data: Array.from(data) });
  // 纹理尺寸也走 uniform 通道,否则会被后面的 setAll 统一写成 0 → 采样出 NaN
  if (uniforms[name + "Size"]) uniforms[name + "Size"].value = [info.width, info.height];
}
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--set") continue;
  const [name, vals] = argv[i + 1].split("=");
  const nums = vals.split(",").map(Number);
  if (!uniforms[name]) {
    console.warn(`  [警告] 着色器里没有 uniform ${name},忽略`);
    continue;
  }
  if (uniforms[name].array) {
    // 数组:给多少写多少,不足的补 0(未用的光斑槽位强度就该是 0)
    const want = uniforms[name].value.length;
    const v = new Array(want).fill(0);
    for (let k = 0; k < Math.min(want, nums.length); k++) v[k] = nums[k];
    if (nums.length > want) console.warn(`  [警告] ${name} 给了 ${nums.length} 个值,数组只有 ${want} 格,多余的丢弃`);
    uniforms[name].value = v;
    continue;
  }
  uniforms[name].value = nums;
}
uniforms.uRes && (uniforms.uRes.value = [W, H]);
uniforms.uTime && (uniforms.uTime.value = [time]);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000;overflow:hidden}
canvas{display:block;width:${W}px;height:${H}px}
</style></head><body><canvas id="c" width="${W}" height="${H}"></canvas>
<script>
window.__ready = false; window.__err = null; window.__cost = null;
window.__probes = null; window.__rippleInfo = null; window.__rippleWarn = null;
/* W6 涟漪求解器:src/components/lab/water/ripple.ts 的 RippleSolver **本体**,
 * 靠 toString() 原样内联(和预览台内联 orb-light.ts 那几个函数同一招)。
 * 抄一份 JS 会重演 docs §11 坑 7:两边悄悄漂了还没人发现。--ripple-steps 为 0 时这里是空串。 */
${RIPPLE_JS}
(function(){
  const FRAG = ${JSON.stringify(src)};
  const UNIFORMS = ${JSON.stringify(uniforms)};
  const TEXTURES = ${JSON.stringify(textures)};
  const RIPPLE = ${JSON.stringify(ripple)};
  const VERT_100 = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }";
  const VERT_300 = "#version 300 es\\nin vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }";
  const es3 = FRAG.trimStart().startsWith("#version 300");
  const c = document.getElementById("c");
  const gl = c.getContext("webgl2", { antialias:false, alpha:false, preserveDrawingBuffer:true });
  if (!gl) { window.__err = "WebGL2 unavailable"; window.__ready = true; return; }
  window.__caps = {
    colorBufferFloat: !!gl.getExtension("EXT_color_buffer_float"),
    floatLinear: !!gl.getExtension("OES_texture_float_linear"),
    timerQuery: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    renderer: (function(){ const d = gl.getExtension("WEBGL_debug_renderer_info");
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()
  };
  function sh(type, s){ const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o);
    if(!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  try{
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, es3 ? VERT_300 : VERT_100));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, "aPos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    /* ── W6:先把涟漪跑满 N 步,再渲水面 ────────────────────────────────
     * 放在 TEXTURES 绑定**之前**:求解 pass 会占用 TEXTURE0 并切走 program,
     * 让下面那个 forEach 把单元 0..n-1 重新绑一遍,省得手工恢复。 */
    let rippleSolver = null;
    if (RIPPLE) {
      rippleSolver = createRippleSolver(gl, RIPPLE_SOLVE_SRC, RIPPLE);
      if (!rippleSolver) {
        /* 优雅降级:拿不到 EXT_color_buffer_float 就当没有涟漪 —— 不黑屏、不抛。
         * uRippleTexSize 留 (0,0),waterRipple 精确返回 0。 */
        window.__rippleWarn = "EXT_color_buffer_float / RG16F FBO 不可用 —— 涟漪已降级为关闭";
      } else {
        const probes = [];
        for (let i = 0; i < RIPPLE.steps; i++){
          for (let j = 0; j < RIPPLE.impulses.length; j++){
            const im = RIPPLE.impulses[j];
            if (im.step === i) rippleSolver.injectImpulse([im.x, im.y], im.strength, im.radius);
          }
          rippleSolver.stepFixed(RIPPLE.dt);   // 越界抛,不悄悄夹 —— 黄金帧协议
          if (RIPPLE.probe.indexOf(i + 1) >= 0){
            const pr = rippleSolver.probe(RIPPLE.probeAt, RIPPLE.edgeThreshold);
            pr.step = i + 1;
            pr.t = +(RIPPLE.dt * (i + 1)).toFixed(4);
            probes.push(pr);
          }
        }
        window.__probes = probes;
        window.__rippleInfo = {
          courant: rippleSolver.courant(RIPPLE.dt),
          texelM: rippleSolver.texelSize(),
          maxDt: rippleSolver.maxDt(),
          steps: rippleSolver.steps,
          simTime: rippleSolver.simTime,
        };
        const unit = TEXTURES.length;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, rippleSolver.texture());
        const rl = gl.getUniformLocation(p, "uRippleTex");
        if (rl) { gl.useProgram(p); gl.uniform1i(rl, unit); }
        if (UNIFORMS.uRippleTexSize) UNIFORMS.uRippleTexSize.value = [rippleSolver.size, rippleSolver.size];
        window.__rippleCost = function(n){
          const px = new Float32Array(4);
          const t0 = performance.now();
          for (let i = 0; i < n; i++) rippleSolver.stepFixed(RIPPLE.dt);
          gl.bindFramebuffer(gl.FRAMEBUFFER, rippleSolver.fbo[rippleSolver.cur]);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          const ms = performance.now() - t0;
          gl.useProgram(p); gl.viewport(0,0,${W},${H});
          return { totalMs:+ms.toFixed(2), perStepMs:+(ms/n).toFixed(4), n:n };
        };
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(p);
    }

    const setAll = (t) => {
      for (const [name, u] of Object.entries(UNIFORMS)) {
        const loc = gl.getUniformLocation(p, name);
        if (!loc) continue;
        const v = (name === "uTime" && t != null) ? [t] : u.value;
        if (u.array) {
          // 数组 uniform:一次写整段(W5 的 uOrbSpots[K])
          const a = new Float32Array(v);
          if (u.type === "float") gl.uniform1fv(loc, a);
          else if (u.type === "vec2") gl.uniform2fv(loc, a);
          else if (u.type === "vec3") gl.uniform3fv(loc, a);
          else if (u.type === "vec4") gl.uniform4fv(loc, a);
          else if (u.type === "int") gl.uniform1iv(loc, new Int32Array(v));
          continue;
        }
        if (u.type === "float") gl.uniform1f(loc, v[0]);
        else if (u.type === "int") gl.uniform1i(loc, v[0]|0);
        else if (u.type === "vec2") gl.uniform2f(loc, v[0], v[1]);
        else if (u.type === "vec3") gl.uniform3f(loc, v[0], v[1], v[2]);
        else if (u.type === "vec4") gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
      }
    };
    TEXTURES.forEach(function(tx, unit){
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, tx.w, tx.h, 0, gl.RED, gl.UNSIGNED_BYTE,
                    new Uint8Array(tx.data));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const loc = gl.getUniformLocation(p, tx.name);
      if (loc) gl.uniform1i(loc, unit);
      const sz = gl.getUniformLocation(p, tx.name + "Size");
      if (sz) gl.uniform2f(sz, tx.w, tx.h);
    });
    gl.viewport(0,0,${W},${H});
    setAll(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    // 单像素回读强制同步:SwiftShader 下 finish() 不足以逼出真实光栅耗时
    const px = new Uint8Array(4);
    window.__draw = function(n){
      const ts = [];
      for (let i=0;i<n;i++){
        const t0 = performance.now();
        setAll(${time} + i*0.016);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
        ts.push(performance.now()-t0);
      }
      ts.sort((x,y)=>x-y);
      return { medianMs:+ts[ts.length>>1].toFixed(2), minMs:+ts[0].toFixed(2), n:n };
    };
    // 恢复到指定时刻的那一帧,供截图
    setAll(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
  } catch(e) { window.__err = String(e && e.message || e); }
  window.__ready = true;
})();
</script></body></html>`;

const tmp = path.join(process.cwd(), ".harness.html");
writeFileSync(tmp, PAGE);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-lcd-text",
  ],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("  [page error]", e.message));
await page.goto("file://" + tmp);
await page.waitForFunction("window.__ready === true", { timeout: 60000 });

const err = await page.evaluate("window.__err");
const caps = await page.evaluate("window.__caps");
if (err) {
  console.error("\n  着色器失败:\n" + err + "\n");
  await browser.close();
  process.exit(1);
}

mkdirSync(path.dirname(outPath), { recursive: true });
await page.locator("#c").screenshot({ path: outPath });

const rippleWarn = await page.evaluate("window.__rippleWarn");
const rippleInfo = await page.evaluate("window.__rippleInfo");
const probes = await page.evaluate("window.__probes");

let cost = null;
let rippleCost = null;
if (wantCost) {
  cost = await page.evaluate("window.__draw(40)");
  if (rippleInfo) rippleCost = await page.evaluate("window.__rippleCost ? window.__rippleCost(200) : null");
}

await browser.close();

console.log(`\n  ${path.basename(shaderPath)} → ${outPath}  (${W}×${H}, t=${time}s)`);
console.log(
  `  WebGL2 能力: color_buffer_float=${caps.colorBufferFloat} float_linear=${caps.floatLinear} timer_query=${caps.timerQuery}`
);
console.log(`  渲染器: ${caps.renderer}`);
if (cost) {
  console.log(
    `  软件光栅相对成本: 中位 ${cost.medianMs} ms/帧 @${W}×${H} (n=${cost.n}) — 仅供路线间横向比较,不是 GPU 预算值`
  );
}
if (rippleWarn) console.log(`  [涟漪] ${rippleWarn}`);
if (rippleInfo) {
  console.log(
    `  涟漪: ${ripple.size}² RG16F · ${rippleInfo.steps} 步 × dt=${ripple.dt}s = ${rippleInfo.simTime.toFixed(3)}s · ` +
      `c=${ripple.waveSpeed} m/s · Δx=${rippleInfo.texelM.toFixed(5)} m · ` +
      `**C=${rippleInfo.courant.toFixed(4)}**(CFL 上限 0.7,maxDt=${rippleInfo.maxDt.toFixed(5)}s) · ` +
      `damping=${ripple.damping} · 覆盖 [${ripple.worldMin[0]}, ${ripple.worldMin[1]}] + ${ripple.worldSize}m`
  );
  if (rippleCost) {
    console.log(
      `  求解相对成本: ${rippleCost.perStepMs} ms/步 @${ripple.size}² (n=${rippleCost.n}) — 同样是软件光栅值,不是 GPU 预算`
    );
  }
}
if (probes && probes.length) {
  /* 「恒速扩散」看的是 **edge(前沿)** 那一列,不是 front(环峰)。
   * 环峰会被初始高斯的内支来回反弹带偏;d'Alembert 的前沿才是匀速的。 */
  console.log("  波前探针(圆心 = 第一个冲击点):");
  console.log("    步   t(s)   前沿(纹素) 前沿(m)  环峰(纹素) 环宽(纹素) 峰值|h|(m)    RMS(m)     NaN");
  let prev = null;
  for (const q of probes) {
    const d = prev ? q.edgeTexels - prev.edgeTexels : NaN;
    console.log(
      `    ${String(q.step).padStart(4)} ${q.t.toFixed(3).padStart(6)} ` +
        `${String(q.edgeTexels).padStart(9)} ${q.edgeMeters.toFixed(4).padStart(8)} ` +
        `${String(q.frontTexels).padStart(9)} ${String(q.ringWidthTexels).padStart(9)} ` +
        `${q.peakAbs.toExponential(3).padStart(12)} ` +
        `${q.rms.toExponential(3).padStart(11)} ${String(q.nanCount).padStart(5)}` +
        (prev ? `   Δ前沿=${d} 纹素` : "")
    );
    prev = q;
  }
}
console.log("");
