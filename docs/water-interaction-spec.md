# W7 · 交互编排(`water-director.ts`)

> 2026-09-05。承接 `docs/water-orb-coupling.md` 与 `docs/water-ripple.md` 的体例:
> 先给数字,再给坑,不给形容词。**这张卡一行着色器、一个 preset 参数都没改** ——
> 回归见 §8。滚动映射的默认区间是 **night → mid**;**near 一个数都没动**。

---

## 1. 三条设计原则

这三条不是口号,下面每个数字都能追回到其中一条。

### ① 光是主语,水是谓语

球对水的主要作用是**辐射度**的,不是力学的。**球移动不注入任何冲击** ——
它只改 `OrbState.screen`,由 W5 的光斑求解器把照度铺到水面上。
只有「指针划过水面」「点击落水」这类**事件**才注入冲击。

反例(没做的):把球当成一个在水面上拖行的物体、沿路推出艏波。
那需要一个随球移动的连续源项,而球在 DOM 层、离水面 0.86~13.7 m 高
(`docs/water-orb-coupling.md` §3),它根本没碰到水。

### ② 延迟即质感

**任何低于 80 ms 的响应都不像水。** 本卡里没有一条耦合是直接赋值的:

| 耦合 | 机制 | 达到 90% 的时间 |
|---|---|---|
| 滚动 → 相机 | 指数阻尼 0.12/帧@60 | 300 ms |
| 悬停 → energy | 二阶弹簧 ζ=0.8 ω=12 | 250 ms |
| 球位 → 光斑 | 一阶 τ=20 ms | 46 ms |
| 点击 → 曝光 | 60 ms attack + τ=0.6 s 指数衰减 | — |

球位那条是唯一低于 80 ms 的,**这是故意的**:它跟的是球本身的运动,
延迟大了会变成"光斑掉队",不是"水有惯性"。20 ms 在匀速扫掠下换算成
**15.7 px@1920 的稳态滞后**(§4 实测),刚好是"看得出来但不像 bug"。

### ③ 阈值即克制

`pointermove` 在 120 Hz 指针上一秒来 120 个,全注入就是满屏是波,反而假。
速度阈值 **0.15 px/ms** + **40 ms 节流**把它压到 ≤25 发/秒。
**挡掉多少有计数器**(`WaterDirectorCounters`),预览台把它显示出来 ——
「节流生效」是量出来的,不是断言的。实测见 §5。

---

## 2. 耦合矩阵(交付形态)

七条,每条一个可单独开关的 flag(`WaterDirectorFlags`),预览台一条条关得掉。

| # | 输入 | 水面状态量 | 响应曲线 | 参数(**已定标**) |
|---|---|---|---|---|
| ① | 指针在水面移动 | 涟漪冲击注入 | v > 0.15 px/ms 才注入,强度 ∝ min(v, 2.0),40 ms 节流 | **按 preset 换算**,见 §3.1 |
| ② | 指针悬停灯球 | `uOrbEnergy` | 二阶弹簧 ζ=0.8 ω=12 rad/s | 1.00 → **1.45** |
| ③ | 球随时间线移动 | 光斑路径 | 直接跟随 + 20 ms 一阶延迟 | τ = 0.02 s |
| ④ | 滚动 | camHeight / camPitch / fovY | 指数阻尼 0.12/帧@60 | **4.00 m → 1.60 m**(night → mid) |
| ⑤ | 点击水面 | 大冲击 + 曝光提升 | 60 ms attack / τ=0.6 s decay | Δexposure **+0.04** |
| ⑥ | 静置 >4 s | `wind.speed` | 30 s 线性缓降,3 s 回升 | ×1.00 → **×0.60** |
| ⑦ | 球退场(HR-9 后) | `uOrbEnergy` | 800 ms ease-out(power2.out) | → **精确 0** |

与计划原表的差异,逐条说明在 §3。

### 2.1 每条关掉之后差在哪(**实测**,不是描述)

同一段输入,flag 开 / 关各跑一遍(纯 Node,dt=1/60):

| flag | 开 | 关 |
|---|---|---|
| ① `pointerRipple` | 100 发 10 ms 间隔 → 注入 **25**、阈值 1、节流 **74** | 注入 **0**,100 发全进 `suppressedByGate` |
| ② `orbHoverEnergy` | 悬停 1 s 后 energy **1.450** | energy 钉在 **1.000**,悬停毫无反应 |
| ③ `orbFollow` | 匀速扫掠稳态滞后 **0.0164 NDC**(15.7 px@1920) | **0.000000 NDC**,光斑与球同帧硬跟 |
| ④ `scrollCamera` | 滚到 1 → camHeight **1.600 m**、pitch **0.3700**、冲击半径 **0.150 m** | 钉在区间起点:**4.000 m**、**−0.1413**、**2.500 m**;拖滚动条画面不动 |
| ⑤ `clickImpulse` | `pointerDown` 返回 **true**,排队 1 个冲击,Δexposure **0.0396** | 返回 **false**,排队 **0**,Δexposure **0.0000** |
| ⑥ `idleWind` | 静置 34 s → wind.speed **0.600** | 恒为 **1.000** |
| ⑦ `orbExit` | 触发退场 1 s 后 energy **0.000** | energy 仍是 **1.000**,按钮等于没按 |

④ 那一行顺带说明了一件事:**关掉滚动之后冲击尺度也一起钉在夜景那一档**
(2.5 m 而不是 0.15 m)—— 因为尺度是跟着同一个滚动进度插值的,
这正是「交互的世界尺度必须跟着相机尺度走」的实现形态。

---

## 3. 每个数字是怎么定的

标注:**算的** = 从别处的定标推出来 · **扫的** = 跑出来挑的 · **拍的** = 拍的,并说明约束。

### 3.1 冲击尺度 —— **必须按 preset 换算,这是 W6 最贵的一条教训**

`docs/water-ripple.md` §4:night 沿用 mid 那套(0.15 m / 6 mm)时只翻动
**81 个像素**,九项指标一位不差 —— 图上什么都没有,分数却满分。
所以矩阵里那组「radius 0.06 / amplitude 0.4 mm」**不能写死**。

`WATER_IMPULSE_SCALES`(**算的**,click 档直接取 W6 的定标值):

| | near | mid | night |
|---|---|---|---|
| click 半径 / 幅度 | **0 / 0**(关闭) | 0.15 m / 6.0 mm | **2.5 m / 60 mm** |
| hover 半径 / 幅度 | **0 / 0** | 0.060 m / 1.2 mm @v=1 | 1.00 m / 12 mm @v=1 |
| 来源 | 用户要求 near 保持现状 | `PRESETS.mid.ripple.impulse` | `PRESETS.night.ripple.impulse` |

**hover 档 = click 档的 半径 ×0.4 / 强度 ×0.2**(**算的**,比例取自计划原表:
原表的 hover 0.4 mm 对 `RIPPLE_CLICK_STRENGTH` 2 mm 是 0.2,
半径 0.06 对 0.15 是 0.4)。理由不是好看,是**总量守恒**:
划动是**连续**注入,40 ms 节流下一秒最多 25 发;click 是一次事件。
单发若与 click 同量级,划一下就是 25 颗石子砸下去,一片白。

`@v=1` 的意思:hover 强度是**在 v = 1 px/ms 时**的值,实际注入
`strength = hoverStrength × min(v, 2.0)` —— 阈值 0.15 处是 0.15×,
快甩封顶 2×。所以 mid 的实际单发幅度在 **0.18 ~ 2.4 mm** 之间。

**滚动中的尺度在对数空间插值**(**算的**)。night→mid 的半径比是
2.5 / 0.15 = **16.7×**,强度比 40×。线性插值会让滚动的前 80% 都还停在
夜景那一档的量级,到 mid 端才骤降;等比插值才让「每滚 10% 缩同一个比例」:

| 滚动 u | 0.00 | 0.25 | 0.50 | 0.75 | 1.00 |
|---|---|---|---|---|---|
| click 半径 | 2.500 m | 1.237 m | 0.612 m | 0.303 m | 0.150 m |
| click 幅度 | 60.0 mm | 33.7 mm | 19.0 mm | 10.7 mm | 6.0 mm |

端点(u≤0 / u≥1)**原样返回**,不走插值 —— 停在端点时与 preset 的定标值
逐位相同(同样的处理也用在相机上,见 §3.4)。

### 3.2 悬停 energy 1.00 → 1.45,ζ=0.8 ω=12(**算的** + 一处契约放宽)

ω=12 rad/s ⇒ 无阻尼周期 523 ms;ζ=0.8 ⇒ 解析过冲
`exp(−πζ/√(1−ζ²))` = **1.5%**,达到 90%(1.405)用 250 ms。都在「延迟即质感」的窗口里。

**契约放宽**:`contract.ts` 原本写 `energy` 是「0..1 的总闸门」,而这条要它到 1.45。
放宽的安全性来自 `light.glsl.ts` —— 三条出口全是 `uOrbEnergy * (...)` 的**线性**
乘子,没有任何地方假设 ≤1;而下界那条「`energy === 0` 必须精确返回 0.0」
一点没动,所以 §8 的逐字节回归不受影响。静息态仍是 1.00。
`contract.ts` 里已补注,不是偷偷改的。

**积分器的坑(本卡新踩的)**:半隐式欧拉对阻尼振子有**数值阻尼**。
直接用 dt=1/60(ω·h = 0.2)跑,实测过冲只有 **0.3%** —— 文档写 ζ=0.8、
实际跑的是 ζ≈0.95。细分到 **ω·h ≤ 0.05**(60 fps 下 4 个子步)之后过冲回到
**1.2%**,与解析的 1.5% 差 0.3pp,可以接受。每帧多约 24 次浮点运算。

`energy` 的最终组装是 `源.energy × 生命周期闸门 × 悬停弹簧`,三者分开:
悬停在退场过程中不该把 energy 又拉起来。

### 3.3 球位 20 ms(**拍的**,但有约束)

计划给的就是 20 ms。保留,理由见 §1②:它是唯一该低于 80 ms 的一条。
实测(§4)匀速扫掠下稳态滞后 0.0164 NDC = **15.7 px@1920**;关掉这条 flag 后是
**0.000000 NDC**(同帧硬跟)—— 差别可读,所以这条 flag 的开关是有意义的。

### 3.4 滚动阻尼 0.12(**拍的**,计划给的)+ 端点吸附(**新加**)

0.12/帧@60 ⇒ 时间常数 τ = −1/(60·ln(1−0.12)) = **130 ms**,
到 1.60±0.01 m 用 **717 ms**(§4)。一次滚轮 stroke 大约 100~200 ms,
所以相机总是"追在滚动后面一点",正是要的观感。

**端点吸附(5e-5)是本卡新加的**:指数阻尼永远只是渐近,`scroll` 会停在
0.9999999…,`camera()` 解出来是 **1.600000000000001** 而 preset 是 1.6。
差 1e-15,肉眼看不见,但"编排层一接进来画面就与 preset 不再逐位相同"
这件事本身必须消灭 —— 否则以后任何一次逐字节回归都会带着一个无法解释的
小尾巴。5e-5 的门限对应 camHeight 上 1.2e-4 m,远小于一个纹素。

**camPitch / fovY 一起插值**,不只 camHeight:night 是 −0.1413(抬头)、
mid 是 +0.37(低头),只插高度不插俯角的话地平线会在滚动中途跳。
fovY 两端都是 0.61,插了也不动;near 端(0.553)才用得上。

**near 是合法终点,但不是默认。** 预览台里选 near 时区间接续成 mid → near;
默认区间是 night → mid。near 的 preset 一个参数都没为本卡动过。

### 3.5 点击曝光 +0.04 / 60 ms attack / τ=0.6 s(**扫的** + **算的**)

「1.8 s decay」在实现上是指数衰减的时间常数选择问题。取 **τ = 0.6 s**,
则 1.8 s 处残留 `e^-3` = **5.0%**(实测 5.5%,差值来自 60 ms attack 的偏移)——
「1.8 s 衰减完」这句话就有了一个可验证的含义。

峰值 +0.04 是**加在** `uShadeExposure` 上的,不是倍率。三个 preset 的
`uShadeExposure` 分别是 near 0.06 / mid 0.10 / night 0.00,+0.04 对夜景是
从 0 起步的一次明显提亮,对 mid 是 +40%。做成加法而不是倍率,正是因为
night 的基准是 0 —— 倍率乘 0 永远是 0。

`WaterFrameState` 里原本没有这个量的落点(涟漪只改高度场,改不了曝光),
所以新增了**可选**字段 `exposureBoost`。可选是为了让 W5/W6 已有的组装点
不用改签名,`undefined` 与 `0` 语义相同。

### 3.6 静置降风:>4 s 起,30 s 降到 ×0.6,**3 s 回升**(计划 + 一处必要修正)

降的部分照计划:4 s 触发、30 s 线性降到 ×0.60。

**回升 3 s 是本卡定的,而且必须 < 4 s。** 第一版取 6 s,实测(§4)出现一个
明显的错:动一下鼠标只把静置计时清零,4 s 后又开始降 —— 6 s 的回升在
那 4 s 窗口里只能爬回 0.267,风速在 **0.60~0.87 之间来回荡**,永远回不满。
3 s < 4 s 之后,一次交互总能在下一次降风开始前把风速拉回 1.000(实测 3 s 整)。

这条属于「参数之间有隐含约束」的一类:`windRecover < idleAfter` 是硬关系,
已经写进 `WaterDirectorTuning` 的注释里。

### 3.7 退场 800 ms ease-out(**拍的**,计划给的)

用 `power2.out`(`1−(1−u)²`)。`DESIGN_SPEC.md` §5 的缓动 token 是
`power4.out`(入场)/ `power2.inOut`(过渡)/ `power3.in`(尾端急加速)——
退场没有对应 token,取 power2.out:前段掉得快、尾段慢慢没,
和"灯灭"的观感一致。**800 ms 处 energy 是精确的 0**(实测 §4),
这一点必须保住:`energy === 0` 是逐字节回归的前提(`water-orb-coupling.md` §4)。

---

## 4. 响应曲线(实测,`scripts/water-director-check.mjs --curves-only`)

纯 Node、固定 dt = 1/60 s 驱动。**为什么不在浏览器里量**:本容器没有 GPU,
预览台在 SwiftShader 上 1920×1080 是 ~1 fps,rAF 采样量到的是软件光栅的抖动,
不是编排器的响应。曲线是时间的函数,与渲染快慢无关。

```
④ camHeight (m)   50ms:3.236  100ms:2.715  200ms:2.118  300ms:1.840
                 500ms:1.652  800ms:1.605  1200ms:1.600  2000ms:1.600
   到 1.60±0.01 用时 717 ms(τ = 130 ms)

② energy         50ms:1.064  100ms:1.177  150ms:1.281  200ms:1.358
                300ms:1.436  500ms:1.454  800ms:1.450  2000ms:1.450
   峰值 1.4553 @ 450 ms · 过冲 1.2%(ζ=0.8 解析值 1.5%)
   松开后        50ms:1.386  100ms:1.273  200ms:1.092  400ms:0.996  800ms:1.000
                (400 ms 处 0.996 是那 1.2% 过冲的镜像,再 400 ms 收敛回 1.000)

⑤ Δexposure      17ms:0.0111  33ms:0.0222  50ms:0.0333  67ms:0.0396
                100ms:0.0374  300ms:0.0268  600ms:0.0163  1800ms:0.0022
   峰值 0.0396(离散采样落在 attack 顶点旁)· 1.8 s 残留 5.5%

⑦ energy(退场)  100ms:0.766  200ms:0.563  400ms:0.250
                600ms:0.062  800ms:0.000  900ms:0.000     ← 800 ms 处精确 0

③ 球位滞后        开:最大 Δx = 0.0164 NDC ≈ 15.7 px@1920
                关:0.000000 NDC(同帧硬跟)

⑥ wind.speed     0s:1.000  5s:0.986  10s:0.920  15s:0.853
                20s:0.786  25s:0.720  30s:0.653  35s:0.600
   动一下之后     0s:0.602  1s:0.736  2s:0.869  3s:1.000  4s:1.000
```

---

## 5. 阈值与节流(实测,不是断言)

计数器不变式(每次 `pointerMove()` 只落进一个桶):

```
pointerEvents = injected + suppressedByThreshold + suppressedByThrottle
              + suppressedOffSurface + suppressedByGate
```

预览台把这一行连同六个计数一起显示,`✓`/`✗` 是当场算的。

### 5.1 真的划一次(headless Chromium,真 `pointermove`,真 `timeStamp`)

一次 31.6 s 的划动(慢划 12.2 s + 两次快甩 19.4 s),mid preset:

| | 收到 | 注入 | 阈值挡 | 节流挡 | 不在水面 | 闸门 |
|---|---|---|---|---|---|---|
| 合计 | **261** | **82** | **173** | **6** | 0 | 0 |
| 慢划段 | 101 | 70 | 27 | 4 | 0 | 0 |
| 快甩段 | 160 | 12 | 146 | 2 | 0 | 0 |

不变式 261 = 261 ✓。注入率 31.4%。

**但这组数里「节流挡掉 6」几乎没有说服力**,而且必须说清为什么:
本容器没有 GPU,1920×1080 的软件光栅一帧要 ~1 s,主线程被占死之后
Playwright 的每一发 `mouse.move` 要等 **121 ms** 才被派发 ——
**每发间隔本来就超过 40 ms,节流一次都咬不到**。
(把画布后备缓冲降到 384×216 之后仍是 121 ms:瓶颈在协议往返 + 主线程调度,
不只在像素数。所以"快甩段"反而因为每步位移小、间隔长而被**阈值**挡掉了 146 发。)

### 5.2 合成 8.3 / 16.7 ms 间隔(真事件对象、真 `timeStamp`)

真机上指针是 8~16 ms 一发。用页面内的 `__wd.synthDrag()` 按固定间隔连发
真 `PointerEvent`(忙等保证 `timeStamp` 真的隔开,走的是页面自己那个监听器):

| 间隔 | 收到 | 注入 | 阈值挡 | **节流挡** | 注入率 | 理论上限 |
|---|---|---|---|---|---|---|
| 8.3 ms(120 Hz) | 240 | **48** | 1 | **191** | 20.0% | 49 |
| 16.7 ms(60 Hz) | 240 | **80** | 0 | **160** | 33.3% | 100 |

8.3 ms 那行:2.0 s 的划动里 40 ms 节流的理论上限是 49 发,实测注入 **48** ——
**节流是唯一的限制项,而且咬得严丝合缝**。
16.7 ms 那行注入 80 而非 100,是因为注入后接下来两发(+16.7、+33.4 ms)
都在 40 ms 窗口内,第三发(+50.1 ms)才放行 → 每 3 发过 1 发 = 80。
**这才是「节流生效」的证据。**

### 5.3 闸门(关掉之后)

| 场景 | 收到 | 注入 | 闸门挡掉 |
|---|---|---|---|
| reduced-motion 打开后再划 41 下 | 41 | **0** | 41 |
| 关掉「① 指针划水」后再划 41 下 | 41 | **0** | 41 |
| near preset(`hoverStrength = 0`) | n | **0** | n |

---

## 6. 零 DOM 读取

### 6.1 怎么保证的

| 每帧要的量 | 从哪来 | 会不会强制回流 |
|---|---|---|
| 画布尺寸 | `ResizeObserver` 回调的 **`contentRect`** → `setViewport()` 缓存 | **不会**(浏览器在布局之后直接递过来的) |
| 指针位置 | 事件对象的 `offsetX/offsetY`(W8 用 `clientX/clientY` − 缓存的 left/top) | 不会 |
| 指针时刻 | 事件对象的 `timeStamp` | 不会 |
| 球位 / 自转 | 时间线**取值函数** `WaterOrbSource(t)` | 不会 |
| 滚动进度 | ScrollTrigger 的 `self.progress` → `setScroll()` | 不会 |
| 帧间隔 | 调用方传进来的 `dt` | 不会 |

`water-director.ts` 里**没有** `getBoundingClientRect` / `offsetWidth` /
`getComputedStyle` 这几个字符串 —— 这条是可 grep 的。
预览台连 `ResizeObserver` 之外的那一次都省了:整页零次 `getBoundingClientRect`
(W6 那版的点击处理里还有一次,本卡删掉了)。

### 6.2 证据

`scripts/water-director-check.mjs` 在**页面脚本之前**(`addInitScript`)把
`Element.prototype.getBoundingClientRect` / `getClientRects` /
`window.getComputedStyle` / `HTMLElement.prototype.offset*` /
`Element.prototype.client*` / `scroll*` / `window.inner*` 全部包一层计数,
并用一个「当前是否在 rAF 回调里」的标志分桶 —— 承诺的是**每帧零次**,
不是"总共零次"(ResizeObserver 那一次本来就不是每帧的)。

一次完整交互流程(划动 + 点击 + 悬停 + 退场 + 换 preset + 拖滚动条)之后:

```
已渲染帧数 524
rAF 回调内 0 次   ✓
rAF 回调外 0 次
```

**两个桶都是 0。** 不是"很少",是一次都没有。

---

## 7. `prefers-reduced-motion`

打开后(系统设置或页面上的模拟开关,两条路都生效;`matchMedia` 的
`change` 事件也监听着,用户中途改设置立刻生效):

- 水面 `time` **恒为 8.0**(`contract.ts` 规定的定格时刻);
- 球光静态:悬停弹簧被**吸附**到静息值 1.0,自转相位归零,不再有任何收敛过程;
- **不注入任何涟漪**(所有 `pointerMove` 落进 `suppressedByGate`);
- 所有阻尼量(滚动、风速、曝光包络)一并吸附到目标 ——
  **不吸附的话弹簧还在收敛,连续两帧就不一样,"定格"是假的**;
- 调用方可以据此完全不进 rAF(`director.reducedMotion` 是公开字段)。

实测(1920×1080,`gl.readPixels` 逐像素比):

```
三帧 hash  6ef35f5 / 6ef35f5 / 6ef35f5
三帧 t     8.000 / 8.000 / 8.000
逐像素差   帧1→2: 0 · 帧2→3: 0        ✓
定格中再划 41 下  收到 41 · 注入 0 · 闸门挡掉 41   ✓
```

帧状态层面(纯 Node)另有一条:连续两次 `update()` 之后
`JSON.stringify(getFrameState())` 完全相同。

---

## 8. 回归(硬性)

本卡不该改到着色器,但要跑一遍证明。

```bash
for p in near mid night; do node golden/w3/run.mjs $p --time 2.5 --out /tmp/reg-$p.png; done
md5sum /tmp/reg-{near,mid,night}.png golden/refine/{near,mid,night}-t2.5.png
```

| preset | 分数 | md5 | 与 `golden/refine/*-t2.5.png` |
|---|---|---|---|
| near | **0.859** | `4add2a379d1c5c496fab2c209f968ab6` | **逐字节相同** |
| mid | **0.913** | `2644c60d6ff7826839c8e572150f50b0` | **逐字节相同** |
| night | **0.930** | `406fab322603b07ab4a9371807bca4f8` | **逐字节相同** |

`golden/refine/` 下另外 9 张(t=0 / 1.0 / 5.0)的 md5 也一字未动 ——
本卡没有任何产物重建。

---

## 9. 接线(W8 会长这样)

```ts
const dir = new WaterDirector({ from: "night", to: "mid", orbSource: readTimeline });
const unbind = dir.bindReducedMotion();          // matchMedia + change 监听

new ResizeObserver(([e]) => dir.setViewport({    // ← 唯一的尺寸来源,不是每帧
  left: 0, top: 0, width: e.contentRect.width, height: e.contentRect.height,
})).observe(canvas);

canvas.addEventListener("pointermove", (e) => dir.pointerMove(e.offsetX, e.offsetY, e.timeStamp));
canvas.addEventListener("pointerdown", (e) => dir.pointerDown(e.offsetX, e.offsetY));
canvas.addEventListener("pointerleave", () => dir.pointerLeave());
orbEl.addEventListener("pointerenter", () => dir.setOrbHover(true));
orbEl.addEventListener("pointerleave", () => dir.setOrbHover(false));
ScrollTrigger.create({ onUpdate: (s) => dir.setScroll(s.progress) });   // HR-6 起

function frame(now: number) {                     // ← 调用方拥有 rAF
  dir.update((now - last) / 1000);
  dir.setRippleField(solver ? solver.field() : null);
  for (const im of dir.drainImpulses()) solver?.injectImpulse(im.world, im.strength, im.radius);
  render(dir.getFrameState());                    // 每帧复用的对象,别持有引用
  if (!dir.reducedMotion) requestAnimationFrame(frame);   // 定格时干脆不进 rAF
}
```

`beginOrbExit()` 挂在 HR-9 的咬合 `onComplete` 上;回滚时 `cancelOrbExit()`。

---

## 10. 没做到的 / 交给 W8

- **球位没有跟着滚动插值。** 编排器插相机与冲击尺度,**不插球位** ——
  球位来自时间线,是调用方的事。后果在预览台上看得见:选 night preset
  再把滚动拖到 1(夜景着色 + 中景相机),HUD 从「灯球 22 斑」变成
  **「灯球 0 斑」**。因为 night 的球位是为 4 m 机位定的(`worldRadius` 1.8 m,
  球心解在 36 m 外、13.7 m 高),换成 1.6 m 机位之后光斑全落到画框外 ——
  和 `water-orb-coupling.md` §3 那条「night 的可见水面从 24.3 m 才开始」是同一件事。
  **HR-6~HR-8 的球位时间线必须与滚动共用同一个进度量**,否则一滚动灯球就熄。
  这条归 W8(那里才有真的球时间线)。
- **真实 GPU 帧时间未测**(容器无显卡,SwiftShader 上 1920×1080 ~1 fps)。
  编排器本身每帧是 O(1) 的标量运算(约 60 次浮点 + 4 个弹簧子步),
  但「主线程 JS <2 ms」这条要在真机上量 —— 归 W9。
- **真机上的 40 ms 节流未在真鼠标事件下验证**,只在合成 8.3/16.7 ms 事件流上验证过
  (§5.2)。原因是容器把真事件饿到 121 ms 一发,见 §5.1。
- **`WaterFrameState` 每帧复用同一个对象**(零分配),消费方持有引用会拿到下一帧的值。
  目前只有预览台一个消费方,W8 接线时要记住。
- 预览台的 `window.__wd` 是**验收钩子**,不是 API。W8 的组件里没有它。

---

## 11. 坑(本卡新踩的)

### 坑 A · 半隐式欧拉把 ζ=0.8 跑成了 ζ≈0.95

见 §3.2。**症状是"参数写了但没生效"的变体**:文档、代码、注释三处都写 ζ=0.8,
跑出来的过冲却只有解析值的五分之一。发现它的唯一办法是**把过冲量出来跟
解析式比**,不是看曲线"像不像"。ω·h ≤ 0.05 之后回到 1.2% vs 解析 1.5%。

### 坑 B · 参数之间的隐含约束(`windRecover < idleAfter`)

见 §3.6。两个数各自都"合理",组合起来风速在 0.60~0.87 之间来回荡,永远回不满。
这类错在单参数扫描里看不见 —— 必须跑一条**包含交互事件的时间序列**。

### 坑 C · 指数阻尼永远到不了端点 → 1e-15 的尾巴

见 §3.4。不吸附的话 camHeight 是 1.600000000000001,任何以后的逐字节回归都会
带一个无法解释的小尾巴。

### 坑 D · 验收脚本里的陈旧 `boundingBox()`

第一版验收脚本在 `page.click("#rm")` 之后继续用开头量到的画布 box。
Playwright 的 `click` 会把目标滚进视口 —— 画布跟着上移,后面几段
"划 40 下"全落在画布外面,量出来是 **"收到 0 个 pointermove"**,
而脚本还打了个 ✓(0 注入嘛)。**"通过"和"根本没跑"长得一模一样。**
改成每段之前重新问一次 box,按钮一律用 `el.click()` 触发不走 auto-scroll。
这是 `water-reference-metrics.md` §14 坑 12「分数对画框外的东西完全免疫」的
同类:**验收本身也会对"什么都没发生"免疫。**
