"use client";

import { useEffect, useRef } from "react";

/**
 * CampfireDither —— 独立于背景的 1-bit 抖动篝火(shader 原型 · 探索用)。
 *
 * 透明画布上单独渲染一簇火焰:噪声扰动的水滴形火体 + 上升湍流,Bayer 抖动成
 * 亮色墨点,火外全透明——所以它是**独立物件**,叠在水面背景之上、放页面最下面,
 * 不再烘进水 shader。将来可换成 Blender 预渲染序列(docs/blender-assets.md)。
 */
export interface CampfireDitherProps {
  /** 抖动网点单元(CSS px) */
  cell?: number;
  /** 火焰整体强度 0..1(越大越亮/越高) */
  intensity?: number;
  /** 亮色(火),归一化 rgb 0..1;默认贴站点 --background #fafaf8 */
  paper?: [number, number, number];
  className?: string;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPixel;
uniform float uIntensity;
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

void main(){
  vec2 frag = gl_FragCoord.xy;            // y 从底算,火向上升
  vec2 uv = frag / uRes;
  float t = uTime;

  // 火体:随高度收细的水滴形 + 左右摇曳。收窄 → 火苗更细、更立。
  float sway = 0.07 * sin(uv.y * 7.0 + t * 3.0) * uv.y;
  float dx = abs(uv.x - 0.5 + sway);
  float width = 0.17 * (1.0 - uv.y) + 0.025;
  float body = 1.0 - smoothstep(0.0, width, dx);
  body *= smoothstep(1.05, 0.06, uv.y);   // 顶部收细

  // 上升湍流:高频些更"细";用噪声主导火形,基底压低 → 曝光低、火舌清楚
  float n = fbm(vec2(uv.x * 7.0, uv.y * 12.0 - t * 3.0));
  float f = body * (0.12 + 1.15 * n) - uv.y * 0.14;
  f = clamp(f * (0.35 + 0.9 * uIntensity), 0.0, 1.0);
  f = smoothstep(0.12, 0.62, f);          // 掐掉暗雾、抠出实火 → 边缘更利落

  float th = bayer8(floor(frag / uPixel));
  float bw = step(th, f);
  gl_FragColor = vec4(uPaper, bw);          // 火外 alpha=0 → 透明
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`campfire shader compile failed: ${log}`);
  }
  return sh;
}

export function CampfireDither({ cell = 3, intensity = 0.5, paper, className }: CampfireDitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfgRef = useRef({ cell, intensity });
  cfgRef.current = { cell, intensity };
  const paperRef = useRef(paper ?? ([0.98, 0.98, 0.972] as [number, number, number]));
  paperRef.current = paper ?? paperRef.current;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`campfire link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("uRes"), uTime = u("uTime"), uPixel = u("uPixel"),
      uIntensity = u("uIntensity"), uPaper = u("uPaper");

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

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      resize();
      const c = cfgRef.current;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduce ? 6 : (now - start) / 1000);
      gl.uniform1f(uPixel, Math.max(1, c.cell * dpr));
      gl.uniform1f(uIntensity, c.intensity);
      gl.uniform3fv(uPaper, paperRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
