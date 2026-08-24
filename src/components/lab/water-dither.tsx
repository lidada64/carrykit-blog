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
  // 缓慢域扭曲:让波脊弯曲、成涡,而不是笔直横线
  vec2 warp = vec2(fbm(q * 1.6 + vec2(t * 0.12, 0.0)),
                   fbm(q * 1.6 + vec2(0.0, t * 0.10) + 5.2));
  q += 0.20 * warp;
  // 横向流纹:sine 波脊沿 y 排布,随时间向前推(定向平流)
  float flow = fbm(q * vec2(1.1, 3.6) + vec2(t * 0.45, t * 0.12));
  float h  = sin((q.y * 8.5 + flow * 6.0) - t * 1.05);
  h += 0.5 * sin((q.y * 16.0 + flow * 4.0) + t * 0.70);
  // 鼠标涟漪
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
  float lum = 0.10 + 0.44 * band + uGlint * spec * 0.5;
  lum = (lum - 0.5) * uContrast + 0.5 + (uBright - 1.0);
  lum = clamp(lum, 0.0, 1.0);

  float th = bayer8(floor(frag / uPixel));
  float bw = step(th, lum);
  gl_FragColor = vec4(mix(uInk, uPaper, bw), 1.0);
}
`;

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
  const inkRef = useRef(ink ?? ([0.102, 0.102, 0.102] as [number, number, number]));
  const paperRef = useRef(paper ?? ([0.98, 0.98, 0.972] as [number, number, number]));
  inkRef.current = ink ?? inkRef.current;
  paperRef.current = paper ?? paperRef.current;

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
      uInk = u("uInk"), uPaper = u("uPaper");

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
    let raf = 0;

    const draw = (now: number) => {
      resize();
      const pr = paramsRef.current;
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
      gl.uniform3fv(uInk, inkRef.current);
      gl.uniform3fv(uPaper, paperRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
