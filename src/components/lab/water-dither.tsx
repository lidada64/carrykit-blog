"use client";

import { useEffect, useRef } from "react";

/**
 * WaterDither —— 奥伯拉丁风格 1-bit 抖动「流水」(shader 原型 · 探索用)。
 *
 * 纯裸 WebGL(零依赖)。水的"流动质感"靠三样:①定向平流 + 域扭曲(coords
 * 被另一层 fbm 扭动 → 液体涡流);②各向异性(纵向压缩)拉出水平流纹;
 * ③从高度场取法线做**镜面高光 + 焦散条纹**——水读作水的关键是波峰反光的闪烁。
 * 最后 Bayer 8×8 有序抖动量化成纯黑/白(站点 token 色)。
 *
 * 篝火已拆出(见 campfire-dither.tsx),此组件只负责水面背景。
 * 抖动按设备物理像素采样,retina 不糊;reduced-motion 定格静态帧(§5)。
 */
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
