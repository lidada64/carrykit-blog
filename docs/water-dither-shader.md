# 抖动流水背景(WaterDither shader) — 可复用归档

> **状态**:2026-08-25 原型完成,曾作为首页全屏背景(`HeroWater`)接入,验证了
> 主题反色 / 顶部静止带 / 切换过渡等细节,**现已从首页移除**(`HeroWater` 删除、
> layout 摘除),主页恢复为「只有标题、无背景」。
>
> **引擎 `WaterDither` 组件与 `/lab/water` 原型页仍保留在树里**(可继续调参预览),
> 本文件完整记录设计、参数与被删的首页集成源码,供日后在首页/别处重启复用。
> 参照 [`pretext-scrolling-subtitle-flow.md`](pretext-scrolling-subtitle-flow.md) 的归档法。

---

## 1. 一句话定位

奥伯拉丁风格的 **1-bit 抖动「流水」**:纯裸 WebGL(零依赖)全屏铺满,用一张
高度场 + Bayer 8×8 有序抖动量化成**站点两色**(墨/纸,跟随主题 token),读作
「流动的亮带 / 暗水」而非满屏中灰噪点。可当页面/区块背景,鼠标激涟漪。

## 2. 水读作水,靠哪几样(设计要点)

1. **定向平流 + 域扭曲**:坐标被另一层 fbm 扭动 → 液体涡流,波脊弯曲成流;
   再叠一个随时间前推的相位 → 水在「流」。
2. **各向异性**:flow 采样 `fbm(qr * vec2(1.1, 3.6))` 纵向压缩,拉出水平流纹。
3. **法线高光 + 焦散**:从高度场前向差分取法线,做镜面高光——波峰反光的闪烁
   是「水读作水」的关键;高对比让抖动落成亮带/暗水,而不是纸碎屑般的中灰网点。
4. **两色抖动**:`bayer8(floor(frag / uPixel))` 阈值化 → `mix(uInk, uPaper, bw)`。
   按**设备物理像素**采样,retina 不糊;`prefers-reduced-motion` 定格静态帧。

## 3. 演进 & 踩过的坑(调参历程)

- **波脊太规则(等距横线)**:根因是「域扭曲」只有单层、强度小。改为**双层迭代
  域扭曲**——低频大涡 `warp1` 把波脊整体推弯,再喂进高频细涡 `warp2` 卷出湍流
  (`qr += uWarp * (0.42·warp1 + 0.22·warp2)`),并加大 flow 对相位的扰动
  (`uFlowBend`)。抽成 `warp` / `flowBend` 两个可调 uniform。
- **「中间两条宽光带」**:并非 bug。主波脊项 `sin(q.y * 8.5 …)` 在整屏高度上
  只有 `8.5 / 2π ≈ 1.35` 个周期 → **恰好落两个波峰**,`smoothstep(hC)` 把峰映射成
  亮带 → 两条胖亮带。想要更密的流纹得抬高 `q.y` 系数(8.5 / 16.0)。
- **波峰该横还是竖**:顺流条痕(平行流向,横)vs 波前(垂直流向,竖)都真实。
  做成 **`angle` uniform**:把坐标旋进「流向参考系」(`mat2(ca,sa,-sa,ca)*q`),
  波脊/平流/各向异性一起转,`0°`↔`90°` 横竖无级切换。**鼠标涟漪留在原始坐标系**
  (径向、与旋转无关),锚在光标下不跟着转。
- **主题切换「不反色」**:曾**按亮度**分配颜色(暗 token→ink、亮 token→paper),
  结果两种主题都成「深底+浅纹」,几乎看不出切换。改为**按角色**:
  `ink = --background`(水底)、`paper = --foreground`(高光波纹)。这样水面跟随
  页面一起反色——**日间亮水·深墨波纹,夜间暗水·亮波纹**(见 `themeColors()`)。
- **切换时颜色瞬跳**:与 body 的 `0.4s` 过渡不同步、突兀。加**逐帧色彩缓动**
  (指数,τ≈0.12s ≈ 0.4s 收敛):`syncTheme` 只设目标色,`draw` 每帧把当前色追向
  目标。首帧与 reduced-motion 瞬切(后者补一帧)。
- **背景流动干扰导航文字**:加**顶部静止带** `calmTop`——顶部 `[0, calmTop]`(CSS px,
  上传前 ×dpr)把随时间变化的动态量渐隐为静止的纯背景色,`[calmTop, 2·calmTop]`
  平滑过渡回全速水面。导航就坐在静止纯色区上,不被水纹干扰。

## 4. 集成坑(首页那次)

- **要盖住导航栏**:导航 `<Nav>` 在 `SmoothScroll` 内、`<main>` 之上,把 hero 往下
  推,水面若放在 hero 里盖不到导航那条。且 `SmoothScroll` 用 transform,**fixed 元素
  放进去会失效**。解法:把水面提成 **`fixed inset-0 -z-10` 全屏层,渲染在
  SmoothScroll 层外**(与 Revealer / ScrollIndicator 同理),即 `HeroWater`。
- **`-z-10` 能透出**:`body` 背景不透明,但绘制在最底;fixed `-z-10` 子元素绘于
  body 背景之上、in-flow 内容之下 → 水显示、导航/标题在其上可读。`pointer-events-none`
  不拦截交互(代价:首页无鼠标涟漪,但 Act I「暗·静」本就求静)。
- **导航取色随之定**:水面既然跟随主题反色(日间亮水/夜间暗水),导航沿用主题
  token(`text-foreground/muted`)即两主题都清晰,**无需强制白**。若改成「两主题
  都暗水」的方案,才需要把导航翻白——两者要一起定。

## 5. 参数表(`WaterDitherParams` + 颜色)

| 参数 | 含义 | 建议范围 | 首页用值(Act I·暗·静) |
|---|---|---|---|
| `speed` | 流速 | 0–3 | `0.35` |
| `cell` | 抖动网点单元(CSS px,越小越密) | 1–8 | `2` |
| `brightness` | 亮度偏移(1=不变) | 0.4–1.6 | `0.7` |
| `contrast` | 对比 | 0.6–2 | `1.35` |
| `glint` | 高光/闪光强度 | 0–2 | `0.6` |
| `warp` | 域扭曲强度(0=笔直横线) | 0–2.5 | `0.8` |
| `flowBend` | flow 对波脊相位的扰动(越大越有机) | 0–2.5 | `0.7` |
| `angle` | 流向角(度):0=横波脊竖滚,90=竖波峰横推 | 0–180 | `0` |
| `calmTop` | 顶部静止带高度(CSS px,0=关) | 0–240 | `96` |
| `ink`/`paper` | 显式两色(不传则跟随主题 token) | — | 不传 |

`/lab/water` 预览页把上述全部挂成实时滑块,并有 Act I / Act II 两档预设,可直接调。

## 6. 复用步骤

1. 引擎已在 `src/components/lab/water-dither.tsx`(见 §7.1 快照)。零依赖,直接用。
2. 当区块背景:`<WaterDither className="absolute inset-0 h-full w-full" {...params} />`,
   容器 `relative`,内容 `relative z-10`。
3. 当**全屏页面背景且要盖导航**:照 §7.2 的 `HeroWater`——`fixed inset-0 -z-10`,
   **渲染在惯性滚动/transform 包裹层之外**,按路由 `usePathname` 门控。
4. 不传 `ink/paper` 即跟随站点 `--foreground/--background`,并随 `data-theme` 反色 +
   过渡;要固定配色就显式传(会关掉主题跟随与过渡)。
5. 顶部有浮层文字(导航)时给 `calmTop` ≈ 浮层高度,静止纯色打底。

---

## 7. 完整源码

### 7.1 引擎 `src/components/lab/water-dither.tsx`(快照,树内仍在)

```tsx
"use client";

import { useEffect, useRef } from "react";

export interface WaterDitherParams {
  /** 流速 */
  speed: number;
  /** 抖动网点单元(CSS px,越大越"糙") */
  cell: number;
  /** 亮度偏移(1 = 不变) */
  brightness: number;
  /** 对比 */
  contrast: number;
  /** 高光/闪光强度(水的"反光"多寡) */
  glint: number;
  /** 域扭曲强度(波脊被推弯/卷漩的程度,0=笔直横线) */
  warp: number;
  /** flow 对波脊相位的扰动(越大波脊越被揉碎、越有机) */
  flowBend: number;
  /** 流向角(度):0=横波脊竖直滚,90=竖波峰横推 */
  angle: number;
  /** 顶部静止带高度(CSS px):此带内水面渐隐为静止纯背景色,不流动;0=关闭 */
  calmTop: number;
}

export interface WaterDitherProps extends Partial<WaterDitherParams> {
  /** 墨色(暗),归一化 rgb 0..1;默认贴站点 --foreground #1a1a1a */
  ink?: [number, number, number];
  /** 纸色(亮),归一化 rgb 0..1;默认贴站点 --background #fafaf8 */
  paper?: [number, number, number];
  className?: string;
}

const DEFAULTS: WaterDitherParams = {
  speed: 1,
  cell: 3,
  brightness: 1,
  contrast: 1.2,
  glint: 1,
  warp: 1,
  flowBend: 1,
  angle: 0,
  calmTop: 0,
};

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;   // uv 0..1 (y 从顶算)
uniform float uMouseOn;
uniform float uSpeed;
uniform float uPixel;  // 抖动单元(设备物理 px)
uniform float uBright;
uniform float uContrast;
uniform float uGlint;
uniform float uWarp;      // 域扭曲强度
uniform float uFlowBend;  // flow 对波脊相位的扰动
uniform float uAngle;     // 流向角(弧度):0=横波脊竖直滚,π/2=竖波峰横推
uniform float uCalmTop;   // 顶部静止带高度(设备px):带内水面渐隐为静止纯背景
uniform vec3 uInk;
uniform vec3 uPaper;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// 流水高度场:域扭曲 + 定向平流的「横向波脊」(带符号,谷负脊正)。
// 不再用中灰 fbm 噪声当水面——那会被抖动打成满屏网点(纸碎屑)。
float height(vec2 q){
  float t = uTime * uSpeed;
  float aspect = uRes.x / uRes.y;
  // 流向参考系:把坐标旋 uAngle,波脊/平流/各向异性一起转。angle=0 →
  // 横波脊竖直滚(原观感);angle=π/2 → 竖波峰横推。无级过渡。
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 qr = mat2(ca, sa, -sa, ca) * q;
  // 双层迭代域扭曲(在流向参考系里做):低频大涡把波脊整体推弯,再喂进
  // 高频细涡卷出湍流,让波脊成流、成漩,而不是笔直线。
  vec2 warp1 = vec2(fbm(qr * 1.2 + vec2(t * 0.10, 0.0)),
                    fbm(qr * 1.2 + vec2(0.0, t * 0.08) + 5.2));
  vec2 warp2 = vec2(fbm(qr * 3.2 + 1.8 * warp1 + vec2(0.0, t * 0.16)),
                    fbm(qr * 3.2 + 1.8 * warp1 + vec2(t * 0.14, 0.0) + 9.1));
  qr += uWarp * (0.42 * warp1 + 0.22 * warp2);
  // 流纹:sine 波脊沿 qr.y 排布,随时间向前推(定向平流)。
  // flow 对相位的扰动越大(uFlowBend),波脊越被流场揉碎、越有机。
  float flow = fbm(qr * vec2(1.1, 3.6) + vec2(t * 0.45, t * 0.12));
  float h  = sin((qr.y * 8.5 + flow * 11.0 * uFlowBend) - t * 1.05);
  h += 0.5 * sin((qr.y * 16.0 + flow * 7.0 * uFlowBend) + t * 0.70);
  // 鼠标涟漪:留在原始 q 空间(径向,与旋转无关),锚在光标下不跟着转
  vec2 mp = vec2(uMouse.x * aspect, uMouse.y);
  float d = distance(q, mp);
  h += uMouseOn * sin(d * 30.0 - uTime * 6.0) * exp(-d * 7.0) * 1.1;
  return h;   // ~ -1.5..1.5
}

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); // y 从顶算
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * uSpeed;

  // 从高度场取法线(前向差分)
  float e = 0.0016;
  float hC = height(p);
  float hR = height(p + vec2(e, 0.0));
  float hU = height(p + vec2(0.0, e));
  vec3 n = normalize(vec3(hC - hR, hC - hU, e * 3.0));

  // 镜面高光:锐反光集中在波脊,当"闪"点缀而非满屏白点
  vec3 L = normalize(vec3(-0.3, -0.5, 0.78));
  float spec = pow(max(dot(n, L), 0.0), 30.0);

  // 反射亮带:波脊(hC 高)= 亮反光,波谷 = 暗水。高对比让抖动落成
  // 「流动的亮带 / 暗水」,而不是满屏中灰噪点(纸碎屑的根源)。
  float band = smoothstep(0.10, 0.95, hC);
  // 顶部静止带:calm 在 [uCalmTop, 2·uCalmTop] 内由 0→1。带内把随时间变化的
  // 动态量(亮带/高光)渐隐,只剩静止的平背景色(lum=0.10),不干扰导航文字。
  float calm = uCalmTop > 0.0 ? smoothstep(uCalmTop, uCalmTop * 2.0, frag.y) : 1.0;
  float lum = 0.10 + calm * (0.44 * band + uGlint * spec * 0.5);
  lum = (lum - 0.5) * uContrast + 0.5 + (uBright - 1.0);
  lum = clamp(lum, 0.0, 1.0);

  float th = bayer8(floor(frag / uPixel));
  float bw = step(th, lum);
  gl_FragColor = vec4(mix(uInk, uPaper, bw), 1.0);
}
`;

type RGB = [number, number, number];

/** 解析 #rgb / #rrggbb 为归一化 rgb;失败返回 null。 */
function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/**
 * 读站点主题 token,按角色分配:水底(ink)= 页面背景 --background,高光波纹
 * (paper)= 前景 --foreground。故水面跟随页面一起反色——日间亮水·深墨波纹,
 * 夜间暗水·亮波纹。(按亮度分配会让两种主题都成「深底浅纹」,看不出切换。)
 */
function themeColors(): { ink: RGB; paper: RGB } | null {
  if (typeof window === "undefined") return null;
  const cs = getComputedStyle(document.documentElement);
  const fg = parseHex(cs.getPropertyValue("--foreground"));
  const bg = parseHex(cs.getPropertyValue("--background"));
  if (!fg || !bg) return null;
  return { ink: bg, paper: fg };
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

export function WaterDither({ ink, paper, className, ...params }: WaterDitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef<WaterDitherParams>({ ...DEFAULTS });
  paramsRef.current = { ...DEFAULTS, ...params };
  // 当前渲染色(每帧上传);inkRef 向 inkTargetRef 缓动 → 主题切换有过渡。
  // 均为组件自有数组(不复用 props 引用),缓动逐帧原地改写不污染外部。
  const inkRef = useRef<RGB>(ink ? [...ink] : [0.102, 0.102, 0.102]);
  const paperRef = useRef<RGB>(paper ? [...paper] : [0.98, 0.98, 0.972]);
  const inkTargetRef = useRef<RGB>([...inkRef.current]);
  const paperTargetRef = useRef<RGB>([...paperRef.current]);
  // 显式传色:当前与目标都锁定为该色(瞬切,无过渡)
  if (ink) { inkRef.current = [...ink]; inkTargetRef.current = [...ink]; }
  if (paper) { paperRef.current = [...paper]; paperTargetRef.current = [...paper]; }
  // 是否显式传色(供 mount-only 主渲染 effect 读取,避免直接引用 props)
  const explicitRef = useRef({ ink: !!ink, paper: !!paper });
  explicitRef.current = { ink: !!ink, paper: !!paper };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) {
      // eslint-disable-next-line no-console
      console.warn("WebGL 不可用,WaterDither 无法渲染");
      return;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("uRes"), uTime = u("uTime"), uMouse = u("uMouse"),
      uMouseOn = u("uMouseOn"), uSpeed = u("uSpeed"), uPixel = u("uPixel"),
      uBright = u("uBright"), uContrast = u("uContrast"), uGlint = u("uGlint"),
      uWarp = u("uWarp"), uFlowBend = u("uFlowBend"), uAngle = u("uAngle"),
      uCalmTop = u("uCalmTop"), uInk = u("uInk"), uPaper = u("uPaper");

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const mouse = { x: 0.5, y: 0.5, on: 0 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = (e.clientY - r.top) / r.height;
      mouse.on = 1;
    };
    const onLeave = () => { mouse.on = 0; };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let last = start;
    let raf = 0;

    // 主题色向目标缓动(指数,τ≈0.12s → 约 0.4s 收敛),与 body 过渡观感一致。
    const easeColor = (cur: RGB, tgt: RGB, dt: number) => {
      const k = 1 - Math.exp(-dt / 0.12);
      for (let i = 0; i < 3; i++) cur[i] += (tgt[i] - cur[i]) * k;
    };

    const draw = (now: number) => {
      resize();
      const pr = paramsRef.current;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      easeColor(inkRef.current, inkTargetRef.current, dt);
      easeColor(paperRef.current, paperTargetRef.current, dt);
      const time = reduce ? 8 : (now - start) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uMouseOn, reduce ? 0 : mouse.on);
      gl.uniform1f(uSpeed, pr.speed);
      gl.uniform1f(uPixel, Math.max(1, pr.cell * dpr));
      gl.uniform1f(uBright, pr.brightness);
      gl.uniform1f(uContrast, pr.contrast);
      gl.uniform1f(uGlint, pr.glint);
      gl.uniform1f(uWarp, pr.warp);
      gl.uniform1f(uFlowBend, pr.flowBend);
      gl.uniform1f(uAngle, (pr.angle * Math.PI) / 180);
      gl.uniform1f(uCalmTop, Math.max(0, pr.calmTop * dpr));
      gl.uniform3fv(uInk, inkRef.current);
      gl.uniform3fv(uPaper, paperRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // 未显式传色时跟随站点主题 token,监听 data-theme 切换(日/夜)。设目标色,
    // 由 draw 逐帧缓动过渡。initial=true 时同时把当前色瞬置为目标(首帧不过渡);
    // reduced-motion 下无动画循环,切换时瞬切并手动补一帧。
    const syncTheme = (initial: boolean) => {
      const explicit = explicitRef.current;
      if (explicit.ink && explicit.paper) return;
      const c = themeColors();
      if (!c) return;
      if (!explicit.ink) {
        inkTargetRef.current = c.ink;
        if (initial || reduce) inkRef.current = [...c.ink];
      }
      if (!explicit.paper) {
        paperTargetRef.current = c.paper;
        if (initial || reduce) paperRef.current = [...c.paper];
      }
      if (!initial && reduce) draw(performance.now());
    };
    syncTheme(true);
    const themeObs = new MutationObserver(() => syncTheme(false));
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObs.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
```

### 7.2 首页集成 `HeroWater`(已从树删除,此处保留原文)

原 `src/components/home/hero-water.tsx`——全屏 fixed 背景、渲染在 `SmoothScroll`
层外、`-z-10` 沉底、仅首页启用:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { WaterDither } from "@/components/lab/water-dither";

export function HeroWater() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return (
    <WaterDither
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      speed={0.35}
      cell={2}
      brightness={0.7}
      contrast={1.35}
      glint={0.6}
      warp={0.8}
      flowBend={0.7}
      angle={0}
      calmTop={96}
    />
  );
}
```

挂载点在 `src/app/(site)/layout.tsx`,**必须在 `<SmoothScroll>` 之外**:

```tsx
return (
  <>
    {/* 主页全屏流水背景:fixed,必须留在 SmoothScroll 层外(transform 破坏 fixed) */}
    <HeroWater />
    <SmoothScroll>
      <Nav />
      <main>{children}</main>
      <Footer />
    </SmoothScroll>
    <Revealer />
    <ScrollIndicator />
  </>
);
```
