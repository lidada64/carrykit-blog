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
import { chromium } from "playwright";
import sharp from "sharp";

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
  const re = /uniform\s+(float|int|vec2|vec3|vec4|sampler2D)\s+(\w+)\s*;/g;
  let m;
  while ((m = re.exec(src))) {
    const [, type, name] = m;
    if (type === "sampler2D") continue;
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
    }[name];
    const size = { float: 1, int: 1, vec2: 2, vec3: 3, vec4: 4 }[type];
    out[name] = { type, value: preset ?? new Array(size).fill(0) };
  }
  return out;
}

const src = loadShader(shaderPath);
const uniforms = defaultsFor(src);

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
(function(){
  const FRAG = ${JSON.stringify(src)};
  const UNIFORMS = ${JSON.stringify(uniforms)};
  const TEXTURES = ${JSON.stringify(textures)};
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
    const setAll = (t) => {
      for (const [name, u] of Object.entries(UNIFORMS)) {
        const loc = gl.getUniformLocation(p, name);
        if (!loc) continue;
        const v = (name === "uTime" && t != null) ? [t] : u.value;
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

let cost = null;
if (wantCost) cost = await page.evaluate("window.__draw(40)");

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
console.log("");
