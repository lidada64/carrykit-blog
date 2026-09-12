/**
 * orb-light.ts —— W5 灯球状态发布器 + 光斑求解器(CPU 侧)
 *
 * 两件事:
 *  ① **发布器**:在 rAF 里把时间线上的值写成一个 `OrbState`,**零 DOM 读取**。
 *     仓库里目前没有灯球的 GSAP 时间线(那是主页的事),所以发布器接受一个
 *     **取值函数** `OrbStateSource` 而不是硬绑 GSAP —— W7/W8 接真时间线时
 *     只要传进来一个读时间线的闭包即可,本文件不用改。
 *     另外提供一个**演示驱动** `orbDemoSource()`,预览台与黄金帧用它。
 *  ② **光斑求解器**:把 `OrbState` 解成 `light.glsl.ts` 要的那组 uniform。
 *     球面镜片 → 主光反射 → 与 y=0 求交 → 光斑中心 / 半径 / 强度。
 *     **每帧一次,O(facetCount)**,不是每像素 O(K)。
 *
 * ── 为什么这三个函数写成"自足"的样子 ──────────────────────────────────
 * `scripts/gen-water-preview.mjs` 把 `orbFacetNormals` / `orbWorldCenter` /
 * `computeOrbUniforms` 三个函数用 `Function.prototype.toString()` **原样内联**
 * 进预览台的 HTML(Node 22 的类型擦除让 `.toString()` 直接给出合法 JS)。
 * 这样预览台跑的是**同一份代码**,而不是抄一份 —— docs §11 坑 7 就是抄出来的。
 * 代价:这三个函数只许调用彼此与内置对象,**不许引用模块作用域的其它符号**。
 * 改它们时请守住这条,否则预览台会 ReferenceError。
 *
 * ── 坐标系 ──────────────────────────────────────────────────────────────
 * 全程用 **场坐标**,与 `field.glsl.ts` 的 `p` 同系:
 *   x 向右、y 向上(水面 y=0,相机在 y=camHeight)、z 远离相机。
 * 相机世界系的第三轴与它反号(`p = vec2(rd.x, -rd.z) * tHit`),
 * 换算只在 `light.glsl.ts` 的 `waterOrbLightDir` 里做一次。
 */
/* ⚠️ **只许 `import type`。**
 * `golden/w3/run.mjs` 与 `scripts/gen-water-preview.mjs` 用裸 `node` 直接
 * `import()` 本文件(Node 22 原生擦除类型),而裸 node 解析不了 `./contract`
 * 这种省略扩展名的**值**导入。类型导入会被整条擦掉,所以没有这个问题。
 * 要用 contract.ts 里的常量,请像下面 DEFAULT_ORB_LIGHT_CONFIG 那样在本文件重新声明,
 * 并在 golden/w3/build.ts 里加一条一致性断言。 */
import type {
  OrbLightConfig,
  OrbState,
  OrbUniforms,
  WaterFrameState,
} from "./contract";

/**
 * 灯球照度通道的默认场景常量。
 *
 * **`facetCount` / `mainLightElev` / `mainLightAz` 三个值必须与
 * `docs/blender-assets.md` 的 B-4 `ball-waterlight` 逐字一致**,
 * 否则模式 A ↔ B 切换会跳变(计划 §6 列的三个翻车点之一)。
 *
 * `maxSpots` 必须等于 `contract.ts` 的 `ORB_MAX_SPOTS`(GLSL 数组长度)——
 * 这里重声明是上面那条 import 约束逼出来的,`golden/w3/build.ts` 有断言兜底。
 */
export const DEFAULT_ORB_LIGHT_CONFIG: OrbLightConfig = {
  facetCount: 64,
  maxSpots: 24, // === contract.ts 的 ORB_MAX_SPOTS
  mainLightElev: 0.95, // 54.4°,舞台顶光
  mainLightAz: -0.7, // 从球的左后方打来 → 反射光锥朝相机这一侧铺开
  spotSpread: 0.12,
  intensity: 1.0,
  patchRadiusScale: 1.0,
  envGain: 0.35,
};

/** 相机参数(取 `WaterFrameState` 的三项,免得求解器依赖整个帧状态)。 */
export interface OrbCamera {
  camHeight: number;
  camPitch: number;
  fovY: number;
  /** 画布宽高比 w/h。NDC 的 x 要乘它,与 `waterSurfacePoint` 一致 */
  aspect: number;
}

/**
 * 球面上 n 片镜子的法线(球面 Fibonacci 点阵,场坐标,单位向量)。
 *
 * 用 Fibonacci 而不是随机哈希:分布近乎均匀且**确定性**,Blender 那边照着同一个
 * 公式摆镜片就能对上(见 docs/blender-assets.md B-4)。随机点阵每次生成都不同,
 * A/B 两模式永远对不齐。
 *
 * ⚠️ 自足函数,见文件头 —— 不许引用模块作用域符号。
 */
export function orbFacetNormals(n: number): number[][] {
  const out: number[][] = [];
  const ga = Math.PI * (3 - Math.sqrt(5)); // 黄金角
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return out;
}

/**
 * NDC 球心 + NDC 半径 → 球心的场坐标 (x, 离水面高度, z)。
 *
 * 张角 α = atan(radiusNdc · tan(fovY/2)) —— 半径以 NDC 纵向半高为单位,
 * 而 NDC 纵向半高对应的正切正是 tan(fovY/2)。于是球心距离 d = R / sin(α)。
 * 方向沿逆投影的同一条视线(俯角旋转与 `waterSurfacePoint` 逐字一致)。
 *
 * ⚠️ 自足函数,见文件头。
 */
export function orbWorldCenter(
  screen: [number, number],
  radiusNdc: number,
  worldRadius: number,
  cam: OrbCamera,
): [number, number, number] {
  const tanH = Math.tan(cam.fovY * 0.5);
  // 相机局部方向(与 field.glsl.ts 的 waterSurfacePoint 同一条式子)
  let dx = screen[0] * tanH * cam.aspect;
  let dy = screen[1] * tanH;
  let dz = -1;
  const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
  dx *= inv;
  dy *= inv;
  dz *= inv;
  // 绕 X 轴下俯 camPitch
  const cp = Math.cos(cam.camPitch);
  const sp = Math.sin(cam.camPitch);
  const rx = dx;
  const ry = dy * cp + dz * sp;
  const rz = -dy * sp + dz * cp;
  // 张角 → 距离。radiusNdc 太小(球几乎是个点)时给一个下限,免得 d 冲到无穷
  const alpha = Math.atan(Math.max(radiusNdc, 1e-4) * tanH);
  const dist = worldRadius / Math.max(Math.sin(alpha), 1e-6);
  // 相机在 (0, camHeight, 0);场坐标第三轴 = −z_相机
  return [rx * dist, cam.camHeight + ry * dist, -(rz * dist)];
}

/**
 * 一帧的光斑求解。返回可以直接写进 uniform 的一组数。
 *
 * 物理:
 *  · 主光方向 L(**指向光源**)= (cos·sin(az), sin(el), cos·cos(az))。
 *  · 镜片 i 被照到当且仅当 `L·n_i > 0`;反射方向 `d = 2(L·n)n − L`。
 *  · 只有 `d.y < 0` 的才打到水面;光程 `t = h / (−d.y)`,落点 = 球心水平位置 + t·d.xz。
 *  · 光斑半径 = `spotSpread × t` —— 镜片尺寸 / 球半径 就是光锥的角半径,
 *    乘光程即世界半径(任务书 §2.2 的"镜片尺寸 × 距离 / 球半径")。
 *  · 峰值强度 ∝ `cosθ_L · |d.y| / t²`:收到的光通量 ∝ 镜片对光源的投影面积(cosθ_L),
 *    铺在水面上还要乘掠射因子 |d.y|,而光斑面积 ∝ t² —— 所以峰值照度 ∝ 1/t²。
 *    按 h² 归一,让"球正下方"那个光斑的强度是 O(1),增益才好调。
 *  · 自转:全部法线绕**竖直轴**转 `spinPhase·2π`(迪斯科球就是绕竖轴转的)。
 *
 * 选取:算完 facetCount 片,按强度降序取前 maxSpots 片,其余槽位强度写 0。
 * 强度在集合边界上本来就趋于 0(掠射时 |d.y|→0、远处 1/t²→0、背光面 cosθ_L≤0),
 * 所以被挤掉的永远是最暗的那几个;**但这不是零跳变**,见 docs/water-orb-coupling.md §6。
 *
 * ⚠️ 自足函数,见文件头 —— 只调用 orbFacetNormals / orbWorldCenter。
 */
export function computeOrbUniforms(
  orb: OrbState,
  cfg: OrbLightConfig,
  cam: OrbCamera,
): OrbUniforms {
  const spots = new Float32Array(cfg.maxSpots * 4);
  const center = orbWorldCenter(orb.screen, orb.radiusNdc, orb.worldRadius, cam);
  const h = center[1];

  // energy 是总闸门:0 时不算、不注入,uniform 全 0
  if (!(orb.energy > 0) || h <= 0) {
    return {
      spots,
      center,
      patchCenter: [center[0], center[2]],
      patchRadius: Math.max(orb.worldRadius, 0.05),
      omega: 0,
      activeSpots: 0,
      envLight: null,
    };
  }

  const ce = Math.cos(cfg.mainLightElev);
  const L = [
    ce * Math.sin(cfg.mainLightAz),
    Math.sin(cfg.mainLightElev),
    ce * Math.cos(cfg.mainLightAz),
  ];
  const phi = orb.spinPhase * Math.PI * 2;
  const cs = Math.cos(phi);
  const sn = Math.sin(phi);

  const found: { x: number; z: number; r: number; i: number }[] = [];
  const facets = orbFacetNormals(cfg.facetCount);
  for (const f of facets) {
    // 绕竖直轴自转
    const nx = f[0] * cs - f[2] * sn;
    const ny = f[1];
    const nz = f[0] * sn + f[2] * cs;
    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
    if (ndl <= 0) continue; // 背光面
    const dx = 2 * ndl * nx - L[0];
    const dy = 2 * ndl * ny - L[1];
    const dz = 2 * ndl * nz - L[2];
    if (dy >= -1e-3) continue; // 反射光朝上或几乎水平 —— 打不到水面
    const t = h / -dy;
    if (!(t > 0) || t > 400) continue; // 400m 之外强度已在 1e-5 量级
    const r = Math.max(cfg.spotSpread * t, cfg.spotSpread * orb.worldRadius);
    const inten = cfg.intensity * ndl * -dy * ((h * h) / (t * t));
    if (!(inten > 1e-5)) continue;
    found.push({ x: center[0] + t * dx, z: center[2] + t * dz, r, i: inten });
  }

  found.sort((a, b) => b.i - a.i);
  const used = Math.min(found.length, cfg.maxSpots);
  let wsum = 0;
  let cx = 0;
  let cz = 0;
  for (let k = 0; k < used; k++) {
    const s = found[k];
    spots[k * 4] = s.x;
    spots[k * 4 + 1] = s.z;
    spots[k * 4 + 2] = 1 / Math.max(s.r, 1e-4); // 预先取倒数,省掉每像素一次除法
    spots[k * 4 + 3] = s.i;
    wsum += s.i;
    cx += s.i * s.x;
    cz += s.i * s.z;
  }

  // 波幅斑块:强度加权质心 + RMS 展布(米级的一团,不逐镜片 —— 见 light.glsl.ts)
  let pcx = center[0];
  let pcz = center[2];
  let spread = Math.max(orb.worldRadius, 0.05);
  if (wsum > 0) {
    pcx = cx / wsum;
    pcz = cz / wsum;
    let v = 0;
    let rmean = 0;
    for (let k = 0; k < used; k++) {
      const s = found[k];
      v += s.i * ((s.x - pcx) * (s.x - pcx) + (s.z - pcz) * (s.z - pcz));
      rmean += s.i * s.r;
    }
    spread = Math.sqrt(v / wsum) * 1.6 + rmean / wsum;
  }

  /* 环境列注入:灯球在水里的倒影 + 天空里的光晕。
   * 环境列是"无穷远环境沿仰角的一条分布",方位角不参与 —— 所以这里把灯球
   * 当远处光源处理,只取一个仰角。对镜面倒影而言这是近似:真正的倒影在屏幕上
   * 会随距离变位置。**近场的细节由模式 A 的光斑池负责,这一项只负责那圈软晕。**
   * 仰角取"从相机看它在水里的像"那个方向:镜像相机在 −camHeight,
   * 反射线仰角 = atan((camHeight + h) / D)。 */
  const D = Math.hypot(center[0], center[2]);
  const sinElev = Math.sin(Math.atan2(cam.camHeight + h, Math.max(D, 1e-3)));
  const angR = orb.worldRadius / Math.max(Math.hypot(D, cam.camHeight + h), 1e-3);
  /* 镜面项要的立体角 = 球在水面处张开的立体角 πR²/d²。
   * **必须算,不许拍一个常数**:和 shade.glsl.ts 那条"Beckmann 必须乘光源立体角"
   * 是同一条(W1 漏了它,近场直接烧成全白)。第一版把它拍成 3e-4,而夜景的球
   * 在 36 m 外实际是 7.9e-3 —— 差 26 倍,uOrbSpecGain 要开到 600 才看得见,
   * 那说明旋钮量纲错了,不是画面需要那么亮。
   * d 取**相机到球**的距离:镜面项本来就出现在球的镜像方向上,那一片水面到球的
   * 距离与相机到球的距离同量级,而逐像素算 d 会多一次开方却改不了几何。 */
  const camDist = Math.max(
    Math.hypot(center[0], center[1] - cam.camHeight, center[2]),
    orb.worldRadius * 2,
  );
  return {
    spots,
    omega: (Math.PI * orb.worldRadius * orb.worldRadius) / (camDist * camDist),
    center,
    patchCenter: [pcx, pcz],
    patchRadius: Math.max(spread * cfg.patchRadiusScale, 0.05),
    activeSpots: used,
    envLight:
      cfg.envGain > 0
        ? {
            sinElev,
            // 2.5×:倒影本体只有球那么大,但参考图里月亮外面还有一大片溶解的网点晕
            width: Math.max(2.5 * angR, 0.01),
            gain: cfg.envGain * orb.energy,
          }
        : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * 发布器
 * ──────────────────────────────────────────────────────────────────────── */

/** 取值函数:给定时间(秒)返回一帧 `OrbState`。W7/W8 传一个读 GSAP 时间线的闭包。 */
export type OrbStateSource = (timeSec: number) => OrbState;

/** 发布器句柄。`stop()` 之后不再进 rAF(reduced-motion 下就该这样)。 */
export interface OrbPublisher {
  /** 手动推一帧(黄金帧 / 测试用,不进 rAF) */
  publish(timeSec: number): OrbState;
  /** 起 rAF 循环 */
  start(): void;
  stop(): void;
  readonly running: boolean;
}

/**
 * 把取值函数接到 rAF 上,每帧写一次 `sink`。
 *
 * **零 DOM 读取**:本函数不碰任何布局属性,`timeSec` 由 rAF 的时间戳算出。
 * 球在屏幕上的位置来自时间线的插值量,不是量出来的 —— 这是 contract.ts 那条红线。
 *
 * `raf` 参数可注入,便于在没有 window 的环境(Node 测试、SSR)里用。
 */
export function createOrbPublisher(
  source: OrbStateSource,
  sink: (s: OrbState) => void,
  raf?: (cb: (t: number) => void) => number,
  caf?: (id: number) => void,
): OrbPublisher {
  const req =
    raf ?? ((cb: (t: number) => void) => globalThis.requestAnimationFrame(cb));
  const cancel = caf ?? ((id: number) => globalThis.cancelAnimationFrame(id));
  let id = 0;
  let t0 = -1;

  const publish = (timeSec: number): OrbState => {
    const s = source(timeSec);
    sink(s);
    return s;
  };

  const loop = (now: number): void => {
    if (t0 < 0) t0 = now;
    publish((now - t0) / 1000);
    id = req(loop);
  };

  return {
    publish,
    start(): void {
      if (id) return;
      t0 = -1;
      id = req(loop);
    },
    stop(): void {
      if (!id) return;
      cancel(id);
      id = 0;
    },
    get running(): boolean {
      return id !== 0;
    },
  };
}

/**
 * 演示驱动:球沿一条路径横穿画面,energy 淡入淡出,自转 4 秒一圈。
 * 预览台与 `golden/w5/` 的黄金帧都用它 —— 真时间线还不存在(那是 W7/W8)。
 *
 * 周期 12 秒:0~2s 淡入、2~10s 横穿、10~12s 淡出。
 */
export function orbDemoSource(period = 12): OrbStateSource {
  return (timeSec: number): OrbState => {
    const u = ((timeSec % period) + period) % period;
    const k = u / period;
    const x = -0.75 + 1.5 * k; // 从左到右横穿
    const y = 0.42 + 0.1 * Math.sin(k * Math.PI * 2); // 轻微上下浮动
    const fade = Math.min(1, u / 2, (period - u) / 2);
    const spin = ((timeSec / 4) % 1 + 1) % 1;
    return {
      screen: [x, y],
      radiusNdc: 0.16,
      energy: Math.max(0, fade),
      spinPhase: spin,
      lightmapFrame: Math.floor(spin * 120),
      worldRadius: 0.35,
    };
  };
}

/** 给定帧状态直接解出 uniform —— W8 的组装层一行就能用。 */
export function orbUniformsForFrame(
  frame: WaterFrameState,
  aspect: number,
  cfg: OrbLightConfig = DEFAULT_ORB_LIGHT_CONFIG,
): OrbUniforms {
  return computeOrbUniforms(frame.orb, cfg, {
    camHeight: frame.camHeight,
    camPitch: frame.camPitch,
    fovY: frame.fovY,
    aspect,
  });
}
