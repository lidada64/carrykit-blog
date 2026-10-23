# 灯球照水 · 耦合协议 (W5)

> 状态:2026-09-04 完成。分支 `feat/water-orb`。
> 相关:`src/components/lab/water/contract.ts`(唯一共享文件)、`light.glsl.ts`、
> `orb-light.ts`、`env-column.ts`、`docs/blender-assets.md` B-4、
> `docs/water-reference-metrics.md`(权威标尺)。

---

## 1. 为什么是一条极窄的单向通道

迪斯科灯球必须留在 **DOM**:`docs/homepage-animation-plan.md` 的 **HR-8**(反色凹槽)
靠 `mix-blend-mode: difference` 作用在球的 `<img>` / sprite 元素上,而 WebGL canvas
是不可混合的。水必须在 **WebGL**:逆投影、波场、菲涅耳分层、1-bit 抖动都在片元里。

两层之间只允许一条通道:每帧 DOM 侧**写**一个 `OrbState`,WebGL 侧**读**。

- **零回读**:没有 `getBoundingClientRect()` / `offsetWidth` / `getComputedStyle()`。
  球心位置来自 GSAP 时间线的插值量,不是量出来的。计划 §5 的预算是
  主线程 JS <2ms、Layout/Repaint = 0,一次强制回流就没了。
- **零同步**:水不回答球任何问题,所以可以 scrub、可以定格、可以只渲一帧。
- **一个总闸门**:`energy`。

---

## 2. 三条通道,各管各的

灯球对水做三件不同的事,走三条完全不同的路径。**混在一起做就是"在 tonemap
前后加一坨平的亮度"**,那会把 W3 那条单峰对比度曲线打断(见 §4)。

| 通道 | 入口 | 进哪一项 | 谁算的 |
|---|---|---|---|
| ① **波幅** | `orbPatch(p, t)` | `waterPatchAmp` 里按 `uFieldOrbPatchGain` 相加 | shader,单团核 |
| ② **照度** | `waterOrbIrradiance(p)` | `(1-F)·(body + BodyGain·E)` | shader,K 次核求和 |
| ③ **镜面** | `waterOrbSpecular(N,V,L,σ²)` | `F·(env + spec + SpecGain·D)` | shader,一次 Beckmann |
| ④ **环境** | `EnvColumnParams.lights` | `env`(重建 LUT) | **CPU**,不进 shader |

分层链一个字没改:

```glsl
lum = (1.0 - F) * (uShadeBody + orbBody) + F * (env + spec + orbSpec);
```

### ① 波幅:调的是波幅,不是亮度

用户的构想是"灯球照到的地方水面既更亮、也更**活**"。"活"这一半走这里。

`orbPatch` 返回**波幅增益**。波幅高 → 斜率大 → 反射方向扫得过环境列的岸线边界 →
那片水自己就出现更多暗划线。反过来,波幅低 → 斜率小 → 扫不过边界 → 自己变亮变平。
**直接调亮度会把这条链打断**(field.glsl.ts 文件头写死的物理)。

**故意不逐镜片**:`waterPatchAmp` 本身就是"哪片水面起风"那一层(米级),
分米级的镜片光斑在这一层没有意义。CPU 给出所有光斑的强度加权**质心 + RMS 展布**,
shader 里画一团就够 —— 省掉第二次 K 循环。

### ② 照度:光斑落点是**漫射**的

光束打进水体、被散射出来,所以进 `body` 项,乘 `(1-F)`。
`E(p)` 是位置相关的,这就是 `waterShadeSurface` 在 W5 多了第四个参数 `vec2 p` 的原因。

### ③ 镜面:球的**像**,不是光斑的落点

> 这一条走了弯路,记下来。

第一版把镜面项乘上了 `E(p)`,理由是"镜片光斑在水面的镜面反射"。**错的。**
光斑落在 A 点,它在 A 点的镜面反射方向是 `reflect(-L, N)`;对近乎水平的水面来说
这条反射光朝**远离相机**的方向走了。实测 `dot(N,H) ≈ cos45°`,而水面斜率的 p99
只有 0.12(7°),`exp(-tan²/σ²)` 直接是 0 —— 那一版无论把增益开到多大,
画面上一个像素都不会变(用 md5 对照确认过)。

正确的物理:镜面项是**球本身(及其镜片)在水里的像**被波面打散成的一条光路,
和月光路径同一个机制,出现在球的**镜像方向**上。所以只按球心方向算一次,不乘 `E(p)`。

### ④ 环境:倒影与光晕走 LUT 注入,shader 不写代码

环境列是"无穷远环境沿仰角的一条辐射亮度分布"。球在水里的倒影、天空里的光晕,
本来就是这条分布上多出来的一个高斯亮斑 —— 所以往 `EnvColumnParams.lights`
里塞一项、重建 LUT 就完了,不需要任何解析式。

注入仰角取"从相机看它在水里的像"那个方向:镜像相机在 −camHeight,
反射线仰角 = `atan((camHeight + h) / D)`。

**这是近似**:环境列不含方位角,所以注入出来是一条**横贯全画面**的亮带,
而真正的倒影只在球的正下方。近场的细节由 ① ② ③ 负责,这一项只负责那圈软晕。

---

## 3. OrbState —— 每个字段从哪来、什么时候更新

定义见 `contract.ts`。全部在 rAF 里一次写入。

| 字段 | 来源 | 更新时机 |
|---|---|---|
| `screen` | GSAP 时间线上球的 x/y 插值量 → NDC | 每帧 |
| `radiusNdc` | 时间线上的 scale × 基准半径 | 每帧(HR-8 咬合时在变) |
| `energy` | 入场 / 退场 / hover 的时间线通道 | 每帧 |
| `spinPhase` | `ball-loop` 的播放进度 0..1 | 每帧 |
| `lightmapFrame` | `Math.floor(spinPhase * 120)` | 派生 |
| `worldRadius` | 场景常量(**计划 §3 之外新增**) | 一般不变 |

### 为什么必须有 `worldRadius`

`screen` + `radiusNdc` 只给出球在**视锥里的方向与张角**。要让光束和 y=0 的水面
求交,必须知道球心到相机的**真实距离**:

```
α    = atan(radiusNdc · tan(fovY/2))     球的角半径
dist = worldRadius / sin(α)
球心 = 相机位置 + dist · 视线方向
```

少了 `worldRadius` 这一步无解。放在 per-frame 的 `OrbState` 而不是场景常量里,
是因为 HR-8 的"缩小 / 咬合"是 CSS scale:屏幕半径在变,到底读成
"球在远离"(worldRadius 不变)还是"球在原地变小"(worldRadius 跟着变),
该由发布器决定 —— 两种都表达得了。

### 这条几何在三个 preset 上完全不同,不要指望一套球位

| preset | 相机 | 可见水面的距离 | 球位(演示值) | 球心解出来 |
|---|---|---|---|---|
| near | 0.35 m / 俯 0.335 | 0.5 – 6.0 m | y 0.80, r 0.16, R **0.07** | 1.5 m 外、水面上 0.18 m |
| mid | 1.6 m / 俯 0.37 | 2.0 – 24.4 m | y 0.80, r **0.10**, R 0.22 | 6.8 m 外、水面上 0.76 m |
| night | 4.0 m / 抬 0.14 | **24.3 m 起** | y 0.42, r 0.16, R **1.8** | 33 m 外、水面上 13.4 m |

两个必须知道的后果:

- **mid / near 的地平线在画面外**(ndc.y = 1.234 / 1.227),所以画面里**任何**位置
  都在地平线以下 —— 球只能是"低低地悬在水面上",而且**视线向下,球越远越低**。
  worldRadius 给大了会把球心解到水面以下(near 用 0.22 就是负高度)。
- **night 的可见水面从 24.3 m 才开始**。第一版给 night 的球 0.35 m 半径,
  解出来只有 6.5 m 远、5.8 m 高,光斑全落在画框下缘之外 ——
  **三条通道加起来一个像素都没改到画面**,而分数一位不差(0.930)。
  这是"分数只能证伪不能证真"的又一个实例。

---

## 4. `energy` 是总闸门:0 = 逐字节相同

`energy === 0` 时:

- CPU 侧 `computeOrbUniforms` 直接返回全 0 的 `spots`、`envLight: null`
  —— 环境列 LUT 与灯球接入前**逐字节相同**;
- shader 侧 `waterOrbIrradiance` / `waterOrbSpecular` / `orbPatch`
  **第一行就 `if (uOrbEnergy <= 0.0) return 0.0;`**,精确返回 `0.0` 而不是"很小的数"。

于是上游的 `uShadeBody + 0.0`、`env + spec + 0.0`、
`amb + uFieldOrbPatchGain * 0.0` 在 IEEE 下逐位不变。

**这不是"差不多看不见",是 md5 逐字节相同**,见 §5。

---

## 5. 回归测试(硬性)

```bash
# 灯球全关 —— 必须与 W4 定稿的黄金帧逐字节相同
for p in near mid night; do node golden/w3/run.mjs $p --time 2.5 --out /tmp/$p.png; done
md5sum /tmp/{near,mid,night}.png golden/refine/{near,mid,night}-t2.5.png
```

2026-09-04 实测(三对全部相同):

| preset | md5 |
|---|---|
| near | `4add2a379d1c5c496fab2c209f968ab6` |
| mid | `2644c60d6ff7826839c8e572150f50b0` |
| night | `406fab322603b07ab4a9371807bca4f8` |

**为什么分数相同不够**:`docs/water-reference-metrics.md` §11 坑 7 —— 一整轮扫参
跑出六个完全相同的 md5,原因是着色器产物没重建。分数没变和分数变了一样需要解释。
所以本卡每一轮扫参都打 md5,`.png` 相同就说明参数根本没生效。

附带的第二条证据:`golden/w5/w5-night-e0.0-t2.5.png` 与
`golden/w5/w5-night-halo-only-t2.5.png` 的 md5 也**完全相同**
(`edf3bb5ff38813f88d48900bc898ba12`)—— 开着月晕、把 energy 拉到 0,
灯球那三条通道一点残留都没有。

---

## 6. 模式 A / B

`uOrbLightMode`:`0` = A(程序化),`1` = B(预渲染照度序列)。**共用同一组 uniform。**

### 模式 A(本卡的主力)

球面上 `facetCount = 64` 片镜子(球面 Fibonacci 点阵,确定性),
对主光求反射,与 y=0 求交:

```
镜片 i 被照到 ⟺ L·n_i > 0            L = 指向主光的单位向量
反射方向      d = 2(L·n_i)n_i − L
打到水面      d.y < 0,光程 t = h / (−d.y)
光斑中心      球心水平位置 + t·d.xz
光斑半径      spotSpread · t          spotSpread = 镜片尺寸/球半径 = 0.12
峰值强度      cosθ_L · |d.y| · h² / t²
自转          全部法线绕竖直轴转 spinPhase·2π
```

**K 个光斑中心与强度全部在 CPU 上算好**(`orb-light.ts`,每帧 O(facetCount)),
以 `uOrbSpots[24]` 传进去;shader 里只做 24 次核求和。三角函数与球面取样每帧一次,
不是每像素 24 次。

选取:算完 64 片,按强度降序取前 24,其余槽位强度写 0。
**这不是零跳变**:强度在集合边界上本来就趋于 0(掠射时 |d.y|→0、远处 1/t²→0、
背光面 cosθ_L≤0),被挤掉的永远是最暗的那几个,但第 24 名换人时理论上有一次
不连续。实测 64 片里同时满足三个条件的是 22 片,**从来没顶到 24 这个上限**,
所以当前配置下不会发生。改大 facetCount 时要重新确认。

### 模式 B(本卡只定接口)

采样 `ball-waterlight` 照度序列(sprite sheet),帧号 = `floor(spinPhase*120)`,
按场坐标映射到 `uOrbLightmapRect` 指定的矩形。

**这张纹理还不存在**(`docs/blender-assets.md` B-4 未渲)。所以 B **必须优雅回落到 A**:

```glsl
if (uOrbLightMode == 1 && uOrbLightmapSize.x >= 1.0) { ...B... }
return uOrbEnergy * waterOrbSpotSum(p);   // 回落 A
```

判**尺寸**不判采样值 —— 未绑定的 `sampler2D` 在 WebGL2 里采出来是 `(0,0,0,1)`,
那和"这里没光"分不开。渲染台不绑纹理时 `uOrbLightmapSize` 是 `(0,0)`,自动走 A。

### A/B 相关性 ≥0.7:**未验证**

B 的资产不存在,没法量。**不编数字。**
能做的只有把参数对齐:`facetCount = 64`、主光仰角 `0.95` rad、方位角 `-0.7` rad
已写进 `docs/blender-assets.md` B-4,Blender 那边照着渲。

---

## 7. 三个 preset 的实测与代价

灯球全开(演示球位,t=2.5s)对照 W4 定稿:

| preset | 定稿 | 灯球全开 | 照度通道改到的像素 |
|---|---|---|---|
| near | 0.859 | **0.862** | 3769(0.18%) |
| mid | 0.913 | **0.924** | 20068(0.97%) |
| night | 0.930 | **0.917**(含月晕) | 16487(0.80%) |

### near:两个悬崖

| 旋钮 | 安全值 | 越过之后 |
|---|---|---|
| `uFieldOrbPatchGain` | **0.30** → 覆盖率 38.2 / 峰值带 5 | **0.45** → 覆盖率 72.6 / 峰值带 **3**,总分 0.810 |
| `uOrbBodyGain` | **1.5** → 覆盖率 38.2 | **4.0** → 覆盖率 72.8,总分 0.810 |
| `envGain` | **必须 0** | 0.04 就把峰值带打到 3、覆盖率打到 73.5 |

`envGain` 那一条是 §9 坑 9 的同类:near 的注入仰角解出来是 **0.328**,
而 near 的岸线边界在 **0.36**、过渡带 ±0.04 —— 注入的高斯**正好压在产生暗划线的那条边上**,
等于全画面改环境列。只开这一项、三条着色通道全关就足以把分数打掉。

`uFieldOrbPatchGain` 那一条和 `docs/water-reference-metrics.md` §13.1
"near 一加波脊断裂覆盖率就从 38.5 飙到 78" 是同一个悬崖:near 的构图对波幅
极其敏感。

### mid:光斑得先落对地方

`radiusNdc` 0.16 时球只有 4.2 m 远,光斑落在 3~8 m,而 mid 的暗划线带在 8~24 m
—— 光斑几乎全落在"本来就是饱和白"的前景上,照度通道只改到 **817 个像素(0.04%)**。
退到 0.10 → 光斑落进暗划线带,改到 **20068 个(0.97%)**。0.08 更远(52k / 2.51%)
但总分掉到 0.911,取 0.10。

`uOrbBodyGain` 要到 **3.0**:mid 的 tonemap 是 contrast 8 / pivot 0.48,
前景早被顶成饱和白,光斑只能在暗划线里显形 —— 那里 F≈0.43,
`(1-F)·gain·E` 要 >0.11 才把一条暗划翻成白。**这是显示量纲,不是物理亮度**
(同 `uShadeSpecGain = 1e4` 的道理)。

### night:0.930 → 0.917,降在前景平坦度

掉的 0.013 全在 `foregroundFlatness`(0.045 → 0.16)。**这是预期的,而且是对的**:
这一项量的是"末两带展度 / 峰值带展度",而灯球的光斑正好落在末两带。
`docs/water-reference-metrics.md` §4 坑 1 已经写明:

> **灯球在水面投下的光斑不该被算作「前景不平」的证据。**
> 光斑该亮,环境水面该静,两者并存才是对的。

标尺没有把这两件事分开的能力(它只做 40 分位数,挡得住一条窄光路,挡不住
一片光斑)。所以这 0.013 我认下来,不为了它去关光斑。

拆开看:只开月晕不开灯球 = **0.930**(一分不掉);只开灯球不开月晕 = 0.930;
两个一起 = 0.917。是二者叠加把末两带的展度顶上去的。

---

## 8. 顺手做掉的:夜景月晕(§13.3 的遗留)

参考图 `docs/water-refs/obra-dinn.jpg` 里月亮周围有一大片**溶解的网点光晕**,
我们的天空一直是均匀渐变。这本来就该由"往环境里注入一个光源"来做,
所以夜景的月亮就当灯球的特例,走同一个 `EnvColumnParams.lights`。

`env-column.ts` 的 `NIGHT_MOON_HALO`:`sinElev 0.179`(= sin(uShadeLightElev),
必须罩在月光路径的源头上)、`width 0.075`、`gain 0.04`。

实测代价(基线 前景平坦度 0.045 / 总分 0.930):

| gain, width | 前景平坦度 | 总分 |
|---|---|---|
| 0.055, 0.085 | 0.159 | 0.918 |
| **0.04, 0.075** | **0.130** | **0.930** |
| 0.03, 0.10 | 0.141 | 0.927 |

所以"月晕在 0.179 仰角上、掠射的水面采不到"这句话是**错的** —— 采得到,
前景平坦度从 0.045 抬到 0.13,只是在 0.04 这一档还没抬破门槛。要再宽再亮就必须
像 `uShadeSkyGlowGain` 那样改成只作用于天空像素。

### §13.4 那道天顶横向接缝:改善了,没消掉

那条缝是 tonemap 输出被 clamp 到 0 的位置(以上一个网点都没有,以下突然开始有)。
月晕把天空整体抬亮,**clamp 点从画面 53% 高度上移到 29%、而且梯度平缓得多**,
肉眼上从"一刀切"变成"渐渐没了"。但它仍然存在。要彻底消掉得改环境列的天空渐变
曲线(`skyHorizon → sky`),那会同时改水面反射到的环境 —— 仍然留给 W8。

---

## 9. 成本

预算 0.4 ms @1080p(计划 §5 的 water pass 5 ms 里分给灯球的那一份)。

**每像素**:

- shade 里 1 次 `K=24` 的核求和 —— 每个约 8 flop(减、缩放、点积、`1-d²`、三次方),
  合计 ~200 flop;
- shade 里 1 次 Beckmann(1 个 `exp`);
- field 里 1 次单团核(~10 flop)。

**循环上界是编译期常量**(`for (int i = 0; i < 24; i++)`),不是动态循环。
未用的槽位强度写 0,照样跑但不贡献。

核函数用 `(1-d²)³` 的**紧支撑多项式**而不是高斯,三个理由:

1. 没有 `exp`:24 个高斯 × 2M 像素 = 5e7 次超越函数,吃光预算;
2. 紧支撑:`d>1` 精确为 0,不会在远处留一层抬高整幅画面的地板 ——
   那层地板在 1-bit 抖动下会变成一片糊掉的中灰(§9.2「天空中灰」同类病);
3. 边缘是三阶接触,比高斯的长尾更容易在 1-bit 下抖出干净的溶解带。

**每帧 CPU**:`computeOrbUniforms` 是 O(facetCount)= 64 次向量运算 + 一次排序,
外加一张 256 字节的 LUT 重建。远在"主线程 JS <2ms"之内。

> ⚠️ **真实 GPU 帧时间未测。** 本容器没有显卡(SwiftShader 软件光栅),
> `--cost` 只能做路线之间的相对比较。绝对值归 W9,要在有显卡的机器上用
> `EXT_disjoint_timer_query_webgl2` 量。

---

## 10. 拼装顺序与那一处前向声明

```
HEAD + FIELD + LIGHT + SHADE + DITHER + TAIL
```

`waterPatchAmp`(在 FIELD 里)要调 `orbPatch`(定义在 LIGHT 里),所以
`field.glsl.ts` 留的是**前置声明** `float orbPatch(vec2 p, float t);`
(GLSL ES 3.00 支持),定义在 `light.glsl.ts`。

为什么不把 LIGHT 提到 FIELD 前面:LIGHT 用的是 FIELD 的世界坐标约定,
而 SHADE 又要用 LIGHT 的照度 —— 一条链上只允许有一处前向声明,放在最上游最省事。

`light.glsl.ts` **自带一份 Beckmann**,不复用 `shade.glsl.ts` 的 `waterSpecular()`:

1. 拼装顺序上 LIGHT 在 SHADE 之前,借不到;
2. 灯球和月亮是两个不同的光源,立体角与饱和上限本来就该各自一份;
3. 最要紧的一条 —— 动 `waterSpecular()` 的表达式会改变浮点求值顺序,
   §5 的逐字节回归立刻挂掉。

---

## 11. 立体角必须算,不许拍常数

`uOrbOmega` = 球在水面处张开的立体角 = `πR²/d²`,**CPU 每帧算**。

第一版把它拍成 `3e-4`,而夜景的球在 36 m 外实际是 `7.9e-3` —— 差 26 倍,
结果 `uOrbSpecGain` 要开到 **600** 才看得见。那说明旋钮的量纲错了,
不是画面需要那么亮。算成几何量之后,`uOrbSpecGain` 回到 O(1)(0.5~2.5)。

这和 `shade.glsl.ts` 那条"Beckmann 必须乘光源立体角"是同一条 ——
W1 漏了它,近场直接烧成全白。

---

## 12. 预览台

```bash
node golden/w3/run.mjs mid --noscore          # 顺带重建 preview.frag
node scripts/gen-water-preview.mjs            # → /tmp/water-preview.html
```

灯球那一组 11 个滑块:energy / 球心 x,y / 屏幕半径 / 世界半径 / 自转相位 /
波幅增益 / 漫射池增益 / 镜面光路增益 / 环境注入 / 月晕。消融条多了一个「关 灯球」。

**预览台跑的是和黄金帧同一份 CPU 代码**:生成脚本用
`Function.prototype.toString()` 把 `orbFacetNormals` / `orbWorldCenter` /
`computeOrbUniforms` / `envColumnValue` / `buildEnvColumnLut` 的源码**原样内联**
进 HTML(Node 22 原生擦除 TS 类型,`toString()` 直接给出合法 JS)。
代价是这几个函数必须**自足**:只调用彼此与内置对象,不引用模块作用域的其它符号。
`orb-light.ts` 与 `env-column.ts` 的文件头都写了这条约束;
`orb-light.ts` 还**只许 `import type`**,否则裸 node 解析不了省略扩展名的值导入。

环境列在预览台里是**每帧现算**的(1×256 R8,256 字节上传),
所以「环境注入」与「月晕」两条通道在页面上是活的,不是烘死的图。

---

## 13. 命令行

```bash
node golden/w3/run.mjs <near|mid|night> [--time 2.5] [--out x.png]
    --orb                    开灯球(演示驱动 orbDemoSource 在 t 时刻的球位)
    --orb-energy 0.6         总闸门
    --orb-x/-y/-r/-R/-spin   球心 NDC / 屏幕半径 / 世界半径(米)/ 自转相位
    --orb-env-gain 0.05      环境注入增益(扫参用;定稿值在 PRESETS[x].orb.envGain)
    --moon-halo [g,w]        夜景月晕;带参数则覆盖 NIGHT_MOON_HALO 的 gain,width
```

`--orb*` 一个都不给 = `uOrbEnergy` 为渲染台默认的 0 = 逐字节回归那一档。

---

## 14. 黄金帧

`golden/w5/`:

| 文件 | 内容 | 总分 |
|---|---|---|
| `w5-{near,mid,night}-orb-t2.5.png` | 三个 preset 灯球全开(night 含月晕) | 0.862 / 0.924 / 0.917 |
| `w5-night-e{1.0,0.6,0.3,0.0}-t2.5.png` | `energy` 闸门四帧 | 0.917 / 0.923 / 0.930 / 0.930 |
| `w5-night-halo-only-t2.5.png` | 只开月晕、不开灯球(§8 的对照) | 0.930 |
| `w5-mid-x{-0.70,0.00,0.70}-t2.5.png` | 球心横向移动,光斑同帧跟随 | 0.924 / 0.924 / 0.923 |

`w5-night-e0.0` 与 `w5-night-halo-only` 的 md5 相同 —— 见 §5。
