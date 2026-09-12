/**
 * ripple.ts —— W6 涟漪求解器(CPU/WebGL 侧)
 *
 * 256×256 **RG16F ping-pong** 上跑显式波动方程,纹理钉在**世界空间**的一块矩形上
 * (`contract.ts` 的 `RippleField`:`tex` / `worldMin` / `worldSize`)。
 * 相机高度、俯角一变,水面 pass 用 `waterSurfacePoint` 解出来的世界坐标 `p` 跟着变,
 * 而涟漪在纹理里的位置一动不动 —— **世界锚定**就是这么来的,不需要任何补偿项。
 * 改造前 `water-dither.tsx` 的涟漪用的是屏幕 uv,相机一动整片跟着滑,就是差这一层。
 *
 * ── 这个文件为什么一个 `import` 都没有 ──────────────────────────────────────
 * `scripts/water-harness.mjs`(黄金帧)与 `scripts/gen-water-preview.mjs`(预览台)
 * 都是**纯 node** 跑的,而 node 的类型擦除**不做无扩展名解析**:
 * `import { X } from "./contract"` 直接 ERR_MODULE_NOT_FOUND。
 * orb-light.ts 文件头写的是同一条约束。
 *
 * 两个后果,都是有意的:
 *  · 求解 pass 的着色器源码由**调用方**从 `ripple.glsl.ts` 取来传进来
 *    (`createRippleSolver(gl, SOLVE_SRC, opts)`),本文件不 import 它;
 *  · 类里**不引用任何模块作用域的辅助函数** —— 渲染台与预览台是靠
 *    `RippleSolver.toString()` 把源码原样内联进页面的(和 orb-light.ts
 *    那几个函数同一招),引用了外部符号就会在页面里 ReferenceError。
 *    于是三处(浏览器组件 / 黄金帧 / 预览台)跑的是**同一份求解代码**。
 *
 * ── CFL ─────────────────────────────────────────────────────────────────────
 * 二维显式格式的稳定条件是 `C = c·Δt/Δx ≤ 1/√2 ≈ 0.707`,本模块取 **0.7**。
 * 断言写在代码里,而且分成两条路,理由不同:
 *  · `step(dt)`  —— **夹住 dt**。运行时路径绝不许抛:标签页切回来时 rAF 的
 *    dt 可以是好几秒,那时抛异常等于整块画布挂掉。夹住之后涟漪只是"慢放",
 *    并把次数记进 `clampedSteps`,调用方想知道随时能读。
 *  · `stepFixed(dt)` —— **越界直接抛**。黄金帧协议那条路上,悄悄夹 dt 会让
 *    `--ripple-dt` 与实际步长不一致,复现出来的帧对不上而且没人知道;
 *    宁可红着脸失败。
 */
import type { RippleField } from "./contract";

/** 求解纹理边长。256² RG16F = 256 KB,一张。 */
export const RIPPLE_TEX_SIZE = 256;

/**
 * `uRippleImpulses[]` 的长度。**必须与 ripple.glsl.ts 的同名常量一致** ——
 * 那边是 GLSL 数组长度,这边是打包的 Float32Array 长度,对不上时 WebGL
 * **不报错**,只是默默少写几个冲击(docs §11 坑 7 那一类沉默失效)。
 * `golden/w3/build.ts` 里有一条断言防这个。
 */
export const RIPPLE_IMPULSE_SLOTS = 8;

/** 二维显式波动方程的库朗数上界。理论值 1/√2 ≈ 0.707,留一点余量。 */
export const RIPPLE_CFL_MAX = 0.7;

/** 任务书 §3.1 的默认冲击:0.4 mm 振幅 / 0.06 世界单位半径(悬停);点击用 2 mm。 */
export const RIPPLE_HOVER_STRENGTH = 0.0004;
export const RIPPLE_CLICK_STRENGTH = 0.002;
export const RIPPLE_DEFAULT_RADIUS = 0.06;

export interface RippleSolverOptions {
  /** 纹理覆盖的世界区域左下角(场坐标,米) */
  worldMin: [number, number];
  /** 覆盖边长(米) */
  worldSize: number;
  /** 波速 c(m/s)。10 cm 的重力-毛细波实测 ≈ 0.40;米级涌浪 1.8~2.5 */
  waveSpeed: number;
  /** 每步阻尼,0.995~0.999 */
  damping: number;
  /** 吸收层宽度(纹素)。0 = 只留最外一圈 Dirichlet(会整环反射) */
  spongeTexels: number;
  /** 吸收层边缘处每步吃掉的比例 */
  spongeStrength: number;
  /** 纹理边长,默认 RIPPLE_TEX_SIZE */
  size: number;
}

/** 单次冲击的诊断量,`probe()` 返回。全部以**纹素**与**米**两套单位给出。 */
export interface RippleProbe {
  /** 峰值 |h| 所在的半径(纹素 / 米)。这是**环峰**,不是波前 —— 见 edgeTexels */
  frontTexels: number;
  frontMeters: number;
  /**
   * **波前**:最外一个 max|h| 仍 ≥ 10% 峰值的半径环。
   *
   * 「恒速扩散」要量的是这个,不是环峰。环峰会被两件事带偏:① 初始高斯还没
   * 分裂成内外两支时,峰一直钉在圆心;② 内支收敛回圆心再反弹,argmax 会
   * 在圆心与环之间来回跳(实测 Δ半径 6/5/15/5 纹素,完全不像匀速)。
   * d'Alembert 解的**前沿**是干净的:r > c·t + 3σ 之外恒为 0,所以前沿以 c 走。
   */
  edgeTexels: number;
  edgeMeters: number;
  /** 波前环的半高全宽(纹素) */
  ringWidthTexels: number;
  /** 全场 max|h|(米) */
  peakAbs: number;
  /** 全场 RMS(米) */
  rms: number;
  /** 非有限值的个数。>0 = 数值炸了 */
  nanCount: number;
}

/**
 * 显式波动方程求解器。**拿不到 `EXT_color_buffer_float` 时不要 new 它** ——
 * 走 `createRippleSolver()`,那里会返回 `null`(优雅降级成"没有涟漪")。
 */
export class RippleSolver {
  gl: WebGL2RenderingContext;
  size: number;
  worldMin: [number, number];
  worldSize: number;
  waveSpeed: number;
  damping: number;
  spongeTexels: number;
  spongeStrength: number;

  /** ping-pong。`cur` 指向**持有最新状态**的那一张 */
  tex: WebGLTexture[];
  fbo: WebGLFramebuffer[];
  cur: number;

  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;

  /** 排队等下一步注入的冲击,每项 4 个数:uvx, uvy, 1/半径_uv, 强度 */
  pending: number[];
  /** 每步都要传的 vec4 数组,复用同一块内存 */
  impulseBuf: Float32Array;

  /** `prefers-reduced-motion`:定格 —— 不再步进,已有的涟漪原样留着 */
  frozen: boolean;

  steps: number;
  clampedSteps: number;
  simTime: number;

  constructor(gl: WebGL2RenderingContext, solveSrc: string, options: RippleSolverOptions) {
    this.gl = gl;
    this.size = options.size;
    this.worldMin = [options.worldMin[0], options.worldMin[1]];
    this.worldSize = options.worldSize;
    this.waveSpeed = options.waveSpeed;
    this.damping = options.damping;
    this.spongeTexels = options.spongeTexels;
    this.spongeStrength = options.spongeStrength;
    this.cur = 0;
    this.pending = [];
    this.impulseBuf = new Float32Array(RIPPLE_IMPULSE_SLOTS * 4);
    this.frozen = false;
    this.steps = 0;
    this.clampedSteps = 0;
    this.simTime = 0;

    const n = this.size;
    const zero = new Float32Array(n * n * 2);
    this.tex = [];
    this.fbo = [];
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture();
      if (!t) throw new Error("ripple: createTexture 失败");
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, n, n, 0, gl.RG, gl.FLOAT, zero);
      /* LINEAR:16 位浮点在 ES3 核心里就是可滤波的(32F 才需要 OES_texture_float_linear)。
       * 双线性同时也是消费端的第一道抗锯齿。CLAMP_TO_EDGE 只是兜底 ——
       * 消费端 `waterRipple` 在 uv 出界时直接 return 0,根本走不到 wrap。 */
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer();
      if (!f) throw new Error("ripple: createFramebuffer 失败");
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("ripple: RG16F FBO 不完整");
      }
      this.tex.push(t);
      this.fbo.push(f);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const vs =
      "#version 300 es\n" +
      "void main(){ vec2 q = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);" +
      " gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0); }";
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type);
      if (!s) throw new Error("ripple: createShader 失败");
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error("ripple 求解着色器编译失败: " + String(gl.getShaderInfoLog(s)));
      }
      return s;
    };
    const p = gl.createProgram();
    if (!p) throw new Error("ripple: createProgram 失败");
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, solveSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("ripple 求解程序链接失败: " + String(gl.getProgramInfoLog(p)));
    }
    this.prog = p;
    this.loc = {};
    for (const k of [
      "uRippleState",
      "uRippleTexSize",
      "uRippleC2",
      "uRippleDamping",
      "uRippleSponge",
      "uRippleSpongeK",
      "uRippleImpulses",
    ]) {
      this.loc[k] = gl.getUniformLocation(p, k);
    }
  }

  /** 一个纹素的世界尺度 Δx(米) */
  texelSize(): number {
    return this.worldSize / this.size;
  }

  /** 当前波速下 CFL 允许的最大步长(秒) */
  maxDt(): number {
    return (RIPPLE_CFL_MAX * this.texelSize()) / Math.max(this.waveSpeed, 1e-6);
  }

  /** 库朗数 C = c·Δt/Δx */
  courant(dt: number): number {
    return (this.waveSpeed * dt) / this.texelSize();
  }

  /**
   * 往世界坐标 `worldPos` 丢一个冲击。
   * `strength` = 峰值位移(米,默认 0.4 mm);`radius` = 高斯的 e 折半径(米)。
   * 区域外的冲击直接丢弃(不是夹到边上 —— 那会在边界堆出一个假源)。
   * 一步最多注入 `RIPPLE_IMPULSE_SLOTS` 个,多的留到下一步。
   */
  injectImpulse(
    worldPos: [number, number],
    strength: number = RIPPLE_HOVER_STRENGTH,
    radius: number = RIPPLE_DEFAULT_RADIUS,
  ): boolean {
    const u = (worldPos[0] - this.worldMin[0]) / this.worldSize;
    const v = (worldPos[1] - this.worldMin[1]) / this.worldSize;
    if (u < 0 || u > 1 || v < 0 || v > 1 || strength === 0) return false;
    const rUv = Math.max(radius, this.texelSize()) / this.worldSize;
    this.pending.push(u, v, 1 / rUv, strength);
    return true;
  }

  /**
   * 运行时步进:**dt 越界时夹住**,并记进 `clampedSteps`。
   * `prefers-reduced-motion` 下 `frozen = true`,这里直接返回(涟漪定格,不清零)。
   */
  step(dt: number): void {
    if (this.frozen) return;
    const cap = this.maxDt();
    const used = dt > cap ? cap : dt;
    if (used < dt) this.clampedSteps++;
    this.run(used);
  }

  /**
   * 黄金帧步进:**dt 越界直接抛**。确定性路径上不许有悄悄的夹取。
   * 定格开关在这里**不生效** —— 黄金帧要的是"跑满 N 步",不是"看用户的系统设置"。
   */
  stepFixed(dt: number): void {
    const c = this.courant(dt);
    if (!(c <= RIPPLE_CFL_MAX)) {
      throw new RangeError(
        "ripple CFL 越界: C = c·Δt/Δx = " +
          c.toFixed(4) +
          " > " +
          RIPPLE_CFL_MAX +
          "(c=" +
          this.waveSpeed +
          " m/s, Δt=" +
          dt +
          " s, Δx=" +
          this.texelSize().toFixed(5) +
          " m)。把 dt 压到 " +
          this.maxDt().toFixed(5) +
          " s 以下,或者降波速 / 缩小覆盖区域。",
      );
    }
    this.run(dt);
  }

  /** 真正跑一步。两条 step 都收敛到这里,保证格式只有一份。 */
  run(dt: number): void {
    const gl = this.gl;
    const c = this.courant(dt);
    const src = this.cur;
    const dst = 1 - this.cur;

    this.impulseBuf.fill(0);
    const take = Math.min(this.pending.length, RIPPLE_IMPULSE_SLOTS * 4);
    for (let i = 0; i < take; i++) this.impulseBuf[i] = this.pending[i];
    this.pending = this.pending.slice(take);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[dst]);
    gl.viewport(0, 0, this.size, this.size);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[src]);
    if (this.loc.uRippleState) gl.uniform1i(this.loc.uRippleState, 0);
    if (this.loc.uRippleTexSize) gl.uniform2f(this.loc.uRippleTexSize, this.size, this.size);
    if (this.loc.uRippleC2) gl.uniform1f(this.loc.uRippleC2, c * c);
    if (this.loc.uRippleDamping) gl.uniform1f(this.loc.uRippleDamping, this.damping);
    if (this.loc.uRippleSponge) gl.uniform1f(this.loc.uRippleSponge, this.spongeTexels);
    if (this.loc.uRippleSpongeK) gl.uniform1f(this.loc.uRippleSpongeK, this.spongeStrength);
    if (this.loc.uRippleImpulses) gl.uniform4fv(this.loc.uRippleImpulses, this.impulseBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.cur = dst;
    this.steps++;
    this.simTime += dt;
  }

  /** 持有最新状态的纹理。水面 pass 绑它。 */
  texture(): WebGLTexture {
    return this.tex[this.cur];
  }

  /** `contract.ts` 的 `RippleField`。`WaterFrameState.ripple` 直接放它。 */
  field(): RippleField {
    return {
      tex: this.tex[this.cur],
      worldMin: [this.worldMin[0], this.worldMin[1]],
      worldSize: this.worldSize,
    };
  }

  /** 读回整张状态图(RGBA float,长度 size²×4)。诊断用,每次都是一次同步回读。 */
  readState(): Float32Array {
    const gl = this.gl;
    const n = this.size;
    const buf = new Float32Array(n * n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.cur]);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return buf;
  }

  /**
   * 以 `centerWorld` 为圆心量一圈径向剖面:波前半径、环宽、峰值、RMS、NaN 数。
   * 「波前是不是恒速扩散」这条验收就是拿它出的数 —— 肉眼看不出 0.23 纹素/步。
   */
  probe(centerWorld: [number, number], edgeThreshold?: number): RippleProbe {
    const n = this.size;
    const data = this.readState();
    const cx = ((centerWorld[0] - this.worldMin[0]) / this.worldSize) * n;
    const cy = ((centerWorld[1] - this.worldMin[1]) / this.worldSize) * n;
    const bins = new Float64Array(n);
    let peak = 0;
    let sum2 = 0;
    let nan = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const h = data[(y * n + x) * 4];
        if (!Number.isFinite(h)) {
          nan++;
          continue;
        }
        const a = Math.abs(h);
        if (a > peak) peak = a;
        sum2 += h * h;
        const r = Math.round(Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
        if (r < n && a > bins[r]) bins[r] = a;
      }
    }
    let front = 0;
    for (let r = 1; r < n; r++) if (bins[r] > bins[front]) front = r;
    const half = bins[front] * 0.5;
    let lo = front;
    let hi = front;
    while (lo > 0 && bins[lo - 1] >= half) lo--;
    while (hi < n - 1 && bins[hi + 1] >= half) hi++;
    /* 前沿:最外一个仍达到 `edgeThreshold` 的半径。
     *
     * **阈值必须是绝对值,不能取当前环峰的百分比。** 环峰在振荡(内支收敛回
     * 圆心再反弹,argmax 在圆心与环之间来回跳),拿它当分母的话前沿会跟着
     * 上下跳 —— 实测 11/15/13/9/12/15 纹素,完全读不出匀速。
     * 传入初始冲击幅度的一个小比例(渲染台用 2%),前沿才是 d'Alembert 那个
     * 干净的支撑边界:r > c·t + 3σ 之外恒为 0,所以它以 c 匀速走。 */
    const cut = edgeThreshold !== undefined ? edgeThreshold : bins[front] * 0.1;
    let edge = 0;
    for (let r = n - 1; r >= 0; r--) {
      if (bins[r] >= cut) {
        edge = r;
        break;
      }
    }
    return {
      frontTexels: front,
      frontMeters: front * this.texelSize(),
      edgeTexels: edge,
      edgeMeters: edge * this.texelSize(),
      ringWidthTexels: hi - lo + 1,
      peakAbs: peak,
      rms: Math.sqrt(sum2 / (n * n)),
      nanCount: nan,
    };
  }

  /** 清空两层状态(切 preset / 换覆盖区域时用) */
  reset(): void {
    const gl = this.gl;
    const n = this.size;
    const zero = new Float32Array(n * n * 2);
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, n, n, 0, gl.RG, gl.FLOAT, zero);
    }
    this.pending = [];
    this.steps = 0;
    this.clampedSteps = 0;
    this.simTime = 0;
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of this.tex) gl.deleteTexture(t);
    for (const f of this.fbo) gl.deleteFramebuffer(f);
    gl.deleteProgram(this.prog);
    this.tex = [];
    this.fbo = [];
  }
}

/**
 * 建求解器。**唯一**该用的入口。
 *
 * 拿不到 `EXT_color_buffer_float`(或 FBO 不完整、着色器编译失败)时返回 `null`
 * —— 调用方把 `WaterFrameState.ripple` 留成 `null`、`uRippleAmp` 留 0,
 * 水面照常渲染,只是没有涟漪。**不许黑屏、不许抛**(任务书 §3.1)。
 *
 * `solveSrc` 由调用方从 `ripple.glsl.ts` 的 `SOLVE_SRC` 取来传进来 ——
 * 本文件不 import 它,理由见文件头。
 */
export function createRippleSolver(
  gl: WebGL2RenderingContext,
  solveSrc: string,
  options: Partial<RippleSolverOptions> & Pick<RippleSolverOptions, "worldMin" | "worldSize">,
): RippleSolver | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const full = {
    worldMin: options.worldMin,
    worldSize: options.worldSize,
    waveSpeed: options.waveSpeed === undefined ? 0.45 : options.waveSpeed,
    damping: options.damping === undefined ? 0.997 : options.damping,
    spongeTexels: options.spongeTexels === undefined ? 24 : options.spongeTexels,
    spongeStrength: options.spongeStrength === undefined ? 0.12 : options.spongeStrength,
    size: options.size === undefined ? RIPPLE_TEX_SIZE : options.size,
  };
  try {
    return new RippleSolver(gl, solveSrc, full);
  } catch {
    return null;
  }
}
