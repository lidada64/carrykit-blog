#!/usr/bin/env node
/**
 * gen-water-preview.mjs —— 把当前的 preview.frag + 蓝噪声 + 环境列 LUT
 * 打包成一个**自包含**的 HTML 预览台(资源全部内联成 data: URI)。
 *
 *   node_modules/.bin/tsx golden/w3/build.ts     # 先重建 preview.frag
 *   node scripts/gen-water-preview.mjs           # → /tmp/water-preview.html
 *
 * 为什么用脚本生成而不是手写 HTML:着色器一改,手抄的预览就悄悄漂移
 * (docs §11 坑 7 已经踩过一次)。这里直接读产物,漂不了。
 *
 * PRESETS 从 golden/w3/run.mjs 导入,与跑分用的参数是同一份,不另抄。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => path.join(ROOT, p);
const OUT = process.argv[2] ?? "/tmp/water-preview.html";

const { PRESETS, ORB_POSES, UNIFORM_DEFAULTS } = await import(
  pathToFileURL(R("golden/w3/run.mjs")).href + "?noscore"
);

/* ── W5 灯球:把 CPU 侧的求解器**原样搬进浏览器** ──────────────────────────
 * 预览台必须跑和黄金帧**同一份**光斑求解代码,否则拖出来的画面和跑分对不上
 * ——docs §11 坑 7 就是"产物没重建"的同类问题,抄一份 JS 更糟。
 *
 * 做法:Node 22 原生擦除 TS 类型,`fn.toString()` 直接给出合法 JS,把函数源码
 * 内联进 HTML。代价是这几个函数必须**自足**(只调用彼此与内置对象),
 * orb-light.ts / env-column.ts 的文件头都写了这条约束。 */
const ORB = await import(pathToFileURL(R("src/components/lab/water/orb-light.ts")).href);
const ENVC = await import(pathToFileURL(R("src/components/lab/water/env-column.ts")).href);
/* W6 涟漪:求解器**本体**搬进浏览器,和渲染台跑的是同一个类,不是抄一份。
 * RippleSolver 是个 class,`toString()` 给出完整定义;它只依赖 gl 与几个模块级常量,
 * 那几个常量下面按值内联。 */
const RIP = await import(pathToFileURL(R("src/components/lab/water/ripple.ts")).href);
const RIPGL = await import(pathToFileURL(R("src/components/lab/water/ripple.glsl.ts")).href);
/* W7 交互编排:`WaterDirector` 也是**同一份代码**搬进浏览器。它是自足类
 * (只引用下面按值内联的四个常量),理由与 RippleSolver 完全相同 ——
 * 预览台是这张卡唯一能判断对不对的东西,它必须跑真的编排器,不是一份仿制品。 */
const DIR = await import(pathToFileURL(R("src/components/lab/water/water-director.ts")).href);
const INLINE_JS = [
  ORB.orbFacetNormals.toString(),
  ORB.orbWorldCenter.toString(),
  ORB.computeOrbUniforms.toString(),
  ENVC.envColumnValue.toString(),
  ENVC.buildEnvColumnLut.toString(),
  // envColumnValue/buildEnvColumnLut 用到的两个模块作用域小工具
  "function smoothstep(e0,e1,x){if(e1<=e0)return x<e0?0:1;const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);}",
  "const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));",
  // buildEnvColumnLut 引用的模块作用域常量(唯一定义仍在 env-column.ts)
  `const ENV_LUT_SIZE=${ENVC.ENV_LUT_SIZE},ENV_LUT_SCALE=${ENVC.ENV_LUT_SCALE},` +
    `ENV_LUT_MIN=${ENVC.ENV_LUT_MIN},ENV_LUT_MAX=${ENVC.ENV_LUT_MAX};`,
  // —— W6 涟漪求解器(与渲染台同一份代码)——
  RIP.RippleSolver.toString(),
  RIP.createRippleSolver.toString(),
  `const RIPPLE_TEX_SIZE=${RIP.RIPPLE_TEX_SIZE};`,
  `const RIPPLE_IMPULSE_SLOTS=${RIP.RIPPLE_IMPULSE_SLOTS};`,
  `const RIPPLE_CFL_MAX=${RIP.RIPPLE_CFL_MAX};`,
  `const RIPPLE_HOVER_STRENGTH=${RIP.RIPPLE_HOVER_STRENGTH};`,
  `const RIPPLE_DEFAULT_RADIUS=${RIP.RIPPLE_DEFAULT_RADIUS};`,
  `const RIPPLE_SOLVE_SRC=${JSON.stringify(RIPGL.SOLVE_SRC)};`,
  // —— W7 交互编排器(与 W8 组件将跑的同一份代码)——
  DIR.WaterDirector.toString(),
  // WaterDirector 引用到的四个模块级常量。**唯一定义仍在 water-director.ts**
  `const WATER_DIRECTOR_TUNING=${JSON.stringify(DIR.WATER_DIRECTOR_TUNING)};`,
  `const WATER_CAMERA_STOPS=${JSON.stringify(DIR.WATER_CAMERA_STOPS)};`,
  // W8 行⑧:球位的滚动插值端点。**唯一定义仍在 presets.ts**,director 那份是拷贝
  `const WATER_ORB_STOPS=${JSON.stringify(DIR.WATER_ORB_STOPS)};`,
  `const WATER_IMPULSE_SCALES=${JSON.stringify(DIR.WATER_IMPULSE_SCALES)};`,
  `const WATER_DIRECTOR_FLAGS_ON=${JSON.stringify(DIR.WATER_DIRECTOR_FLAGS_ON)};`,
  `const WATER_BASE_WIND=${JSON.stringify(DIR.WATER_BASE_WIND)};`,
].join("\n");

/* 相机停靠点的防漂移断言。`water-director.ts` 只许 import type,所以三个 preset
 * 的相机在 run.mjs 与 director 里各写了一遍 —— 不一致时预览台的滚动端点会与
 * 跑分参数悄悄错开,而画面看上去"只是有点不一样"。宁可在这里红着脸失败。 */
for (const [k, stop] of Object.entries(DIR.WATER_CAMERA_STOPS)) {
  const s = PRESETS[k]?.set ?? {};
  const pairs = [
    ["camHeight", "uFieldCamHeight"],
    ["camPitch", "uFieldCamPitch"],
    ["fovY", "uFieldFovY"],
  ];
  for (const [a, b] of pairs) {
    if (s[b] !== undefined && s[b] !== stop[a]) {
      throw new Error(
        `相机停靠点漂移:${k}.${a}=${stop[a]}(water-director.ts) ` +
          `vs ${b}=${s[b]}(golden/w3/run.mjs)`,
      );
    }
  }
}

const b64 = (p) => "data:image/png;base64," + readFileSync(R(p)).toString("base64");
const FRAG = readFileSync(R("golden/w3/preview.frag"), "utf8");

/* 渲染台默认值的浏览器侧副本。**W8 起从 presets.ts 取**(经 run.mjs 转出来),
 * 不再在本文件抄第二遍 —— 只列 preview.frag 里真的声明了的 uniform,缺一个就会
 * 拿到 0,画面直接崩(W1 踩过:纹理尺寸 uniform 被清零 → NaN)。
 * 两色板是 vec3、不是标量,所以不进 presets.ts 的 Record<string, number>;
 * 站点上它们走 globals.css 的 --water-ink / --water-paper,预览台按值内联。 */
const DEFAULTS = {
  ...UNIFORM_DEFAULTS,
  uDitherInk: [0.196, 0.2, 0.102], uDitherPaper: [0.902, 0.996, 0.992],
};

/* 灯球的球位默认值(不是 uniform,是 OrbState 的字段)。三个 preset 的相机几何
 * 差太多,一套球位不可能同时对 —— 见 golden/w3/run.mjs 各 preset 的 orb 注释。 */
const ORB_POSE = {
  x: -0.44, spin: 0.625,
  y: ORB_POSES.mid.screenY, r: ORB_POSES.mid.radiusNdc, worldRadius: ORB_POSES.mid.worldRadius,
};

const META = {
  near: { label: "近景特写", score: "0.859", h: "0.35 m",
    note: "贴着水面,没有地平线。下部三成是风区衰减打出来的静水带 —— 那不是艺术加工,\
是近岸挡风、波长起不来的真实结果。唯一没达标的是墨量:峰值带覆盖率 38.5%,基线 23.7%。\
波脊断裂在这个构图下会让覆盖率飙到 78%,所以 near 没开。" },
  mid: { label: "中景带远岸", score: "0.913", h: "1.60 m",
    note: "隔湖看对岸。横向暗划线是波面斜率把反射方向扫过环境列里那条岸线边界的结果。\
上部原本是一片贯穿全幅的平行横线(像梳子),靠**波脊断裂**打断成随机长度的划 —— \
分数因此从 0.951 掉到 0.913,但对着实拍照看是明确的改善。" },
  night: { label: "夜景地平线", score: "0.930", h: "4.00 m",
    note: "奥伯拉丁那一档。地平线原来是一条刀切的实心白板,月光路径是一坨饱和的白柱 —— \
根因是 tonemap 对比度 8.0 把所有像素顶到 0 或 1,抖动没有中间调可用。压到 2.5 之后\
才有那片溶解的网点带;再加地平线起伏与波脊断裂,边界才错落起来。" },
};

/* [uniform, 名称, 说明, min, max, step, 单位] */
const SLIDERS = [
  ["uFieldChop", "波脊断裂", "0 = 长波脊(梳子);1 = 全量断裂。这次改动的主角", 0, 1, 0.05, ""],
  ["uFieldChopLen", "断裂尺度", "沿波脊方向多长断一次(米)。mid 0.85 / night 3.0", 0.1, 4, 0.05, "m"],
  ["uFieldChopBias", "断裂疏密", "存活阈值。>0.5 = 空隙比划长(实拍就是这样)", 0.35, 0.8, 0.01, ""],
  ["uShadeHorizonJitter", "地平线起伏", "把地平线切成一段段错开的台阶。只在夜景看得出", 0, 0.012, 0.0005, ""],
  ["uShadeSkyGlowGain", "天空辉光", "地平线上方那片溶解的网点带。只加在天空像素上", 0, 1.5, 0.05, ""],
  ["uShadeSkyGain", "天空粒子", "高空网点的密度。只缩放天空的环境列,不动辉光那层", 0.3, 1.4, 0.01, "×"],
  ["uFieldWander", "方向摆动", "波脊弯折幅度。0 = 梳子;0.45 起会拉出贯穿全幅的直划", 0, 0.6, 0.01, "rad"],
  ["uFieldSpread", "方向散布", "波向在风向两侧展开的半角。越小越平行,划线越长", 0.05, 0.6, 0.01, "rad"],
  ["uFieldSpectralSlope", "谱斜率", "a ∝ λⁿ。调小把振幅推向短波 —— 实测只会让墨变多,不会变细", -0.4, 1.6, 0.05, "n"],
  ["uFieldAmp", "波幅总量", "所有分量的振幅缩放。对比度对它几乎是阈值不是比例", 0.2, 3, 0.05, "×"],
  ["uFieldPatchMin", "镜面区波幅", "风阵斑块里最静那块还剩多少波。0 = 纯镜面", 0, 1, 0.02, "×"],
  ["uFieldPatchDrift", "斑块飘移", "0 = 斑块钉住不动;0.03 ≈ 20 秒走一个斑块", 0, 0.12, 0.005, "/s"],
  ["uFieldFetchLen", "风区长度", "离岸多远波才长起来。前景那条静水带的宽度", 0, 12, 0.25, "m"],
  ["uFieldLodBias", "LOD 提前量", "越大越早淡出 → 远端越平,能量转进 σ²", 0.4, 8, 0.2, "×"],
  ["uShadeContrast", "显示对比度", "tonemap 的硬度。1-bit 下前景靠它压到饱和", 2, 16, 0.5, ""],
  ["uShadePivot", "对比度支点", "夜景必须压低,否则暗天空被顶到中灰", 0.1, 0.8, 0.005, ""],
  ["uDitherAniso", "抖动各向异性", "阈值图在 x 向压缩 → 墨点连成横划。near 要 0", 0, 1, 0.05, ""],
  ["uDitherPixel", "抖动单元", "墨点尺寸(物理像素)", 1, 5, 1, "px"],
];

const ORB_SLIDERS = [
  ["orbEnergy", "灯球 energy", "0..1 总闸门。**0 时水面必须一点残光都没有**", 0, 1, 0.02, ""],
  ["orbX", "球心 x", "NDC。拖它看光斑同帧跟随(没有插值、没有回读)", -1, 1, 0.01, ""],
  ["orbY", "球心 y", "NDC。越高 = 球离水面越高;mid/near 的地平线在画面外,顶到 0.9 就是极限", -0.5, 0.95, 0.01, ""],
  ["orbR", "球屏幕半径", "NDC 纵向半高为单位。**越小 = 球越远 = 光斑落得越远**", 0.03, 0.4, 0.005, ""],
  ["orbWorldRadius", "球世界半径", "米。和屏幕半径一起定出球心的世界坐标 —— 少了它无解", 0.05, 3, 0.05, "m"],
  ["orbSpin", "自转相位", "0..1,与 ball-loop 帧号同相。拖它看光斑绕着转", 0, 1, 0.005, ""],
  ["uFieldOrbPatchGain", "波幅增益", "灯球照到的地方水更「活」。**调的是波幅不是亮度**", 0, 1.5, 0.05, ""],
  ["uOrbBodyGain", "漫射池增益", "光斑落点进 (1-F)·body 的那一路。**W11a 把 night 标到 6.0**", 0, 12, 0.1, ""],
  ["uOrbSpecGain", "镜面光路增益", "球在水里的像被波面打散的那一路,进 F·spec", 0, 8, 0.1, ""],
  ["envOrbGain", "环境注入", "球倒影/光晕注入环境列。**near 必须 0**,它的注入仰角压在岸线边界上", 0, 0.3, 0.005, ""],
  ["envMoonHalo", "月晕", "夜景月亮周围那片溶解的网点晕(env-column.ts 的 NIGHT_MOON_HALO)", 0, 0.12, 0.005, ""],
];

/* ── W11a night 主光池 ──────────────────────────────────────────────────────
 * 「镜片斑之外那份球体本身泼下来的弱光」。**只有 night 的增益非零。**
 *
 * 拖「主光池强度」到 0 就是 W5 那一版:22 个离散斑,画面上只改到 0.13% 的
 * 像素,肉眼几乎读不出来 —— 那正是用户说「照射效果不明显」的那一版。
 * 池心不是旋钮:它每帧从 computeOrbUniforms 的 center 取,所以**拖「球心 x」
 * 池子会同帧跟着走**,那一条正好证明池子在世界空间里,不是贴屏幕的椭圆。 */
const POOL_SLIDERS = [
  ["uOrbPoolGain", "主光池强度", "峰值照度,量纲同 uOrbSpots 的 w。0 = 退回 W5 的纯镜片斑", 0, 0.12, 0.002, ""],
  ["uOrbPoolRadius", "主光池半径", "米,横向(垂直视线那一轴)。night 标 20 m", 2, 60, 0.5, "m"],
  ["uOrbPoolFlat", "主光池平顶", "d < 它的部分恒为 1.0,到 1 之间是三次裙边 —— 1-bit 下裙边就是那圈溶解网点", 0, 0.95, 0.01, ""],
  ["uOrbPoolFar", "池远侧拉长", "沿视线往地平线方向拖多长。参考图里「光在水上是一道竖着的路」", 0.3, 6, 0.1, "×"],
  ["uOrbPoolNear", "池近侧拉长", "**必须 <1**。拖到 2.6(和远侧一样)看前景平坦度怎么崩", 0.2, 3, 0.05, "×"],
];

/* ── W10 mid 聚焦 ───────────────────────────────────────────────────────────
 * **这是唯一能判断这张卡对不对的东西。** 五个旋钮:闸门 + 池半径 + 池外亮度 +
 * 碎粒频率 + 远景保护。碎粒阈值(uOrbGrainBias)故意不在这里 —— 它和碎粒频率
 * 是同一件事的两个面,拖一个就够,五个滑块已经够多了(站点面板上有全部六个)。
 *
 * `uOrbGround` 也不是旋钮:它是球心的落点,每帧从 computeOrbUniforms 的
 * center 直接取(见 applyOrb),所以**拖上面「球心 x」光池会跟着走**
 * —— 那一条正好证明池子是世界空间的,不是贴在屏幕上的椭圆。 */
const FOCUS_SLIDERS = [
  ["uOrbFocus", "聚焦闸门", "0 = 展示态(与黄金帧逐字节相同);1 = 聚焦态。**只有 mid 有**", 0, 1, 0.01, ""],
  ["uOrbPoolR", "池半径", "米。世界空间量 —— 近边宽、远端压扁是逆投影自己给的", 0.6, 8, 0.1, "m"],
  ["uOrbAmbient", "池外亮度", "乘在 body 上的残留系数。0.58 ⇒ 有效 body 0.62×0.58 = 0.36", 0.2, 1, 0.01, "×"],
  ["uOrbGrain", "碎粒频率", "1/米。迪斯科球把光打碎成一地亮斑,池子内部不是一块均匀的亮", 0.2, 8, 0.1, "/m"],
  ["uOrbFarKeep", "远景保护", "远处只压到这个比例。**拖到 1 试试** —— 整条对岸带会死成纯墨", 0, 1, 0.01, ""],
];

/* 涟漪那一组。key 前缀 `rip` 的不是 uniform,是求解器的构造/冲击参数。 */
const RIPPLE_SLIDERS = [
  ["uRippleAmp", "涟漪幅度", "消费端增益。1.0 只翻动 0.03% 的像素,要 4.0 才看得出", 0, 10, 0.25, "×"],
  ["ripSpeed", "波速 c", "米/秒。mid 是 10cm 毛细-重力波 0.45;night 是 2m 重力波 2.0", 0.1, 4, 0.05, "m/s"],
  ["ripDamping", "阻尼", "每步乘一次。0.997 → 10 秒衰减到 2% 以下", 0.99, 0.9995, 0.0005, ""],
  ["ripStrength", "冲击强度", "点一下水面丢多大的坑(米)", 0.001, 0.08, 0.001, "m"],
  ["ripRadius", "冲击半径", "米。**必须跟着 preset 的尺度走**:mid 0.15,night 2.5", 0.04, 4, 0.05, "m"],
  ["uRippleLodBias", "涟漪 LOD", "越大越早淡出。远处一个像素跨很多纹素,不淡会闪成噪点", 0.4, 6, 0.1, "×"],
];

/* ── W7 交互编排 ────────────────────────────────────────────────────────────
 * 耦合矩阵每一条一个开关,key 就是 `WaterDirectorFlags` 的字段名。
 * 关掉之后画面/行为的差别写在第三列 —— 这是给拖的人看的,不是给我自己看的。 */
const DIRECTOR_ROWS = [
  ["pointerRipple", "① 指针划水 → 涟漪",
    "关掉:鼠标划过水面不再起任何波,只剩点击。开着:>0.15 px/ms 才注入,40 ms 一发"],
  ["orbHoverEnergy", "② 悬停灯球 → energy",
    "关掉:energy 钉在静息值,把鼠标移到球上什么也不发生。开着:ζ=0.8 ω=12 弹到 1.45,尾巴有轻微过冲"],
  ["orbFollow", "③ 球位 → 光斑路径",
    "关掉:光斑与球**同帧**硬跟,拖球扫掠时光斑一步到位。开着:20 ms 一阶滞后,快扫时读得出 Δx"],
  ["scrollCamera", "④ 滚动 → 相机",
    "关掉:相机钉死在区间起点(夜景 4.00 m),拖滚动条画面纹丝不动。开着:阻尼 0.12/帧@60 追过去"],
  ["clickImpulse", "⑤ 点击 → 大冲击 + 曝光",
    "关掉:点画布什么都不发生。开着:一发大冲击 + 60 ms 冲起来、τ=0.6 s 落回去的曝光提亮"],
  ["idleWind", "⑥ 静置 >4 s → 降风",
    "关掉:风速恒为 1.00。开着:停手 4 s 后 30 秒缓降到 ×0.60,一动鼠标 6 秒回满"],
  ["orbExit", "⑦ 退场 → energy → 0",
    "关掉:「触发退场」按钮不起作用。开着:800 ms ease-out 把 energy 拉到 0,水面光归零"],
  ["orbScrollPose", "⑧ 滚动 → 球位",
    "关掉:球位只听时间线(= W7 的行为),从夜景滚到 mid 时光斑全落到画框外、灯直接熄。" +
    "开着:worldRadius 等比、screen.y 线性,跟相机共用同一个滚动进度量。" +
    "**这一条关掉后上面那几个球位滑块才拖得动**"],
  ["orbDrag", "⑩ 拖拽灯球 → 球位偏移 + 弹簧回位",
    "关掉:按住球拖动没有任何反应(而且会退化成往水里砸一发冲击)。" +
    "开着:偏移 1:1 跟指针、夹在 ±0.35/±0.25 NDC 的矩形里,松手 ζ=0.8 ω=12 弹回。" +
    "**拖动中不注入涟漪** —— 球对水是辐射度的不是力学的(设计原则①)"],
  ["orbExitRetreat", "⑪ 退场 → 光池后退收回海岸线",
    "关掉:点「触发退场」只是整片光一起变暗(= W7 的行为)。" +
    "开着:池心沿视线退到 4 倍距离、半径缩到 35%,而且**后退跑在变暗前面** " +
    "(retreat 半程走 75%,energy 半程只剩 25%)——否则池子还没挪就黑了"],
];

/* 滚动滑块。key `dirScroll` 不是 uniform,是 `WaterDirector.setScroll()` 的目标值。 */
const DIR_SLIDERS = [
  ["dirScroll", "滚动进度", "0 → 1 映射区间的两端;拖完松手看阻尼追过去(HUD 里是实时相机高度)", 0, 1, 0.01, ""],
];

const ABLATE = [
  ["patch", "风阵斑块", { uFieldPatchMin: 1.0, uFieldPatchMax: 1.0 }],
  ["tail", "长尾划线", { uFieldTail: 0.0 }],
  ["wander", "方向摆动", { uFieldWander: 0.0 }],
  ["chop", "波脊断裂", { uFieldChop: 0.0 }],
  ["hz", "地平线起伏", { uShadeHorizonJitter: 0.0, uShadeSkyGlowGain: 0.0 }],
  ["orb", "灯球(全部三条通道)", { orbEnergy: 0.0 }],
  ["focus", "聚焦渐晕", { uOrbFocus: 0.0 }],
  ["pool", "主光池(W11a)", { uOrbPoolGain: 0.0 }],
  ["ripple", "涟漪", { uRippleAmp: 0.0 }],
];

/* 三个 preset 的灯球默认值。增益来自 presets.ts 的 `orb` 块,球位来自
 * `WATER_PRESET_ORB_POSES` —— W8 把球位拆出去当滚动插值的端点了,
 * 这里按预览台滑块认识的名字(y / r / worldRadius)拼回去,不另抄数。 */
const ORB_PRESETS = Object.fromEntries(
  Object.entries(PRESETS).map(([k, v]) => [k, {
    ...(v.orb ?? {}),
    y: ORB_POSES[k].screenY,
    r: ORB_POSES[k].radiusNdc,
    worldRadius: ORB_POSES[k].worldRadius,
  }]),
);

const DATA = {
  FRAG, PRESETS, META, SLIDERS, ABLATE, DEFAULTS,
  ORB_SLIDERS, ORB_PRESETS, ORB_POSE, INLINE_JS, RIPPLE_SLIDERS, FOCUS_SLIDERS, POOL_SLIDERS,
  /* 每个 preset 的主光池定标(near/mid 是 null = 不开池)。**唯一定义处是
   * presets.ts 的 NIGHT_POOL**,这里只是转出来。`MOON_LIT` 同理:满能量时
   * 月光镜面增益让到多少,null = 不让位。 */
  POOL_PRESETS: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.pool ?? null])),
  MOON_LIT: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.orb?.moonSpecGainLit ?? null])),
  /* 每个 preset 的聚焦定标(near/night 是 null —— 那两个本卡不动)。
   * **唯一定义处仍是 presets.ts 的 MID_FOCUS**,这里只是转出来。 */
  FOCUS_PRESETS: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.focus ?? null])),
  DIRECTOR_ROWS, DIR_SLIDERS, DIR_TUNING: DIR.WATER_DIRECTOR_TUNING,
  RIPPLE_PRESETS: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.ripple ?? null])),
  ORB_CFG: ORB.DEFAULT_ORB_LIGHT_CONFIG,
  ENV_PRESETS: ENVC.ENV_PRESETS,
  ENV_LUT: { size: ENVC.ENV_LUT_SIZE, scale: ENVC.ENV_LUT_SCALE, min: ENVC.ENV_LUT_MIN, max: ENVC.ENV_LUT_MAX },
  MOON_HALO: ENVC.NIGHT_MOON_HALO,
  NOISE: b64("public/water/blue-noise-128.png"),
  ENV: { mid: b64("golden/w3/env-mid.png"), near: b64("golden/w3/env-near.png"), night: b64("golden/w3/env-night.png") },
};

const HTML = readFileSync(R("scripts/water-preview.tpl.html"), "utf8")
  .replace("/*__DATA__*/null", JSON.stringify(DATA));

writeFileSync(OUT, HTML);
console.log(`  → ${OUT}  (${(HTML.length / 1024).toFixed(0)} KB)`);
