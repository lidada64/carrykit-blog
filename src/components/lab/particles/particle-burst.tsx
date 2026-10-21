"use client";

import { useEffect, useRef } from "react";

/**
 * ParticleBurst —— 可复用的「粒子爆炸 / 时间倒流」覆盖层(WebGL2 GL_POINTS)。
 *
 * 用法约定:**哑组件**,自己不建时间线 —— 只负责在给定 `progress`(0=成形, 1=四散)下把粒子画出来;
 * rAF / 交互 / 倒流全由父级驱动(改 progress 即可)。因每颗粒子的位置是 `progress` 的**纯函数**
 * (速度/角度在播种时一次性定死),progress 1→0 就精确沿原轨迹飞回 = 时间倒流,零轨迹存储。
 *
 * 播种:把 `draw(ctx,w,h)` 画出的**不透明**像素按 `gridStep` 网格采样 → 每个采样点一颗粒子的 home。
 * 每颗:随机角度(以「离中心的外向」为基,按 angleRandomness 掺随机)+ 随机力度 → 爆开时各飞各的。
 *
 * 1-bit 统一:点用蓝噪声(同 water 的 blue-noise-128)做屏幕空间阈值 → 也是墨/纸点,不显「贴一层」。
 * 未加载噪声前不画(和 water 一样等阈值图)。
 */

const NOISE_URL = "/water/blue-noise-128.png";

export interface ParticleBurstProps {
  /** 0 = 成形(粒子在 home), 1 = 完全四散(淡成星尘)。父级驱动。 */
  progress: number;
  /** 画「源形状」到离屏 canvas;不透明处 = 粒子。w/h 为 CSS 像素。 */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** 爆开原点(屏幕 UV 0..1),默认画面中心。 */
  centerUv?: readonly [number, number];
  /** 采样网格步长(CSS px);越大粒子越少越疏。默认 5。 */
  gridStep?: number;
  /** 落点在网格格内的随机偏移比例 0..1(0=严格网格, 1=满格乱放);打散行列对齐 → 有机不规整。默认 0.7。 */
  jitter?: number;
  /** 点直径(CSS px)。默认 2.6。 */
  dotSize?: number;
  /** 最大四散距离 = spread × min(宽,高)。默认 0.55。 */
  spread?: number;
  /** 下坠重力 = gravity × min(宽,高)(随 e² 增长)。默认 0.14。 */
  gravity?: number;
  /** 外向方向里掺入的随机比例 0..1(0=纯外向, 1=纯随机角度)。默认 0.55。 */
  angleRandomness?: number;
  /** 速度线强度:峰值线长 = 该颗散射距离 × streak(飞行途中拉成线段的最大长度占比)。默认 0.35。 */
  streak?: number;
  /** >0 时进入**静态线条模式**:每颗粒子画成一段沿其散射方向、长度=staticLen(CSS px)的定长线条,
   *  不随 progress 变(用于「线条组成的字体」保留变体 /lab/line-title)。默认 0=正常拉丝。 */
  staticLen?: number;
  /** 点颜色(0..1 RGB)。夜空上默认近纸白。 */
  color?: readonly [number, number, number];
  /** 整体溶解 0..1(默认 0=全显)。→1 时有效 alpha→0,蓝噪声阈值把粒子逐点溶掉到「几乎没有」
   *  (用于下滑转场「把天空粒子压暗遮住标题」;与 1-bit 蓝噪声抖动同源,不显「整层淡出」)。 */
  dim?: number;
  /** true = 爆开到最开时淡成星尘消失;false(默认) = **停在爆炸终点位置不消失**(回溯再沿原轨迹飞回)。 */
  fade?: boolean;
  /** true 时冻结在 progress=0(reduced-motion)。 */
  frozen?: boolean;
  /** 变化即强制重绘一帧(prev==cur 零拖影)。父级在动画停下时 +1 → 定格落定成实心圆点,不留残影。 */
  renderNonce?: number;
  className?: string;
  style?: React.CSSProperties;
}

/* 实例化菱形/纺锤(速度线拉丝):每颗粒子是一个两头尖的菱形。
 * 静止时 = 小菱形(四个尖角)→ 比圆点「尖」;爆开时沿运动方向纵向拉长成纺锤 = 速度线。
 * 线长由**速度线包络** env(progress) 驱动:成形(p=0)线长 0,launch 后迅速拉成线段,
 * 随减速渐渐收回圆点(p=1)。位置对 progress 是纯函数(节奏全交父级 open(time) 控)→ 倒放精确逆轨迹,
 * 而 env 也是 progress 的纯函数 → 倒流时同样拉出速度线,收尾自然定格成尖点(零残影,不再需要补画)。 */
const VERT_SRC = `#version 300 es
layout(location=0) in vec2 aHome;    // CSS px
layout(location=1) in vec2 aVel;     // CSS px @ progress=1(= 该颗的总散射位移)
layout(location=2) in vec3 aMisc;    // x=宽度(CSS px) y=grav(CSS px) z=(未用)
layout(location=3) in vec2 aCorner;  // along 0..1, side -1..1(非实例单位 quad)
uniform float uProgress;
uniform float uStreak;   // 速度线强度:峰值线长 = 该颗散射距离 × uStreak
uniform float uStaticLen; // >0 = 静态线条模式(每颗沿散射方向画定长线,不随 progress)
uniform vec2  uRes;      // CSS 宽高
uniform float uFade;
out float vAlpha;
out vec2  vPx;    // 沿轴 px(-halfW..travel+halfW) / 侧向 px
out float vLen;   // 段长(px,不含两端锥尖延伸)
out float vHalf;  // 半宽(px)
vec2 posAt(float p){
  return aHome + aVel * p + vec2(0.0, aMisc.y * p * p);  // 线性 + 轻微重力弧
}
vec2 velAt(float p){
  return aVel + vec2(0.0, 2.0 * aMisc.y * p);            // d posAt/dp = 瞬时运动方向
}
void main(){
  float pN = clamp(uProgress, 0.0, 1.0);
  vec2 a, b;
  if (uStaticLen > 0.0) {                       // 静态线条:以 home 为中心,沿散射方向画定长线
    vec2 vd = normalize(aVel + vec2(1e-4, 1e-4));
    a = aHome + vd * (uStaticLen * 0.5);
    b = aHome - vd * (uStaticLen * 0.5);
  } else {
    a = posAt(pN);                              // 当前帧位置 = 线段头(粒子本体)
    // 速度线包络:**两端对称**都平滑归 0 —— p=0(成形/归位)与 p=1(四散定格)都是点,
    // 增大了边缘的过渡区间(0.35),让收缩成点的时间变长,从而缩短线段保持最长状态的时间。
    float env = smoothstep(0.0, 0.35, pN) * smoothstep(0.0, 0.35, 1.0 - pN);
    float lenS = length(aVel) * uStreak * env;
    vec2 vd = normalize(velAt(pN) + vec2(1e-4, 1e-4));
    b = a - vd * lenS;                          // 线尾拖在运动后方 = motion blur
  }
  vec2 axis = a - b;
  float travel = length(axis);
  vec2 dir = travel > 1e-4 ? axis / travel : normalize(aVel + vec2(1e-4, 1e-4));
  vec2 perp = vec2(-dir.y, dir.x);
  float halfW = aMisc.x * 0.5;                          // CSS px(half 是 GLSL 保留字,勿用)
  float alongPx = mix(-halfW, travel + halfW, aCorner.x); // 两端各延 halfW = 菱形锥尖
  float sidePx = aCorner.y * halfW;
  vec2 posPx = b + dir * alongPx + perp * sidePx;     // 尾在后方位置 b
  vec2 clip = vec2(posPx.x / uRes.x * 2.0 - 1.0, 1.0 - posPx.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vPx = vec2(alongPx, sidePx);
  vLen = travel;
  vHalf = halfW;
  vAlpha = 1.0 - uFade * smoothstep(0.5, 1.0, pN);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in float vAlpha;
in vec2  vPx;
in float vLen;
in float vHalf;
uniform sampler2D uNoise;
uniform vec2  uNoiseSize;
uniform vec3  uColor;
uniform float uDim;   // 整体溶解 0..1:有效 alpha 乘 (1-uDim),→1 时全部溶掉(几乎没有粒子)
out vec4 o;
void main(){
  // 菱形/纺锤场:沿轴中心 vLen*0.5,半长 = vLen*0.5+vHalf;|x'|/halfLen + |y|/halfW <= 1 为内部。
  // 静止=小菱形(四尖角,比圆点「尖」);拉丝=两头尖的纺锤(速度线)。
  float halfLen = vLen * 0.5 + vHalf;
  float ax = abs(vPx.x - vLen * 0.5);
  float dm = ax / max(halfLen, 1e-4) + abs(vPx.y) / max(vHalf, 1e-4);
  if (dm > 1.0) discard;                              // 菱形外
  float n = texture(uNoise, gl_FragCoord.xy / uNoiseSize).r;
  // 实心核 + 外缘按蓝噪声抖动 = 1-bit 颗粒边;尖角自然碎成墨点,更「尖」。核心恒不 discard。
  float rim = smoothstep(0.7, 1.0, dm);
  if (rim > 1.0 - n) discard;
  float aeff = vAlpha * (1.0 - clamp(uDim, 0.0, 1.0)); // fade 淡出 + dim 溶解叠加
  if (aeff < n) discard;                              // aeff=1 时不 discard;→0 时按蓝噪声逐点溶掉
  o = vec4(uColor, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("createShader failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? "compile failed");
  }
  return s;
}

interface GLState {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  quadBuf: WebGLBuffer;
  noiseTex: WebGLTexture | null;
  noiseSize: [number, number];
  count: number;
  cssW: number;
  cssH: number;
  dpr: number;
  render?: () => void;
  u: {
    progress: WebGLUniformLocation | null;
    streak: WebGLUniformLocation | null;
    staticLen: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    fade: WebGLUniformLocation | null;
    noise: WebGLUniformLocation | null;
    noiseSize: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
    dim: WebGLUniformLocation | null;
  };
}

export function ParticleBurst({
  progress,
  draw,
  centerUv = [0.5, 0.5],
  gridStep = 5,
  jitter = 0.7,
  dotSize = 2.6,
  spread = 0.55,
  gravity = 0.14,
  angleRandomness = 0.55,
  streak = 0.35,
  staticLen = 0,
  color = [0.96, 0.96, 0.93],
  dim = 0,
  fade = false,
  frozen = false,
  renderNonce = 0,
  className,
  style,
}: ParticleBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GLState | null>(null);
  const progressRef = useRef(progress);
  // 逐帧变化的参数用 ref 让 draw/render 闭包读最新值(避免重建 GL)。commit 后同步(不能 render 中写 ref)。
  const propsRef = useRef({ draw, centerUv, gridStep, jitter, dotSize, spread, gravity, angleRandomness, streak, staticLen, color, dim, fade });
  useEffect(() => {
    propsRef.current = { draw, centerUv, gridStep, jitter, dotSize, spread, gravity, angleRandomness, streak, staticLen, color, dim, fade };
  });

  // ── 建 GL(一次)+ 载噪声 + ResizeObserver 重新播种。 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    let disposed = false;
    let prog: WebGLProgram | null = null;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      prog = gl.createProgram();
      if (!prog) throw new Error("createProgram failed");
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
      }
    } catch {
      return; // 编译/链接失败:静默(覆盖层直接不显示,不影响下面水面)
    }

    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    const quadBuf = gl.createBuffer();
    if (!vao || !buf || !quadBuf) return;

    const st: GLState = {
      gl,
      prog,
      vao,
      buf,
      quadBuf,
      noiseTex: null,
      noiseSize: [128, 128],
      count: 0,
      cssW: 0,
      cssH: 0,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      u: {
        progress: gl.getUniformLocation(prog, "uProgress"),
        streak: gl.getUniformLocation(prog, "uStreak"),
        staticLen: gl.getUniformLocation(prog, "uStaticLen"),
        res: gl.getUniformLocation(prog, "uRes"),
        fade: gl.getUniformLocation(prog, "uFade"),
        noise: gl.getUniformLocation(prog, "uNoise"),
        noiseSize: gl.getUniformLocation(prog, "uNoiseSize"),
        color: gl.getUniformLocation(prog, "uColor"),
        dim: gl.getUniformLocation(prog, "uDim"),
      },
    };
    stateRef.current = st;

    gl.bindVertexArray(vao);
    // 单位 quad 角点(非实例):along 0..1 / side -1..1,两个三角形。
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, -1, 1, -1, 1, 1,
      0, -1, 1, 1, 0, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 0);
    // 每颗粒子属性(实例):aHome(2) aVel(2) aMisc(3) = 7 floats/颗。
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 4 * 4);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    // 噪声(异步;载好前不画)。
    const img = new Image();
    img.onload = () => {
      if (disposed) return;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      st.noiseTex = tex;
      st.noiseSize = [img.width, img.height];
      render();
    };
    img.src = NOISE_URL;

    // ── 播种:把 draw() 画到离屏 canvas,按网格采样不透明像素 → 粒子属性。 ──
    const seed = (): void => {
      const cssW = Math.max(1, Math.round(canvas.clientWidth || window.innerWidth));
      const cssH = Math.max(1, Math.round(canvas.clientHeight || window.innerHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      st.cssW = cssW;
      st.cssH = cssH;
      st.dpr = dpr;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      const off = document.createElement("canvas");
      off.width = cssW;
      off.height = cssH;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const p = propsRef.current;
      p.draw(ctx, cssW, cssH);
      const data = ctx.getImageData(0, 0, cssW, cssH).data;

      const step = Math.max(2, Math.round(p.gridStep));
      const jit = Math.max(0, Math.min(1, p.jitter)) * step; // 格内最大随机偏移(px)
      const minDim = Math.min(cssW, cssH);
      const cx = p.centerUv[0] * cssW;
      const cy = p.centerUv[1] * cssH;
      const arr: number[] = [];
      for (let y = Math.floor(step / 2); y < cssH; y += step) {
        for (let x = Math.floor(step / 2); x < cssW; x += step) {
          // 采样判定用网格点 alpha;落点在格内随机偏移 → 打散行列对齐,自然不规整。
          const a = data[(y * cssW + x) * 4 + 3];
          if (a < 40) continue;
          const hx = x + (Math.random() - 0.5) * jit;
          const hy = y + (Math.random() - 0.5) * jit;
          // 外向单位向量(以抖动后落点为准) + 随机角度掺入。
          const ox = hx - cx;
          const oy = hy - cy;
          const olen = Math.hypot(ox, oy) || 1;
          const outX = ox / olen;
          const outY = oy / olen;
          const rand = Math.random() * Math.PI * 2;
          const rx = Math.cos(rand);
          const ry = Math.sin(rand);
          const mixk = p.angleRandomness;
          let dx = outX * (1 - mixk) + rx * mixk;
          let dy = outY * (1 - mixk) + ry * mixk;
          const dlen = Math.hypot(dx, dy) || 1;
          dx /= dlen;
          dy /= dlen;
          const force = (0.45 + Math.random() * 0.85) * p.spread * minDim; // 随机力度
          const size = p.dotSize * (0.55 + Math.random() * 1.05); // 大小更参差
          const grav = p.gravity * minDim * (0.5 + Math.random());
          arr.push(hx, hy, dx * force, dy * force, size, grav, 0);
        }
      }
      st.count = arr.length / 7;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      render();
    };

    const render = (): void => {
      if (disposed || !st.noiseTex || st.count === 0) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, st.noiseTex);
      if (st.u.noise) gl.uniform1i(st.u.noise, 0);
      if (st.u.noiseSize) gl.uniform2f(st.u.noiseSize, st.noiseSize[0], st.noiseSize[1]);
      if (st.u.res) gl.uniform2f(st.u.res, st.cssW, st.cssH);
      if (st.u.fade) gl.uniform1f(st.u.fade, propsRef.current.fade ? 1 : 0);
      if (st.u.streak) gl.uniform1f(st.u.streak, propsRef.current.streak);
      if (st.u.staticLen) gl.uniform1f(st.u.staticLen, propsRef.current.staticLen);
      const c = propsRef.current.color;
      if (st.u.color) gl.uniform3f(st.u.color, c[0], c[1], c[2]);
      if (st.u.dim) gl.uniform1f(st.u.dim, propsRef.current.dim);
      if (st.u.progress) gl.uniform1f(st.u.progress, progressRef.current);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, st.count);
      gl.bindVertexArray(null);
    };
    st.render = render;

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) void fonts.ready.then(() => !disposed && seed());
    else seed();

    const ro = new ResizeObserver(() => seed());
    ro.observe(canvas);

    return () => {
      disposed = true;
      ro.disconnect();
      stateRef.current = null;
      gl.deleteBuffer(buf);
      gl.deleteBuffer(quadBuf);
      gl.deleteVertexArray(vao);
      if (st.noiseTex) gl.deleteTexture(st.noiseTex);
      if (prog) gl.deleteProgram(prog);
    };
  }, []);

  // progress / dim / nonce 变化 → 只重画,不重建。nonce 变化时 prev==cur → 零拖影落定成实心圆点。
  // dim 走 propsRef(上面的 commit-effect 先于此 effect 同步),这里入依赖只为触发一次重画。
  useEffect(() => {
    progressRef.current = frozen ? 0 : progress;
    stateRef.current?.render?.();
  }, [progress, dim, frozen, renderNonce]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
}
