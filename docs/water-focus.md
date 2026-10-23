# W10 · mid 聚焦态(`uOrbFocus` / `waterOrbFocusDim`)

> 2026-09-05。体例照 `docs/water-ripple.md`:先给数字,再给坑,不给形容词。
> **只对 mid 定标。** near 已按用户要求冻结,night 归 W11 —— 两者的 preset
> 一个数都没动,黄金帧逐字节复现。

---

## 1. 为什么是「压暗」而不是「加亮」

mid 前景的 tonemap 输出算出来是

```
out = (lum − uShadePivot) · uShadeContrast + uShadePivot + uShadeExposure
    = (0.62 − 0.48) × 8 + 0.48 + 0.10 = 1.70        →  clamp 到 1
```

**头顶 70% 的余量全浪费。** 往饱和白上加光,什么都不会发生 —— 这就是 W5 的灯球
在 mid 上「亮不起来」的算术根因(`docs/water-orb-coupling.md`:三条加法通道
全开也只改到 0.12% 的像素)。

反过来看这条式子:tonemap 只在

```
lum ∈ (0.48 − 0.58/8, 0.48 + 0.42/8) = (0.4075, 0.5325)
```

这个 **0.125 宽**的窗口里给得出中间调,窗口之外非纸即墨。所以 mid 上唯一有效的
「照亮」手段是把**没被照到的地方推出窗口下沿**,用对比而不是加法。

顺带一个好处:`foregroundFlatness` 是**减掉 41 px 盒模糊之后**量的,平滑渐晕属于
大尺度亮度,那一步会把它减掉;全局压 `uShadeBody` 则是给整片撒网点,RMS 必涨
(实测 body 0.62→0.52 时前景平坦度 0.00→0.166、覆盖率 16.9→44.2、总分 0.913→0.817)。

## 2. 通道的形状

`light.glsl.ts` 的**第四条通道**,与前三条(波幅 / 照度 / 环境注入)的区别是:
**它是乘法。**

```glsl
float dist        = length(p - uOrbGround);                       // 世界空间,米
float edge        = 1.0 - smoothstep(uOrbPoolR*0.45, uOrbPoolR, dist);
float pool        = step(waterDitherThreshold(gl_FragCoord.xy + vec2(40,72)), edge);
float speck       = waterVNoise(p * uOrbGrain + uOrbSpinPhase);
float lit         = pool * mix(0.55, 1.0, step(uOrbGrainBias, speck));
float far0        = uOrbGround.y - uOrbPoolR;
float depthWeight = smoothstep(far0, far0 + uOrbPoolR * 0.7, p.y);
float keep        = mix(1.0, uOrbFarKeep, depthWeight);
return mix(1.0, mix(uOrbAmbient, 1.0, lit), uOrbFocus * keep);
```

`shade.glsl.ts` 里的落点:

```glsl
float body = (uShadeBody + orbBody) * waterOrbFocusDim(p);
return (1.0 - F) * body + F * (env + spec + orbSpec);
```

**乘在 body 上,不加在 lum 上。** 加在 lum 上会把式子摊平成「分层 + 一坨常数」,
菲涅耳分层不再是对比度曲线的唯一来源(`shade.glsl.ts` ①),前景平坦度与对比度带
会一起失效 —— 这是这个项目从 W2 起反复踩的同一条。

### 闸门

`uOrbFocus <= 0.0` 时函数**精确返回 1.0**,IEEE 下 `x × 1.0 ≡ x`。
与 `uOrbEnergy` 那条闸门是同一个写法,两者**互不统属**:energy 管往水里加多少光
(加法),focus 管没被照到的地方压多暗(乘法)。energy=0 时照样能聚焦。

## 3. mid 的定标

球在 NDC(−0.44, 0.80)、`radiusNdc` 0.10、`worldRadius` 0.22 m,
`orbWorldCenter` 解出来落点 **(−1.62, 6.75) m、离水面 0.76 m**。

| uniform | 值 | 由来 |
|---|---|---|
| `uOrbPoolR` | **2.6 m** | 池子在世界空间量,近边宽、远端压扁是逆投影自己给的 |
| `uOrbAmbient` | **0.58** | ⇒ 有效 body = 0.62 × 0.58 = **0.36**,稳稳在窗口下沿之外 = 纯墨 |
| `uOrbGrain` | **2.0 /m** | 迪斯科球把光打碎;0.5 m 的噪声格在 6.75 m 处约 130 px |
| `uOrbGrainBias` | **0.42** | `waterVNoise` 的 p50 是 0.50,压到 0.42 让约六成面积保持全亮 |
| `uOrbFarKeep` | **0.28** | 见 §4 —— 这是本卡唯一一个扫出来才对的数 |
| `WATER_ORB_FAR_SPAN` | **0.7 × 池半径** | 同上,和 `uOrbFarKeep` 是一起扫的 |

`uOrbGround` **不是旋钮**:每帧从 `computeOrbUniforms().center` 的 xz 取,
所以拖球心 x 时光池同帧跟着在水面上滑过去。写死一份就会与球位漂开
(`docs/water-reference-metrics.md` §11 坑 7 那一族)。

## 4. 坑:景深权重的爬升起点(本卡最贵的一条)

第一版照任务书的起手值写:`depthWeight = smoothstep(ground.y, ground.y + 4·R, p.y)`,
`uOrbFarKeep = 0.45`。**分带 RMS 从 35.2 / 43.2 / 47.0 掉到 7.6 / 8.0 / 5.5** ——
整条对岸带死成一片纯墨,正是任务书说的"全暗那一版"。

根因是 mid 的**十条横带按屏幕等分,换算成世界深度极不均匀**:

| band | 0 | 1 | 2 | 3 | 4 | 5 | … | 9 |
|---|---|---|---|---|---|---|---|---|
| 深度(m) | 12.9–24.6 | 8.6–12.9 | 6.4–8.6 | 5.1–6.4 | 4.1–5.1 | 3.5–4.1 | | 2.0–2.3 |
| focus=0 的 RMS | 0.61 | 1.23 | 35.2 | 43.2 | 47.0 | 1.21 | | 0 |

也就是说:**"远景带"从光池的近边前面一点点就开始了,不在池子后面。**
起点放在球的落点(6.75 m)时,band 2~4 的 `depthWeight` 只有 0~0.09,
等于完全不受保护。

算术上也说得通,两个要求差着 6 倍:

- 前景(F≈0.03)要从饱和白翻成纯墨:`Δlum > 0.21` ⇒ `dim < 0.65`;
- 暗划线带(F≈0.22~0.32)只要 `Δlum > 0.13` 就整条出窗 ⇒ 要留住它 `dim > 0.87`。

所以景深权重必须在 **band 5 与 band 3 之间(3.5~6 m)**就爬满 —— 那正好是
光池近边那一段。改成 `smoothstep(ground.y − R, ground.y − 0.3R, p.y)` +
`uOrbFarKeep = 0.28` 之后是 **38.0 / 43.6 / 16.3**:band 2/3(对岸)原样保住,
band 4(池子前面那一段)按预期沉下去。

## 5. 边缘为什么用蓝噪声阈值

连续的池边坡道过 tonemap(contrast 8)之后只剩不到 1 px 的过渡带,
1-bit 下就是一条刀切的剪影边 —— 和夜景「地平线太死板」是同一个病
(`presets.ts` night 的 contrast 注释)。`step(阈值, 坡道)` 把那条坡道摊成一带网点:
`edge` 连续地从 1 走到 0,像素被点亮的**概率**跟着连续变化,局部平均就是一条平滑的
密度梯度。这才是 1-bit 画面里「渐变」的正确写法。

阈值直接复用 `dither.glsl.ts` 的 `waterDitherThreshold`,**不另写一套** ——
两种颗粒打架比硬边更难看。取样点偏移 `(40, 72)` 物理像素:

- **偶数**,而 `waterDitherThreshold` 先 `floor(frag / uDitherPixel)`,三个 preset 的
  `uDitherPixel` 都是 2 ⇒ 整格平移,溶解带与画面其余部分同一个网格;
- 平移 20 格,aniso 压缩后 `20 × 0.30 = 6` 仍是整数 ⇒ 落在同一张蓝噪声瓦片的
  (6, 36) 处,与量化那一次**去相关**。不去相关的话低阈值像素会同时"落进池里"
  又"更容易是纸",两个效果叠加,溶解带会硬回剪影边。

拼装顺序是 `… + LIGHT + SHADE + DITHER + TAIL`,阈值函数在本模块之后才拼进来,
所以 `light.glsl.ts` 里留了一行**函数原型**(GLSL ES 3.00 支持)。
不把 DITHER 提到 LIGHT 前面:那会重排整份着色器的声明顺序,而本卡的硬验收是
"focus=0 时输出逐字节不变",加一行原型是唯一零风险的做法。

## 6. `focus` 的语义与接线

```
页面 (显式调用)
  └─ WaterScene 的 focus prop  (0..1)
       └─ WaterDirector.setFocus()        ← 行⑨
            └─ 800 ms power4.inOut
                 └─ frame.focus → uniform uOrbFocus
```

- **由页面显式驱动。不绑 energy、不绑滚动、不绑 IntersectionObserver。**
  聚焦是叙事决定的:页面知道"现在该聚焦了",视口位置不知道。
- 过渡 `WATER_DIRECTOR_TUNING.focusDuration = 0.8 s`,缓动 **power4.inOut**
  (`u<0.5 ? 8u⁴ : 1 − 8(1−u)⁴`),与 `docs/homepage-animation-plan.md` 里
  lab/home 球退场那条(`motionTokens.ease.swipe`)是同一条曲线。
  手写而不是 import GSAP:`WaterDirector` 是渲染器无关的**自足类**,
  它的源码要能被 `toString()` 内联进预览台。
- **`prefers-reduced-motion` 下不做过渡,直接跳到目标**(`snapAll()` 里那两行)。
- 中途改目标从**当前值**接着走,不是从 0/1 重来 —— 快速来回切不会跳。
- 到点时把 `focus` **精确写成目标值**,不靠缓动函数在 u=1 处的浮点结果 ——
  和 `camera()` 里那条"停在端点必须与端点逐位相同"是同一个理由。
- 只有 mid 有 B 态:`WATER_PRESETS[x].focus` 为 `null` 时组件把 `uOrbFocus` 钉在 0。

## 7. 验收结果

| 项 | 结果 |
|---|---|
| `uOrbFocus = 0` 逐字节回归 | **三个 preset 全部 md5 相同**(mid `2644c60d…` / near `4add2a37…` / night `406fab32…`),显式 `--focus 0` 亦然 |
| focus 五档 md5 | 0 `2644c60d…` / 0.25 `214485cb…` / 0.5 `715841f6…` / 0.75 `824fbacc…` / 1 `2195f494…`,五个互不相同 |
| 远景带 RMS(band 2/3/4) | focus=0 **35.2 / 43.2 / 47.0** → focus=1 **38.0 / 43.6 / 16.3**,不为零 |
| 前景带 RMS(band 5~9) | focus=0 **0 / 0 / 0 / 0 / 0**(饱和白)→ focus=0.5 **19.5 / 14.5 / 13.2 / 13.4 / 13.4** → focus=1 **≈1**(纯墨) |
| `tsc --noEmit` | 本卡改到的文件 0 错 |
| `npm run lint` | 20 problems(13 errors / 7 warnings),与基线一字不差 |

黄金帧:`golden/w10/mid-focus{0,0.25,0.5,0.75,1}.png`(纯渐晕通道,灯球加法通道关闭)
\+ `golden/w10/mid-focus1-orb.png`(B 态全开:渐晕 + 灯球三条加法通道)。

肉眼(1920×1080,t=2.5 s):

- **focus = 0** —— 上缘一条几乎纯墨的窄带(远水),中部一条横向暗划线带,
  下面 55% 是**一整片没有任何结构的饱和白**。这就是 `foregroundFlatness = 0.00`
  的样子:前景不是"平坦",是**烧掉了**。
- **focus = 0.5** —— 五帧里最好看的一张。前景那片白**回到了抖动窗口里**,
  露出细密的波纹网点与几条弯折的暗划;暗划线带原样;光池表现为中左一块
  更亮更密的区域。整幅画面第一次是"处处有结构"。
- **focus = 1** —— 前景与远水沉成纯墨(只剩零星白点),中部留下一条亮带,
  带内偏左有一块明显更亮更密的**透镜形光池**:下缘宽、上缘被压扁,
  边界散成一带网点而不是一条硬边。拖球心 x 到 +0.55,这块光池整个搬到画面右侧
  —— 它是世界空间的池子,不是贴在屏幕上的椭圆。
- **`mid-focus1-orb.png`** —— 加上灯球的三条加法通道后,与上一张的差别只有两处:
  亮带下缘偏左(约 x=575, y=480)多出**一个孤立的亮点**,那是 `waterOrbSpecular`
  的镜面光路(球在水里的像);带内偏左几条划的形状被 `orbPatch` 搅动过。
  差别就这么点大 —— mid 上加法通道本来就只改 0.55% 的像素,
  **这恰恰是本卡存在的理由**。
- **focus = 0.25** —— 几乎还是 A 态:前景仍是大片饱和白,只有远岸那几条暗划
  略微增厚、中下部开始冒出零星纹理。0 → 0.25 → 0.5 → 0.75 → 1 逐档看过去
  是连续变暗,没有任何一档出现跳变。

## 8. 没做到的 / 明确不做的

- **B 态不对实拍照跑分。** 它已经不是那张中景照了,九项指标对它没有意义。
  参考值:focus=1 的加权总分 0.676(A 态 0.913),掉分几乎全部来自
  "前景平坦度"与"分带对比度曲线相关"—— 前者量的是"前景相对峰值带有多平",
  B 态的前景是**故意压黑**的;后者比的是与那张实拍照的曲线形状。
  **这两项对 B 态没有物理含义,不许拿它们当调参目标**(口径变更见任务书 §3.4)。
- **`uOrbAmbient` 的取值是有代价的。** 0.58(有效 body 0.36)让池外沉成纯墨,
  "聚焦"读得最清楚,但整幅画面约 75% 变成没有结构的实心色。
  实测 0.70(有效 body 0.434)时前景回到窗口内(band 5~9 的 RMS 19.9 / 15.7 /
  13.9 / 14.0 / 14.0),纹理全在,但**整张图变成一片均匀的中灰,"聚焦"这件事读不出来**
  —— 与任务书说的"0.45 太亮"一致。定稿取 0.58;想要"暗但有纹理"的中间口味,
  拖预览台的「池外亮度」到 0.66 附近,或者干脆把闸门停在 0.5~0.7。
- **光池落在 6.75 m,那是 W5 为加法通道挑的球位**(`radiusNdc` 0.10 让光斑落进
  暗划线带)。对**减法**通道而言最有利的落点其实在前景 —— 那里有 70% 的
  clamp 余量可以回收,池子会像探照灯一样在墨底上切一个洞。但球位是 W8 行⑧
  滚动插值的端点、`build.ts` 有断言,**改它等于改 A 态**,不在本卡范围内。
  留给 W11 一并考虑。
- **night 的聚焦态**归 W11。本卡 night 的 `focus` 块是 `null`,uniform 默认 0。
- **真实 GPU 帧时间**未测,容器无显卡 —— 与 W6/W9 同一条。
  本通道每像素约 1 次 `length` + 1 次 `smoothstep` + 1 次 `waterVNoise`(4 次 hash)
  + 1 次蓝噪声取样,focus=0 时第一行就返回、全部跳过。
