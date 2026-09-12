/**
 * perf.ts —— W9 GPU 计时与降级阶梯
 *
 * 两件事,一个类:
 *  ① **量**:用 `EXT_disjoint_timer_query_webgl2` 分 pass 埋点,60 帧滚动平均。
 *  ② **降**:超预算就往下掉一档质量,富余就升回来。
 *
 * ── 为什么不能用 `performance.now()` 量 GPU ─────────────────────────────
 * WebGL 的 draw call 是**异步排队**的:`drawArrays` 返回时 GPU 一根指令都还没跑。
 * 在 draw 前后夹 `performance.now()` 量到的是"把命令写进队列有多快",在快的机器上
 * 恒为 0.0x ms,在卡的机器上也恒为 0.0x ms —— 这个数与画面流畅度**完全无关**。
 * 想同步等 GPU 只有 `gl.finish()`,而那会把 CPU/GPU 流水线彻底串行化,量到的数
 * 比真实值大一大截,而且量的过程本身就把帧率毁了。
 * 唯一正确的做法是 timer query:GPU 自己在命令流里打时间戳,**隔几帧再回读**。
 *
 * ── 拿不到扩展怎么办 ───────────────────────────────────────────────────
 * Safari 至今没有 `EXT_disjoint_timer_query_webgl2`,很多浏览器在跨源隔离没开时
 * 也会把它藏掉(时间戳是侧信道)。这时**回落到 CPU 帧间隔**(rAF 之间的 dt),
 * 并把 `source` 标成 `"cpu"` ——
 * **面板必须显示这是哪一种**,不然会拿一个"帧间隔"当"GPU 帧时间"汇报,
 * 那是在骗自己:帧间隔被 vsync 钉在 16.7 ms,GPU 只用了 3 ms 也是 16.7。
 * 回落模式下阶梯**只在明显掉帧时**才动(dt > 1.35 × vsync),不然 60 fps 的机器
 * 会因为"16.7 > 8 预算"一路降到底。
 *
 * ── 阶梯为什么是这六档、为什么是 30/120 帧 ─────────────────────────────
 * 六档来自任务书 §W9.2,顺序是**先牺牲分辨率、再牺牲波场细节、最后牺牲运动**:
 * 分辨率是唯一能线性换回填充率的旋钮(本着色器是彻底的 fragment-bound),
 * 而"停止运动"放最后 —— 一个静止但清晰的水面,比一个流动但糊掉的水面耐看。
 *
 * 30 帧(0.5 s)降档:比一次 GC 或一次贴图上传长,不会被一两帧毛刺打下来;
 * 120 帧(2 s)升档:比降档慢 4 倍,这是**故意的迟滞** —— 对称的阈值会在
 * 预算边缘反复横跳,用户看到的是分辨率一秒抖三次,比一直停在低档还难受。
 *
 * ── 这个文件为什么只 import type ───────────────────────────────────────
 * 同 `water-director.ts` / `orb-light.ts`:`scripts/gen-water-preview.mjs` 会用
 * `.toString()` 把类原样内联进预览台。代价是**方法里不许引用模块作用域的函数**;
 * 引用到的模块级常量必须在生成脚本里按值内联。
 */

/** 一段 pass 的名字。本渲染器只有两段 —— 见 `WaterPerfSample` 的注释。 */
export type WaterPassName = "ripple" | "water";

/**
 * 预算(毫秒,1080p 中端集显)。**任务书 §5「性能预算」那张表。**
 *
 * 任务书原本写的是三段 ripple 0.2 / water 5.0 / quantize 1.0。
 * 实际实现里**没有独立的 quantize pass** —— 抖动是 `dither.glsl.ts` 里的两行,
 * 和着色在同一个 fragment shader 里(W4 的设计:量化必须看得到 tonemap 之前的
 * 连续亮度,拆成第二个 pass 就得先把亮度写进一张 RGBA8,而 8-bit 中间态
 * 会把 1-bit 抖动需要的中间调先量化一遍)。所以 water 那档的预算是
 * **5.0 + 1.0 = 6.0**,总预算 8.0 不变(余量 1.8)。
 */
export const WATER_PERF_BUDGET: Readonly<Record<WaterPassName | "total", number>> = {
  ripple: 0.2,
  water: 6.0,
  total: 8.0,
};

/** 一档质量。**每一档是完整状态**,不是增量 —— 增量式的档位没法直接跳。 */
export interface WaterQualityTier {
  /** 0..5 */
  id: number;
  /** 后备缓冲相对 CSS 像素的倍率。1 = 原生 */
  renderScale: number;
  /**
   * `uFieldLodBias` 的**乘数**(不是绝对值)—— 三个 preset 的基准值不同
   * (near/mid 5.0、night 3.0),写死绝对值会把 night 调成另一个画面。
   *
   * 任务书写的是「波场八度 6→4」。本实现的波场不是八度叠加,是 24 个
   * **哈希决定波长的分量** + 解析 LOD(`field.glsl.ts`):一个波长内不足 4 px
   * 就淡出,淡掉的能量转进 σ²。所以"少算几个分量"的正确旋钮是 **把 LOD 提前**,
   * 而不是改 `WATER_COMPONENTS`(那是编译期常量,改它要重编着色器 —— 掉一档
   * 质量就卡半秒,比不降还糟)。
   *
   * 1.6× 是按分量分布估的:波长在 [1.8 cm, 32 cm] 上对数均匀,LOD 阈值提前
   * 1.6 倍 ⇒ `log(1.6)/log(32/1.8)` ≈ **16%** 的分量提前出局,峰值带上约少 4 个。
   * **这一档省的不是分量数,是那 4 个分量在每像素上的 8 次三角函数。**
   */
  lodBiasMul: number;
  /** 涟漪纹理边长。256 → 128 是 4× 的填充率 */
  rippleTexSize: number;
  /** 停更:波场时间不再前进、抖动图案静态。**最后一档才用** */
  freeze: boolean;
}

/**
 * 六档阶梯。**唯一定义处** —— 面板与预览台都引用它,不另抄一份。
 *
 * 顺序(任务书 §W9.2):
 *   0 全质量 · 1 分辨率 0.75× · 2 波场 LOD 提前 · 3 分辨率 0.5×
 *   · 4 涟漪 256→128 · 5 停更
 *
 * 注意档 2 排在档 1 与档 3 之间,**不是**"分辨率一路降到底再动波场":
 * 0.75× 已经把填充率砍到 56%,再降到 0.5×(25%)之前先试一次波场 ——
 * 掉分辨率是全画面变糊,掉几个短波分量只是远处少几道细纹,后者便宜得多。
 */
export const WATER_QUALITY_TIERS: readonly WaterQualityTier[] = [
  { id: 0, renderScale: 1.0, lodBiasMul: 1.0, rippleTexSize: 256, freeze: false },
  { id: 1, renderScale: 0.75, lodBiasMul: 1.0, rippleTexSize: 256, freeze: false },
  { id: 2, renderScale: 0.75, lodBiasMul: 1.6, rippleTexSize: 256, freeze: false },
  { id: 3, renderScale: 0.5, lodBiasMul: 1.6, rippleTexSize: 256, freeze: false },
  { id: 4, renderScale: 0.5, lodBiasMul: 1.6, rippleTexSize: 128, freeze: false },
  { id: 5, renderScale: 0.5, lodBiasMul: 1.6, rippleTexSize: 128, freeze: true },
];

/** 阶梯的迟滞参数。**降得快、升得慢**,理由见文件头。 */
export const WATER_PERF_LADDER = {
  /** 连续超预算多少帧降一档 */
  downFrames: 30,
  /** 连续富余多少帧升一档 */
  upFrames: 120,
  /** 「富余」的判据:低于预算的这个比例才算(留出迟滞带,避免边缘横跳) */
  upRatio: 0.7,
  /** CPU 回落模式下,帧间隔超过 vsync 的这个倍数才算掉帧 */
  cpuDropRatio: 1.35,
  /** 滚动平均的窗口(帧) */
  window: 60,
} as const;

/** 一次读数。面板直接画它。 */
export interface WaterPerfSample {
  /** `"gpu"` = timer query 的真值;`"cpu"` = 回落到 rAF 帧间隔(**不是 GPU 时间**) */
  source: "gpu" | "cpu" | "none";
  /** 60 帧滚动平均(毫秒)。`source === "cpu"` 时 ripple/water 为 0 */
  ripple: number;
  water: number;
  /** GPU 模式 = ripple + water;CPU 模式 = 帧间隔 */
  total: number;
  /** 当前档位 0..5 */
  tier: number;
  /** 档位是被手动钉住的吗(面板上钉的) */
  pinned: boolean;
  /** 连续超预算 / 连续富余的帧数(阶梯的证据,不是断言) */
  overFrames: number;
  underFrames: number;
  /** timer query 因为 GPU_DISJOINT_EXT 被丢掉的次数(计时器不可信的证据) */
  disjointDrops: number;
}

/** 扩展对象上的两个常量。TS 的 lib.dom 没有这个扩展的类型,只能自己写。 */
export interface WaterTimerExt {
  GPU_DISJOINT_EXT: number;
  TIME_ELAPSED_EXT?: number;
}

/** `TIME_ELAPSED_EXT` 的字面值。扩展对象上没有这个键时的兜底(见 GL 枚举表)。 */
export const WATER_TIME_ELAPSED_EXT = 0x88bf;

interface PendingQuery {
  q: WebGLQuery;
  pass: WaterPassName;
}

/**
 * GPU 计时 + 降级阶梯。**不拥有任何渲染状态** —— 只在 pass 前后被调一下,
 * 每帧末尾 `endFrame(dtSec)` 推进一次阶梯,消费方读 `sample()` 决定怎么渲。
 *
 * 典型接线:
 * ```ts
 * const perf = new WaterPerf(gl);
 * // 每帧:
 * perf.begin("ripple"); solver.step(); perf.end();
 * perf.begin("water");  gl.drawArrays(...); perf.end();
 * perf.endFrame(dt);
 * const tier = WATER_QUALITY_TIERS[perf.tier];   // 下一帧按它渲
 * ```
 */
export class WaterPerf {
  gl: WebGL2RenderingContext;
  /** `EXT_disjoint_timer_query_webgl2`;拿不到就是 null(回落 CPU)。
   *  两个常量都挂在**扩展对象**上,不在 context 上(WebGL1 那版才在 context 上)。 */
  ext: WaterTimerExt | null;
  /** 正在录的那个 query(WebGL2 同一时刻只能有一个 TIME_ELAPSED 在飞) */
  active: PendingQuery | null;
  /** 已经发出、还没回读的 */
  pending: PendingQuery[];
  /** 回收池 —— 每帧 new 两个 WebGLQuery 会让驱动侧对象数无限涨 */
  pool: WebGLQuery[];

  /** 两段的滚动窗口(环形缓冲,零分配) */
  ringRipple: Float64Array;
  ringWater: Float64Array;
  ringCpu: Float64Array;
  idxRipple: number;
  idxWater: number;
  idxCpu: number;
  nRipple: number;
  nWater: number;
  nCpu: number;

  tier: number;
  pinnedTier: number | null;
  overFrames: number;
  underFrames: number;
  disjointDrops: number;
  /** 上一帧是否真的有 GPU 读数(决定 sample().source) */
  hasGpu: boolean;
  /**
   * vsync 周期的估计(毫秒)= **见过的最快一帧**,只减不增。
   *
   * 第一版拿"滚动窗口里的最小值"当估计,结果是**自我毒化**:掉到 30 fps
   * 之后窗口在 1 秒内被 33.3 ms 填满,最小值也变成 33.3,于是
   * `cpuMs < vsync × 1.05` 成立 → 判成"富余" → 又升回档 0。
   * 实测轨迹是 [0,1,1,1,1,0,0,0,…] —— 降了一档又自己爬回去,一直卡着。
   * 全局最小值不会被慢帧污染:显示器的刷新周期是硬件常数,只要**见过一次**
   * 满帧就够了(页面加载后的头几帧几乎总是满帧)。
   */
  vsyncMs: number;

  out: WaterPerfSample;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    /* 拿扩展。**失败不是错误** —— Safari 一直没有它,而且很多浏览器在
     * 没开跨源隔离时会把它藏掉(GPU 时间戳是侧信道)。 */
    let ext: WaterTimerExt | null = null;
    try {
      ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as WaterTimerExt | null;
    } catch {
      ext = null;
    }
    this.ext = ext;
    this.active = null;
    this.pending = [];
    this.pool = [];
    const w = WATER_PERF_LADDER.window;
    this.ringRipple = new Float64Array(w);
    this.ringWater = new Float64Array(w);
    this.ringCpu = new Float64Array(w);
    this.idxRipple = 0;
    this.idxWater = 0;
    this.idxCpu = 0;
    this.nRipple = 0;
    this.nWater = 0;
    this.nCpu = 0;
    this.tier = 0;
    this.pinnedTier = null;
    this.overFrames = 0;
    this.underFrames = 0;
    this.disjointDrops = 0;
    this.hasGpu = false;
    this.vsyncMs = 0;
    this.out = {
      source: "none",
      ripple: 0,
      water: 0,
      total: 0,
      tier: 0,
      pinned: false,
      overFrames: 0,
      underFrames: 0,
      disjointDrops: 0,
    };
  }

  /**
   * 面板把档位钉死(调参时不希望阶梯在背后动)。`null` = 交还给自动。
   *
   * 解钉时**不跳回档 0** —— `this.tier` 停在被钉的那一档,由阶梯从那里
   * 自己爬。解钉的那一瞬间画面跳一下比慢慢爬回去更扎眼。
   */
  pin(tier: number | null): void {
    if (tier === null) {
      this.pinnedTier = null;
      return;
    }
    const t = tier < 0 ? 0 : tier > WATER_QUALITY_TIERS.length - 1 ? WATER_QUALITY_TIERS.length - 1 : tier;
    this.pinnedTier = Math.round(t);
    this.tier = this.pinnedTier;
    this.overFrames = 0;
    this.underFrames = 0;
  }

  /** 当前该按哪一档渲。**消费方每帧读它**,不要自己记档位。 */
  currentTier(): WaterQualityTier {
    return WATER_QUALITY_TIERS[this.pinnedTier ?? this.tier];
  }

  /** 开一段。扩展缺失时是个空操作(连 try 都不做,热路径上别浪费)。 */
  begin(pass: WaterPassName): void {
    if (!this.ext || this.active) return;
    const gl = this.gl;
    const q = this.pool.pop() ?? gl.createQuery();
    if (!q) return;
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT ?? WATER_TIME_ELAPSED_EXT, q);
    this.active = { q, pass };
  }

  /** 收一段。 */
  end(): void {
    if (!this.ext || !this.active) return;
    const gl = this.gl;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT ?? WATER_TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /**
   * 一帧结束。回读能读的 query、把 CPU 帧间隔也记一笔、推进阶梯。
   * `dtSec` 是 rAF 的帧间隔(秒),回落模式下唯一的信号源。
   */
  endFrame(dtSec: number): void {
    this.pollQueries();

    // CPU 侧永远记一笔 —— 它是回落信号,也是"GPU 很闲但页面还是卡"的证据
    if (dtSec > 0) {
      const ms = dtSec * 1000;
      /* 全局最小值 —— 只减不增。下界 4 ms:比 240 Hz 还快的"帧"只可能是
       * 标签页切回来时 rAF 补发的那一串,拿它当 vsync 会让判据永远为真。 */
      if (ms >= 4 && (this.vsyncMs === 0 || ms < this.vsyncMs)) this.vsyncMs = ms;
      this.ringCpu[this.idxCpu] = ms;
      this.idxCpu = (this.idxCpu + 1) % WATER_PERF_LADDER.window;
      if (this.nCpu < WATER_PERF_LADDER.window) this.nCpu++;
    }

    const gpuTotal = this.avg(this.ringRipple, this.nRipple) + this.avg(this.ringWater, this.nWater);
    const cpuMs = this.avg(this.ringCpu, this.nCpu);

    /* 判据分两套。**不要把它们混成一个数** ——
     * GPU 模式量的是"这一帧 GPU 忙了多久",直接和 8 ms 预算比;
     * CPU 模式量的是帧间隔,而帧间隔被 vsync 钉住:60 fps 的机器恒为 16.7 ms,
     * 拿它和 8 ms 比会让**所有**机器一路降到档 5。所以回落模式的判据是
     * "比 vsync 明显慢" —— 用窗口里的最小值当 vsync 的估计。 */
    let over: boolean;
    let under: boolean;
    if (this.hasGpu) {
      over = gpuTotal > WATER_PERF_BUDGET.total;
      under = gpuTotal > 0 && gpuTotal < WATER_PERF_BUDGET.total * WATER_PERF_LADDER.upRatio;
    } else {
      const vsync = this.vsyncMs;
      over = vsync > 0 && cpuMs > vsync * WATER_PERF_LADDER.cpuDropRatio;
      under = vsync > 0 && cpuMs < vsync * 1.05;
    }

    if (this.pinnedTier === null) {
      if (over) {
        this.overFrames++;
        this.underFrames = 0;
        if (this.overFrames >= WATER_PERF_LADDER.downFrames && this.tier < WATER_QUALITY_TIERS.length - 1) {
          this.tier++;
          this.overFrames = 0;
          /* 降档之后**两个计数器一起清零**:新档位的开销还没量到一帧,
           * 拿旧档位攒的 underFrames 去决定要不要马上升回来是没有意义的。 */
          this.underFrames = 0;
        }
      } else if (under) {
        this.underFrames++;
        this.overFrames = 0;
        if (this.underFrames >= WATER_PERF_LADDER.upFrames && this.tier > 0) {
          this.tier--;
          this.overFrames = 0;
          this.underFrames = 0;
        }
      } else {
        // 在迟滞带里:既不降也不升,而且**两边都清零**(不是只清一边)
        this.overFrames = 0;
        this.underFrames = 0;
      }
    }

    const o = this.out;
    o.source = this.hasGpu ? "gpu" : this.nCpu > 0 ? "cpu" : "none";
    o.ripple = this.avg(this.ringRipple, this.nRipple);
    o.water = this.avg(this.ringWater, this.nWater);
    o.total = this.hasGpu ? gpuTotal : cpuMs;
    o.tier = this.pinnedTier ?? this.tier;
    o.pinned = this.pinnedTier !== null;
    o.overFrames = this.overFrames;
    o.underFrames = this.underFrames;
    o.disjointDrops = this.disjointDrops;
  }

  /** 这一帧的读数。**返回的对象每帧复用**,消费方不要持有引用。 */
  sample(): WaterPerfSample {
    return this.out;
  }

  /* ── 内部 ──────────────────────────────────────────────────────────── */

  /**
   * 回读所有已完成的 query。**必须先查 GPU_DISJOINT_EXT** ——
   * 显卡在电源状态切换、驱动重置、或另一个进程抢占时会让时间戳失效,
   * 那时读出来的数可以是任意值(实测见过 4e9 ns)。有 disjoint 就把
   * **这一批全部丢掉**,不是丢一个 —— disjoint 是全局状态,不针对某个 query。
   */
  pollQueries(): void {
    if (!this.ext || this.pending.length === 0) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
    let kept = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      const done = gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE) as boolean;
      if (!done) {
        this.pending[kept++] = p;
        continue;
      }
      if (disjoint) {
        this.disjointDrops++;
      } else {
        const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT) as number;
        const ms = ns / 1e6;
        if (p.pass === "ripple") {
          this.ringRipple[this.idxRipple] = ms;
          this.idxRipple = (this.idxRipple + 1) % WATER_PERF_LADDER.window;
          if (this.nRipple < WATER_PERF_LADDER.window) this.nRipple++;
        } else {
          this.ringWater[this.idxWater] = ms;
          this.idxWater = (this.idxWater + 1) % WATER_PERF_LADDER.window;
          if (this.nWater < WATER_PERF_LADDER.window) this.nWater++;
        }
        this.hasGpu = true;
      }
      this.pool.push(p.q);
    }
    this.pending.length = kept;
  }

  avg(ring: Float64Array, n: number): number {
    if (n <= 0) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) s += ring[i];
    return s / n;
  }

  /** 卸载时把 query 对象还给驱动。 */
  dispose(): void {
    const gl = this.gl;
    for (const p of this.pending) gl.deleteQuery(p.q);
    for (const q of this.pool) gl.deleteQuery(q);
    if (this.active) gl.deleteQuery(this.active.q);
    this.pending.length = 0;
    this.pool.length = 0;
    this.active = null;
  }
}
