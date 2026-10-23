# 水面 / 灯球 —— 交接书（给一个没有任何上下文的人或 agent）

> **读这份文件的人**：你要接手 M7「奥伯拉丁抖动水面 + 迪斯科灯球」的剩余工作。
> 前面 12 张卡（W0–W11）已经做完并落库，50 个提交在 `feat/water-orb`。
> **这份文件不解释「水面是怎么做的」** —— 那些写在代码注释和
> `docs/water-reference-metrics.md` 里，而且比这份详细得多。
> 这份文件只回答四件事：**别碰什么 / 约定是什么 / 还剩什么 / 什么已经被证伪**。

**先花 3 分钟做完 §0，再往下读。** §0 跑不通的话，后面每一条都不成立。

---

## 0 · 三分钟自检

```bash
git checkout feat/water-orb && npm install
node scripts/water-gates.mjs
```

看到 **「全部通过」** —— 你的环境是对的,而且下面 §1 那四条红线此刻全绿。
**这条命令你会反复用到:每次提交前跑一遍。**

- 分数不对 → 先 `npx tsx golden/w3/build.ts` 重建 `golden/w3/preview.frag`（见 §5 坑 7）。
- `npm run build` 在受限网络里会挂（要 `binaries.prisma.sh`），那不是你的错，
  但**合并前必须在能联网的机器上跑通**。
- 完整验收路径：`claude/本机验收全路径.md`（项目文档）。

---

## 1 · 红线（先看这个，不是先看目标）

这个项目从 W1 到 W11 反复踩的**同一类错**是：**改动看起来生效了，其实没有；
或者破坏了一个东西，而所有指标都没反应。** 所以红线不是口号，每条都配一个
能跑的命令和一个确定的期望值。**改任何东西之前先把这四条跑一遍存起来，改完再跑一遍。**

| # | 红线 | 命令 | 期望 |
|---|---|---|---|
| ① | 三个 preset 的定稿帧**逐字节**不变 | `node golden/w3/run.mjs {near,mid,night}` | `4add2a37…` / `2644c60d…` / `406fab32…`，分 0.859 / 0.913 / 0.930 |
| ② | 灯球总闸门归零 ⇒ 逐字节回 night 定稿 | `node golden/w3/run.mjs night --nobuild --orb --orb-energy 0 --noscore --out /tmp/a.png` | md5 = `406fab32…` |
| ③ | 聚焦闸门归零 ⇒ 逐字节回 mid 定稿 | `node golden/w3/run.mjs mid --nobuild --focus 0 --noscore --out /tmp/b.png` | md5 = `2644c60d…` |
| ④ | 每帧零 DOM 读取 + reduced-motion 定格 | `npm run dev` 然后 `node scripts/water-scene-check.mjs --url http://localhost:3000/lab/water` | 「回调内布局读取 0」、「rAF 增量 0」、连拍两帧同 md5 |

### 1.1 别手敲这张表 —— 跑脚本

```bash
node scripts/water-gates.mjs                  # ⓪①②③ + lint,纯离线,约 40 秒
node scripts/water-gates.mjs --with-scene     # 外加 ④(要先 npm run dev)
```

退出码 0 = 全绿,非 0 = 有闸门没过,可以直接挂 pre-commit / CI。
**文档会被跳读,一条会红的命令不会。**

脚本比上面那张表多做两件事,都是故意的:

- **闸门 ⓪:黄金帧本身没被改过。** 它不只比「这次渲出来的图 == 仓库里的黄金帧」,
  还比「**仓库里的黄金帧 == 写死在脚本里的 md5**」。只做前者有一个很容易发生的
  自欺:改坏了画面 → 闸门红 → 顺手把黄金帧重新生成一遍 → 绿了,而画面已经不是
  定稿那张。基线钉死在代码里之后,重设基线必须**显式改脚本里的 `GOLDEN` 表**,
  那一行 diff 会出现在 PR 里,有人会问为什么。
- **第一次渲染故意不带 `--nobuild`**(强制重建 `preview.frag` 一次,坑 7),
  之后四次才带 —— 既保证用的是当前源码,又不浪费四次 esbuild。

**脚本没有 `--update` 开关,这也是故意的。** 重设基线应该是一次需要解释的动作,
不是一个能顺手敲的 flag。

脚本自己也被反向验过(坑 14:验收脚本会对「什么都没发生」免疫):
把 `night` 的 `uShadeContrast` 从 2.5 改成 **2.6** 之后,
闸门 ①② 立刻红,分 0.930 → 0.865、md5 `406fab32…` → `b9c4270e…`,退出码 1。

**②③ 为什么必须是「逐字节」而不是「差不多一样」**：它们是这套系统里唯一
**不可能被自欺的**判据。九项指标全都可能对一个改动毫无反应（§5 有三个实例），
但 md5 不会。写代码时对应的做法是：闸门为 0 时**精确 return 0.0 / 1.0**，
让 `x + 0.0` 和 `x × 1.0` 在 IEEE 下逐位恒等，而不是「返回一个很小的数」。

**近景 preset(near)已冻结。** 用户明确要求保持现状，W6 之后没有一个参数为它改过。
不要为了任何理由动 `WATER_PRESETS.near`。

**其余三条常规红线**（AGENTS.md 里有全文）：颜色只能来自 `globals.css` 的
`:root` token；文案只能来自 `src/i18n/`（zh + en 都要加）；不许 `any` / `@ts-ignore`。

---

## 2 · 约定（不知道这些必然写错）

### 2.1 三套坐标系，第三轴符号不同

| 系 | 定义 | 出现在 |
|---|---|---|
| **场坐标** `p = (x, y_field)` | x 右、y_field **远离相机**，单位米，水面在 y=0 | `field.glsl.ts` 的 `p`、`orb-light.ts` 的光斑中心、涟漪的 worldMin |
| **相机系** | x 右、y 上、z **朝向相机**（前方是 −z） | `shade.glsl.ts` 的 N / V / L |
| **NDC** | x/y ∈ [−1,1]，**y 向上** | 球位 `orb.screen`、拖拽偏移 |

场坐标 `(x, 0, y_field)` 在相机系里是 `(x, 0, −y_field)` —— **第三轴反号**。
`waterFieldToView()` 是唯一的转换处。搞错这个符号，掠射几何整套是镜像的
（高光会跑到光源的反侧），而且**分数几乎不掉**，你不会发现。

### 2.2 单一真相来源（抄第二遍 = 坑 7）

| 东西 | 唯一定义处 | 拷贝在哪、谁兜底 |
|---|---|---|
| 三个 preset 的全部参数 | `src/components/lab/water/presets.ts` | `golden/w3/run.mjs` 与组件都 import 它 |
| 着色器拼装 | `src/components/lab/water/assemble.ts` | `build.ts` 与组件调同一个函数 |
| 球位（滚动插值端点） | `presets.ts` 的 `WATER_PRESET_ORB_POSES` | `water-director.ts` 的 `WATER_ORB_STOPS` 是拷贝，`build.ts` 断言④ 兜底 |
| 相机 | `presets.ts` | `water-director.ts` 的 `WATER_CAMERA_STOPS` 是拷贝，同上 |
| 月光让位插值 | `presets.ts` 的 `moonSpecGainFor()` | 三个消费端都调它 |
| 降级档位表 | `perf.ts` 的 `WATER_QUALITY_TIERS` | 面板引用 |

**为什么 director / orb-light / ripple / perf 四个文件只许 `import type`**：
`scripts/gen-water-preview.mjs` 用 `.toString()` 把这些类**原样内联**进预览台，
好让预览台跑的是同一份代码而不是抄一份。代价：**方法里不许引用模块作用域的函数**；
引用到的模块级常量必须在生成脚本的 `INLINE_JS` 里按值内联。

### 2.3 GLSL 写在 TS 模板字符串里

`*.glsl.ts` 的着色器源码是 `export const SRC = \`...\``。
**注释里不许出现反引号** —— 它会提前终止模板字符串，报一个位置离谱的
`TS1005: ',' expected`。这个坑在 W11 踩了两次。写 `uOrbCenter.xz` 就好，别写
`` `uOrbCenter.xz` ``。

### 2.4 「分数只能证伪，不能证真」

`node golden/w3/run.mjs` 出的九项指标是**对着实拍照的相似度**，不是「好看」。
它已经三次对重大改动完全免疫（§5）。所以：

- **每张卡必须附黄金帧，而且提交人要真的用眼睛看过**，在 PR 里写一句你看到了什么。
- 分数下降**不一定是坏事**：mid 的波脊断裂 0.951 → 0.913、night 的主光池
  0.930 → 0.866，都是**故意的交换**，因为基线本身不含那个特征。
  交换必须在提交信息里说明「掉的是哪一项、为什么必然掉」。
- **分数没变和分数变了一样需要解释。**

---

## 3 · 已实现的地图（一文件一行）

```
src/components/lab/water/
  contract.ts        OrbState / WaterFrameState / RippleField —— DOM 层与 WebGL 层唯一的耦合面
  field.glsl.ts      W2 波场:24 分量 + 风区衰减 + 解析 LOD/σ² + 斑块/长尾/摆动/波脊断裂
  shade.glsl.ts      W3 着色:菲涅耳分层 lum=(1−F)·body+F·(env+spec) + 环境列 + Beckmann + 地平线起伏
  dither.glsl.ts     W4 抖动:蓝噪声阈值 + 各向异性单元 + 两色 token
  light.glsl.ts      W5/W10/W11 灯球五条通道:波幅 / 漫射池 / 环境注入 / 聚焦渐晕(乘) / 主光池
  env-column.ts      环境列 LUT(1×256 R8),灯球倒影与月晕在 CPU 侧注入
  orb-light.ts       灯球光斑求解器:64 片 Fibonacci 镜子 → ≤24 个光斑,CPU 每帧一次
  ripple.ts/.glsl.ts W6 涟漪:256² RG16F ping-pong 显式波动方程,世界锚定,CFL 0.205~0.230
  water-director.ts  W7/W8/W11 交互编排器:十一条耦合,渲染器无关,零 DOM 读取
  perf.ts            W9 GPU timer query + 六档降级阶梯
  presets.ts         三个 preset 的全部参数(单一真相来源)
  assemble.ts        着色器拼装(单一真相来源)
  water-scene.tsx    W8 组件:上面所有东西唯一的装配处
src/components/home/hero-water.tsx   W9 首页挂载点(fixed inset-0 -z-10,SmoothScroll 层外)
src/app/lab/water/page.tsx           调参面板 + 计数板 + 性能条
golden/w3/run.mjs                    渲染 + 跑分入口
scripts/gen-water-preview.mjs        生成自包含预览台(内联同一份求解代码)
scripts/water-scene-check.mjs        组件验收台(零 DOM 读取 / reduced-motion)
scripts/water-gates.mjs              **四道闸门,一条命令跑完 —— 每次提交前跑它**
docs/water-reference-metrics.md      **权威标尺 + 18 个坑的全部记录 —— 遇事先查这份**

blender/orb-build.py                 灯球主控场景,**从空场景完整重建**(Blender 崩过一次,
                                     内存里没保存的全丢了 —— 场景必须是脚本的输出)
scripts/orb-measure.mjs              灯球的尺子:整球黑白比 / 纬度带曲线 / 瓦距 / 团簇 P_same(δ)
scripts/orb-dither.mjs               Blender 帧 → 1-bit,用水面**同一张**蓝噪声/网格/色板
scripts/orb-pack.mjs                 抖好的帧 → 精灵图掩码 + orb-loop.json + 首帧静图
public/orb/orb-loop.png|.json        B-2 资产:48 帧覆盖 90°(球 4 重对称),2880×2160,239 KB
public/orb/orb-still.png             首帧,6 KB。首屏先画它,精灵图到了再换
src/components/home/disco-ball.tsx   灯球组件。**对外只有五个 CSS 变量**,内部现在是精灵图
docs/blender-assets.md               §F 第一版主控场景 / **§G 按实测重建 + B-2 全流程**
```

编排器的十一条耦合（`water-director.ts` 的 `WaterDirectorFlags`，预览台可逐条关掉看差别）：
① 指针划水→涟漪 ② 悬停灯球→energy ③ 球位→光斑(20ms 滞后) ④ 滚动→相机
⑤ 点击→大冲击+曝光 ⑥ 静置→降风 ⑦ 退场→energy→0 ⑧ 滚动→球位
⑨ 聚焦态(页面显式驱动) ⑩ 拖拽灯球→偏移+弹簧回位 ⑪ 退场→光池后退。

---

## 4 · 还剩什么（每张卡一份契约）

> 每张卡的格式固定：**目标 / 你会拿到什么 / 交什么 / 怎么算做完 / 已知陷阱 / 不许做**。
> 「怎么算做完」全部是**可执行的**，不是形容词。

### T1 · 灯球时间线 → 水面联动（用户口中的「联动」）

**目标**　让水面上的光真的跟着主页那颗迪斯科球走：球升起离场时，光池后退、缩小、
变暗，收回海岸线；月光同时接管。

**2026-09-11 补：球这一侧也做完了，但两边的「球」不是同一个尺寸。**
`DiscoBall` 内部已经换成 B-2 精灵图（`public/orb/orb-loop.png`，48 帧）。
量出来的事实：

| | 球径 | DPR 2 下设备像素 | 相对精灵原生(328 px) |
|---|---|---|---|
| 标题里的字母 O（`0.74em`） | 21 ~ 83 css px | 42 ~ 166 | **0.13 × ~ 0.51 ×** |
| 水面标定的灯球（night `radiusNdc` 0.16，视口高 900） | 144 css px | 288 | **0.88 ×** |

**水面那颗正好是这张图的原生尺寸；标题那颗小了 2 ~ 8 倍。** 1-bit 图缩小只能走
最近邻（双线性会把墨点抹成灰），2.8 倍缩小就把抖动图案打成噪点了。
所以「联动」这张卡在动手之前先有一个**设计决定**要用户拍板，见 T7。

**你会拿到什么**　水面这一侧**全部做完了**。`HeroWater`
（`src/components/home/hero-water.tsx`）已经开好两个 prop：`orbEnergy`、`orbX`。
编排器的行⑦/⑪ 会把 energy 与 `uOrbPoolRetreat` 按互补曲线推完
（`gate=(1−u)²` / `retreat=1−(1−u)²`，800 ms）。

**交什么**　把主页时间线的球位与生命周期喂进这两个 prop。
球在 HR-8 里**屏幕 x 是常数**，只有 y 动，所以实际只需要驱动 `orbEnergy`：
球开始上升时调 `director.beginOrbExit()`（经由把 `orbEnergy` 拉到 0，或直接拿
`WaterSceneHandle.director`）。

**怎么算做完**

1. 红线 ①②③④ 全绿。
2. 录一段 800 ms 的屏，能看到光池**先往地平线退**、再变暗 —— 顺序不能反
   （retreat 半程走 75%，energy 半程只剩 25%，这是刻意的）。
3. 静态对照：`golden/w11/night-exit{0,025,05,075}.png` 就是这四档的样子。

**已知陷阱**

- **球位必须来自时间线取值函数，不许 `getBoundingClientRect()` 去量球。**
  组件承诺「每帧零 DOM 读取」，红线④ 会当场抓到。
- **球升高时几何会把光池拉得离相机更近，不是更远**（坑 17）。后退是显式驱动的，
  别以为抬高球就够了。

**不许做**　不许在 `HeroWater` 里加指针交互（它是 `pointer-events-none`，
而且首页显式关掉了 ①⑤⑩ 三条）。

---

### T2 · 主页 HR-1 ~ HR-10 叙事时间线

**目标**　`docs/homepage-animation-plan.md` 里那条完整的主页叙事。

**你会拿到什么**　主页现在**只渲一个 `TitleFigure`**
（`src/app/(site)/page.tsx` → `DiscoHero`）：矢量标题 "welcome T[O] carrykit"，
灯球充当 O、自转 + 斜星环。转场原型在 `/lab/home`
（`src/components/lab/home-collapse.tsx`，264 行，一个 pin + scrub 拆三段），
文档 `docs/home-collapse-transition.md`。

**交什么**　Act I 入场（HR-1~HR-5，时间驱动）+ Act II（HR-6~HR-10，滚动 scrubbed）。

**怎么算做完**　`docs/homepage-animation-plan.md` 每个 HR 段自带验收；
另加红线④（reduced-motion 下不建时间线）。

**已知陷阱**　`fixed` 元素必须留在 `<SmoothScroll>` **之外** ——
ScrollSmoother 用 transform 推内容，transform 会给子树建立新的包含块，
里面的 `position:fixed` 会退化成相对它定位、跟着滚动一起走。

**不许做**　**灯球是 DOM 元素，每帧只许改 `transform` 与 `opacity`。**
任何 SVG 滤镜逐帧重算、任何 `filter: blur()` 动画，在 1080p 上都是 10–30 ms
主线程开销，会把整个性能预算吃光。发光叠层用预渲染的 alpha 序列。

**这张卡不是水面的事**，T1 依赖它，但它本身可以独立推进。

---

### T3 · `ball-waterlight`（B-4）资产 + 灯球模式 B 验证

**目标**　把灯球照度从「程序化求解」换成「Blender 预渲染序列」，并验证两者一致。

**你会拿到什么**　前端接口**已经留好且能优雅回落**：`uOrbLightMode = 1` 时若
`uOrbLightmapSize` 是 (0,0)（纹理没绑上）就自动走模式 A，不黑屏不报错。
规格在 `docs/blender-assets.md` §B-4。

**交什么**　一张 sprite sheet（120 帧、无缝循环、单通道亮度、透明背景），
命名 `ball-waterlight_@2x.webp`。

**怎么算做完**　同一帧、同一球位下，**模式 A 与模式 B 的亮度分布皮尔逊相关 ≥ 0.7**。
**资产到位前这一条未验证 —— 不要在 PR 里编数字。**

**已知陷阱**　六个数必须与前端**逐字一致**，否则 A/B 切换会跳变：

| 量 | 值 | 前端唯一定义处 |
|---|---|---|
| 镜片数 | 64 | `DEFAULT_ORB_LIGHT_CONFIG.facetCount` |
| 镜片排布 | 球面 Fibonacci（黄金角 π(3−√5)） | `orbFacetNormals()` |
| 主光仰角 | 0.95 rad | `mainLightElev` |
| 主光方位角 | −0.7 rad | `mainLightAz` |
| 光斑角半径 | 0.12 | `spotSpread` |
| 自转轴 | 竖直 | 同 B-2 `ball-loop` |

帧号是 `floor(spinPhase × 120)`，**差一帧就和球的自转脱相**。

---

### T4 · mid 聚焦态（B 态）的真实落点

**目标**　blog / 展示页用 mid 构图，滚到某处时从「展示态」过渡到「聚焦态」
（周围压暗，只有灯球照到的地方有光）。

**你会拿到什么**　通道和过渡**都做完了**：`waterOrbFocusDim()`（乘法通道）、
编排器行⑨（800 ms power4.inOut）、`WaterScene` 的 `focus` prop。
**但还没有任何页面用它。** 参数标定见 `docs/water-focus.md`。

**交什么**　在目标页面挂 `WaterScene`（照 `HeroWater` 的写法），
用 IntersectionObserver 或 ScrollTrigger 把 `focus` 从 0 推到 1。

**怎么算做完**　红线③ 仍然逐字节；`focus=1` 时**远景带 RMS 不为零**
（给数字，别写「看起来对」）；`focus=0.5` 中途不跳变。

**已知陷阱**　`focus` **由页面显式驱动**，不绑 energy、不绑滚动进度 ——
聚焦是叙事决定的，不是视口位置决定的。只有 mid 有 B 态。

---

### T5 · 真机性能三条

见 `claude/本机验收全路径.md` §5。云容器只有 SwiftShader，量不了。

1. 1080p 中端集显 GPU 帧时间 ≤ 8 ms（性能条 `source` **必须显示 `gpu`**，
   显示 `cpu` 那栏量的是被 vsync 钉住的帧间隔，**不是 GPU 时间，不能当验收数**）。
2. 低端设备降到 0.5× 后 ≥ 50 fps。
3. Chrome Performance 面板：每帧 0 layout/repaint、canvas 独立合成层、
   主线程每帧 JS < 2 ms。截图存 `docs/`，然后把 `docs/TASKS.md` 里 W9 那条
   ⚠️ 换成实测数。

---

### T6 · 三条美术方向（**做之前先找用户确认**）

`docs/water-reference-metrics.md` §13.1 / §13.3 / §13.4 提出的三条，W8 一条都没做，
**不是忘了，是它们与红线① 互斥** —— 采纳任何一条都会改掉定稿帧的 md5，
等于重设基线。根因已经量清楚了（§17.3 有完整的解析解 + 密度剖面 + 四档扫参）。

典型的一条：夜空 tonemap 输出只跨 0 → 0.031，clamp 吃掉了上面 78%，
所以天顶是死区。把 `night.sky` 从 0.10 抬到 0.16 能让 clamp 消失、**分数一分不掉**，
但**和用户当初的诉求相反**（用户要的是天顶网点调稀）。

**所以这张卡的第一步不是写代码，是问用户要哪个。**

---

### T7 · 灯球尺寸与粗瓦 LOD（**做之前先找用户确认**）

**目标**　让灯球在它实际出现的每个尺寸上都读得出瓦片结构。

**你会拿到什么**　B-2 资产（球径 328 px）+ `blender/orb-build.py`（换两个常数就能
出另一档）+ `scripts/orb-measure.mjs`（回测用同一把尺子）。
问题的量化在 T1 开头那张表。

**交什么**　二选一，**用户选**：

- **A · 把标题的球做大。** 纯设计决定，不改资产。经验阈值：球径到 110 css px 左右
  结构才立得住（`ratio ≥ 0.55`，见 `scripts/orb-measure.mjs` 与灯球实测台）。
  代价是标题排版要重来。
- **B · 出一张粗瓦 LOD。** `orb-build.py` 把 `SEG_EQ/RING` 从 56/28 降到 ~20/10，
  `RES` 降到 128，其余不动 —— **纬度分布与黑白配比跟瓦数无关，照样保留**，
  回测仍用同一张参考图。组件按 `ResizeObserver` 量到的实际盒子在两张图之间切，
  和水面那六档画质阶梯是同一个思路。约十分钟的渲染 + 半小时的组件改动。

**怎么算做完**
1. `node scripts/orb-measure.mjs <新档的抖动帧> --alpha` 的整球白占比与逐带曲线，
   与参考图的 RMS ≤ 3 个百分点（细瓦那档是 2.29）。
2. 在灯球实测台上把尺寸拖过 21 / 59 / 83 / 180 四个刻度，每一档都能看出瓦片网格。
3. 四道闸门 + lint 基线不变。

**已知陷阱**　降瓦数会改变 coverage→亮瓦的传递函数（抖动、掠射、互相遮挡吃掉的
比例变了），`PROFILE` 要重新收敛两三轮 —— 别指望照抄 56/28 那组数。

**不许做**　不许为了让小尺寸好看去改 `WATER_PRESETS.night` 的 `radiusNdc`：
那个数标定着水面的光池几何（`dist = worldRadius / sin(atan(radiusNdc·tanH))`），
动它等于把 W11a 的定标全部作废。

---

## 5 · 已证伪清单（别再走一遍）

这一节是这份交接书里**最值钱的部分**。每一条都是实测出来的，不是推测。
全部记录在 `docs/water-reference-metrics.md`，这里只列结论。

### 5.1 物理/美术上走不通的

| 想法 | 为什么不行 | 出处 |
|---|---|---|
| 调谱斜率 `uFieldSpectralSlope` 把 near 的纹理调细 | 只会让墨变多、横划变粗。near 峰值带 32px ≈ 4 cm 的波，而 24 个分量已经贴着 1.8 cm 的重力-毛细过渡点。**near 的粗是构图问题，不是谱形状问题** | §11 |
| 加大方向散布打断 mid 上部的「梳子」 | 会把相干度和梯度角一起打掉。正确做法是**波脊断裂**（各向异性包络，完全不动波的方向） | §13 |
| 加宽环境列眩光、只让天空变宽 | 水面在掠射角下反射的正是地平线上方那段仰角，两边采的是**同一段**。前景平坦度 0.08 → 0.54，总分 0.267 | §13 坑 9 |
| 在 night 上调 `uOrbSpecGain` 让灯球亮起来 | **几何禁止**。画面下缘那点水看相机仰角 9.4°、看灯球 46.8°，半程向量偏离法线 36.7° ⇒ `exp(−0.554/σ²) ≈ e⁻⁵⁵ = 0`。而且球的镜像点在水下 13.37 m，**镜像本身就在画框外**；球挂在 NDC y=0.42 时即使推到无穷远，反射点也只收敛到 14.3 m，进不了 24.2 m 的画框 | §18 坑 16 |
| 在 mid/near 上给灯球加亮度 | 前景 tonemap 输出算出来是 1.70、被 clamp 到 1，**往饱和白上加光是零收益**。mid 的 B 态因此改用**乘法渐晕**（压暗没被照到的地方） | §14 / `light.glsl.ts` ④ |
| 指望球升高时光池自然退向地平线 | 反的。`dist = worldRadius / sin(atan(radiusNdc·tanH))` 与球在屏幕上的高度**无关**，球沿屏幕上升是在固定半径的球面上移动，它正下方的水面点反而**向相机收拢** | §19 坑 17 |
| 把黑白直接**涂**在灯球上 | 参考图里亮瓦与 grout 是同一种白、连成一片,涂白做不出这个连续性;更要命的是涂白的亮斑会**跟着球转**,一眼假。真镜球是亮斑留在原地、瓦片从底下扫过。正解是反解一张环境贴图:`n = normalize(s − d)` | `blender-assets.md` §G.2 |
| 让 grout 底球对 glossy 可见,或反过来 `visible_glossy = False` | 两种朴素写法都会在球缘凭空多出一圈亮瓦:可见时球缘的瓦反射到自发光底球,不可见时反射光线**穿过**底球打到对面的天空。正解是材质层面用 Light Path「Is Camera Ray」分流 | §G.3 |
| 天空亮斑只用一层噪声 | 靠近 +d(球背面方向)那圈天空立体角很小,K=13 的波长约 28°,里面只装得下一两个亮斑 —— coverage 0.145 和 0.21 的区别就是「一个斑落进去 / 没落进去」,实测在 26.1% 和 53.8% 之间**没有中间值**。加一层细噪声才有可控性 | §G.3 |
| 把 quantize 拆成第二个 pass | 得先把亮度写进 RGBA8，8-bit 中间态会把 1-bit 抖动要用的中间调**先量化一遍** | §20 |
| 用 `WATER_COMPONENTS` 6→4 做性能降级 | 它是编译期常量，改它要重编着色器 —— 掉一档质量卡半秒，比不降还糟。正确旋钮是把解析 LOD 提前 | §20 |

### 5.2 方法论上的坑（**这几条会再咬你**）

| 坑 | 一句话 | 出处 |
|---|---|---|
| **7** | 产物没重建 —— 一整轮扫参出**六个相同的 md5**。扫参时永远打印输出 md5 | §11 |
| **12** | **分数对「东西落在画框外」完全免疫**。灯球第一版光斑全在框外、涟漪 night 第一版只翻动 81 个像素，九项指标一位不差 | §14 |
| **13 / 18** | **任何以被测量自身当前或近期极值为基准的判据，在被测量本身漂移时都会失效。** 出现过两次：涟漪前沿用「当前环峰的百分比」、性能阶梯用「滚动窗口最小值」当 vsync | §15 / §20 |
| **14** | **验收脚本自己也会对「什么都没发生」免疫** —— 写验收时先让它对一个已知的坏输入报错 | §16 |
| **15 / 17** | 「相机/球动了，别的东西没跟着动」出现过**三次**。给任何东西加运动之前，先算一遍它带动的量往哪个方向走 | §17.2 / §19 |
| **16** | 一条通道可以被几何完全禁止，而**分数与消融开关都不会告诉你** —— 消融只能说「关掉它画面没变」，而「它本来就没起作用」「它坏了」「它不存在」三者表现完全一样 | §18 |
| — | 1-bit 暗场里**只有局部白点密度读得出来，峰值读不出来**。night 的抖动把 42335 px 的变化砍到 2704 px（94% 被扔掉） | §18.3 |

### 5.3 不是回归、别去追的

- `golden/w8/scene-*.png` **跑一次变一次**（组件在真实时间里跑，不是定格帧）。
  真正的逐字节门在 `golden/w3/run.mjs`（固定 t=2.5）。
- `peakWavelengthPx` 不计分、非单调（FFT bin 量化到 128/整数），不能当趋势指标。
- lint 那 20 problems（13 errors / 7 warnings）与 tsc 那 3 条都是水面之前就有的。
- 在这个云容器里截首页,preloader 的幕布（`z-[60]`）**不落幕**，整页是一块
  `#1a1a1a`。原因是出口代理挡了 Google Fonts，它的计数动画等不到。
  不是页面 bug —— 截图前 `document.querySelectorAll('[class*="z-[60]"]').forEach(e => e.remove())`。
- 容器里 `npx playwright` 自带的浏览器版本号对不上,用
  `chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })`，
  **不要**跑 `playwright install`。

---

## 6 · 工作流

1. **一张卡一个提交**，Conventional Commits。
2. 提交前跑红线 ①②③④；`npm run lint && npm run build` 必须过。
3. **PR 里必须附黄金帧，并写一句你用眼睛看到了什么。** 只贴数字不算。
4. 分数掉了就在提交信息里写清楚：掉的是哪一项、为什么必然掉、换到了什么。
5. 只改自己那张卡的文件；动了 `contract.ts` 要在 PR 里说明为什么。
6. 遇到「某个增益怎么调都没反应」——**先算几何**（`dot(N,H)`、落点在不在画框内），
   别先怀疑代码。这是坑 12 与坑 16 的教训。

---

## 7 · 查什么读什么

| 问题 | 读哪份 |
|---|---|
| 这个参数为什么是这个值 | 先读**代码注释**（这个项目的注释里写的是「为什么」和实测数，不是「做了什么」） |
| 这个指标为什么这么动 | `docs/water-reference-metrics.md` —— 权威标尺 + 18 个坑的全部记录 |
| 灯球和水怎么耦合 | `docs/water-orb-coupling.md` |
| 交互怎么编排 | `docs/water-interaction-spec.md` |
| 涟漪的世界尺度 | `docs/water-ripple.md` |
| mid 的 B 态 | `docs/water-focus.md` |
| Blender 资产规格 | `docs/blender-assets.md`（§A~§E 规格 · §F 第一版场景 · **§G 按实测重建 + B-2 全流程**） |
| 灯球为什么长这样 | `docs/blender-assets.md` §G.1 的实测表 —— 三条参数全部来自量参考图，不是审美选的 |
| 灯球资产怎么重出一遍 | `docs/blender-assets.md` §G.5 的五条命令 |
| 灯球读不读得出来 | `node scripts/orb-measure.mjs <图> --alpha` —— 和量参考图用的是同一把尺子 |
| 主页叙事 | `docs/homepage-animation-plan.md` / `docs/home-collapse-transition.md` |
| 为什么不走 W1 那条路 | `docs/water-dither-shader.md`（原型完整保留，含被删的首页集成源码） |
| 我改的东西有没有破坏红线 | **`node scripts/water-gates.mjs`** —— 别手敲 md5 |
| 本机怎么验 | `claude/本机验收全路径.md` |
| 全仓规范 | `AGENTS.md` |

**代码注释是第一手资料，这份交接书是索引。** 两者冲突时以代码注释为准，
并在 PR 里指出冲突。
