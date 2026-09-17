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
  /** 拉丝倍率:每帧位移 × streak = 线条长度。越大速度线越长。默认 2.5。 */
  streak?: number;
  /** >0 时进入**静态线条模式**:每颗粒子画成一段沿其散射方向、长度=staticLen(CSS px)的定长线条,
   *  不随 progress 变(用于「线条组成的字体」保留变体 /lab/line-title)。默认 0=正常拉丝。 */
  staticLen?: number;
  /** 点颜色(0..1 RGB)。夜空上默认近纸白。 */
  color?: readonly [number, number, number];
  /** true = 爆开到最开时淡成星尘消失;false(默认) = **停在爆炸终点位置不消失**(回溯再沿原轨迹飞回)。 */
  fade?: boolean;
  /** true 时冻结在 progress=0(reduced-motion)。 */
  frozen?: boolean;
  /** 变化即强制重绘一帧(prev==cur 零拖影)。父级在动画停下时 +1 → 定格落定成实心圆点,不留残影。 */
  renderNonce?: number;
  className?: string;
  style?: React.CSSProperties;
}

/* 实例化胶囊(motion blur 拉丝):每颗粒子画一段从「上一帧位置」到「当前帧位置」的胶囊。
 * 长度 = 每帧真实位移 × streak → 快则拖成线条、慢则短、静止≈0 退化成锋利圆点。位置对 progress **线性**
 * (节奏全交父级 open(time) 控);仍是 progress 纯函数 → 倒放精确逆轨迹。 */
const VERT_SRC = `#version 300 es
layout(location=0) in vec2 aHome;    // CSS px
layout(location=1) in vec2 aVel;     // CSS px @ progress=1
layout(location=2) in vec3 aMisc;    // x=宽度(CSS px) y=grav(CSS px) z=(未用)
layout(location=3) in vec2 aCorner;  // along 0..1, side -1..1(非实例单位 quad)
uniform float uProgress;
uniform float uProgressPrev;
uniform float uStreak;   // 拉丝倍率(放大每帧位移 → 速度感)
uniform float uStaticLen; // >0 = 静态线条模式(每颗沿散射方向画定长线,不随 progress)
uniform vec2  uRes;      // CSS 宽高
uniform float uFade;
out float vAlpha;
out vec2  vPx;    // 沿轴 px(0..vLen) / 侧向 px
out float vLen;   // 用到的段长(px)
out float vHalf;  // 半宽(px)
vec2 posAt(float p){
  return aHome + aVel * p + vec2(0.0, aMisc.y * p * p);  // 线性 + 轻微重力弧
}
void main(){
  float pN = clamp(uProgress, 0.0, 1.0);
  float pP = clamp(uProgressPrev, 0.0, 1.0);
  vec2 a, b;
  if (uStaticLen > 0.0) {                       // 静态线条:以 home 为中心,沿散射方向画定长线
    vec2 vd = normalize(aVel + vec2(1e-4, 1e-4));
    a = aHome + vd * (uStaticLen * 0.5);
    b = aHome - vd * (uStaticLen * 0.5);
  } else {
    a = posAt(pN);          // 当前帧
    b = posAt(pP);          // 上一帧
  }
  vec2 axis = a - b;
  float travel = length(axis);
  float lenUsed = travel * uStreak;
  vec2 dir = travel > 1e-4 ? axis / travel : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float halfW = aMisc.x * 0.5;                          // CSS px(half 是 GLSL 保留字,勿用)
  float alongPx = mix(-halfW, lenUsed + halfW, aCorner.x); // 两端各延 halfW = 圆帽
  float sidePx = aCorner.y * halfW;
  vec2 posPx = b + dir * alongPx + perp * sidePx;     // 尾在上一帧位置 b
  vec2 clip = vec2(posPx.x / uRes.x * 2.0 - 1.0, 1.0 - posPx.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vPx = vec2(alongPx, sidePx);
  vLen = lenUsed;
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
out vec4 o;
void main(){
  float cx = clamp(vPx.x, 0.0, vLen);                 // 中心线最近点
  float d = length(vec2(vPx.x - cx, vPx.y));          // 到胶囊中心线距离
  if (d > vHalf) discard;                             // 胶囊外
  float n = texture(uNoise, gl_FragCoord.xy / uNoiseSize).r;
  // **实心核 + 只抖最外 ~1px 缘** → 每颗都是实心亮点,不发灰(修 dim bug);核心恒不 discard。
  float rim = smoothstep(vHalf - 1.0, vHalf, d);
  if (rim > 1.0 - n) discard;                         // 只在外缘按蓝噪声抖动 = 1-bit 锋利边
  if (vAlpha < n) discard;                            // fade 淡出(vAlpha=1 时不 discard)
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
    progressPrev: WebGLUniformLocation | null;
    streak: WebGLUniformLocation | null;
    staticLen: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    fade: WebGLUniformLocation | null;
    noise: WebGLUniformLocation | null;
    noiseSize: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
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
  streak = 2.5,
  staticLen = 0,
  color = [0.96, 0.96, 0.93],
  fade = false,
  frozen = false,
  renderNonce = 0,
  className,
  style,
}: ParticleBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GLState | null>(null);
  const progressRef = useRef(progress);
  const lastProgressRef = useRef(progress); // 上一帧 progress → 拉丝(motion blur)
  const settleRafRef = useRef(0); // 运动停止后补画一帧 prev==cur(零拖影)→ 定格回锋利圆点,不留残影线条
  // 逐帧变化的参数用 ref 让 draw/render 闭包读最新值(避免重建 GL)。commit 后同步(不能 render 中写 ref)。
  const propsRef = useRef({ draw, centerUv, gridStep, jitter, dotSize, spread, gravity, angleRandomness, streak, staticLen, color, fade });
  useEffect(() => {
    propsRef.current = { draw, centerUv, gridStep, jitter, dotSize, spread, gravity, angleRandomness, streak, staticLen, color, fade };
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
        progressPrev: gl.getUniformLocation(prog, "uProgressPrev"),
        streak: gl.getUniformLocation(prog, "uStreak"),
        staticLen: gl.getUniformLocation(prog, "uStaticLen"),
        res: gl.getUniformLocation(prog, "uRes"),
        fade: gl.getUniformLocation(prog, "uFade"),
        noise: gl.getUniformLocation(prog, "uNoise"),
        noiseSize: gl.getUniformLocation(prog, "uNoiseSize"),
        color: gl.getUniformLocation(prog, "uColor"),
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
      if (settleRafRef.current) {
        cancelAnimationFrame(settleRafRef.current);
        settleRafRef.current = 0;
      }
      if (disposed || !st.noiseTex || st.count === 0) return;
      const prevAtStart = lastProgressRef.current;
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
      if (st.u.progress) gl.uniform1f(st.u.progress, progressRef.current);
      if (st.u.progressPrev) gl.uniform1f(st.u.progressPrev, prevAtStart);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, st.count);
      gl.bindVertexArray(null);
      lastProgressRef.current = progressRef.current; // 记录本帧 → 下帧拉丝
      // 本帧有位移(拉丝)→ 排一帧「补画」:若之后没有新 render(运动已停),它会以 prev==cur 零拖影重画,
      // 把定格状态还原成锋利圆点(修 bug:倒流骤停后残留线条)。有新 render 会先 cancel 掉它,动画中不闪。
      if (progressRef.current !== prevAtStart && propsRef.current.staticLen <= 0) {
        settleRafRef.current = requestAnimationFrame(() => {
          settleRafRef.current = 0;
          render();
        });
      }
    };
    st.render = render;

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) void fonts.ready.then(() => !disposed && seed());
    else seed();

    const ro = new ResizeObserver(() => seed());
    ro.observe(canvas);

    return () => {
      disposed = true;
      if (settleRafRef.current) cancelAnimationFrame(settleRafRef.current);
      ro.disconnect();
      stateRef.current = null;
      gl.deleteBuffer(buf);
      gl.deleteBuffer(quadBuf);
      gl.deleteVertexArray(vao);
      if (st.noiseTex) gl.deleteTexture(st.noiseTex);
      if (prog) gl.deleteProgram(prog);
    };
  }, []);

  // progress / nonce 变化 → 只重画,不重建。nonce 变化时 prev==cur → 零拖影落定成实心圆点。
  useEffect(() => {
    progressRef.current = frozen ? 0 : progress;
    stateRef.current?.render?.();
  }, [progress, frozen, renderNonce]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
}
