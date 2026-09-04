# W4 · 量化呈现层(`dither.glsl.ts`)

> 2026-09-04。承接 `docs/water-reference-metrics.md` §11 与 `docs/adr-water-route.md` §4.2。
> 体例照那两份:先给数字,再给坑,不给形容词。

---

## 1. 这一层是什么

连续亮度 `lum` → 两色 1-bit 画面的最后一步。模块 `src/components/lab/water/dither.glsl.ts`,
契约 §3 的 `uDither` 前缀 + `water` 前缀函数,对外两个入口:

```glsl
float waterDitherThreshold(vec2 frag);        // 屏幕像素 → 阈值 [0,1)
vec3  waterDitherApply(vec2 frag, float lum); // 亮度 → 最终 RGB
```

W4 之前这段逻辑是 `golden/w3/build.ts` 里从 W2 preview 抄来的 TAIL 临时壳。
搬进模块的同时按契约改名:

| 旧名(W2 壳) | 新名(W4 模块) |
|---|---|
| `uPixel` | `uDitherPixel` |
| `uQuantize` | `uDitherQuantize` |
| `uInk` | `uDitherInk` |
| `uPaper` | `uDitherPaper` |
| `uBlueNoise` | `uDitherNoise` |
| `uDitherAniso` | 不变 |

改名后三个 preset 的输出 PNG 与改名前**逐字节相同**(md5 一致),分数一位不差。
这是「有没有漏改某处默认值」的唯一可靠检查——分数相同不够,md5 相同才够(§11 坑 7)。

旧名在 `scripts/water-harness.mjs` 的默认表里**保留不删**:`spike-a.glsl.ts`、
`golden/w2/preview.frag`、`golden/baseline/current-water-dither.frag` 还在用它们,
删掉 W0/W1/W2 的黄金帧就复现不出来。

## 2. 参数与 preset 值

| uniform | 含义 | 渲染台默认 | near | mid | night |
|---|---|---|---|---|---|
| `uDitherPixel` | 抖动单元边长(物理 px) | 3 | 2 | 2 | 2 |
| `uDitherAniso` | 横向压缩量,0=方颗粒 1=压到 0.30 | 0.7 | **0.0** | **0.8** | **0.0** |
| `uDitherQuantize` | 0=连续灰度 1=两色 | 1 | 1 | 1 | 1 |
| `uDitherInk` | `--water-ink` #32331A | 同左 | | | |
| `uDitherPaper` | `--water-paper` #E6FEFD | 同左 | | | |
| `uDitherNoise` | 蓝噪声 128²(R8,NEAREST+REPEAT) | 显式绑 | | | |

`WATER_DITHER_ANISO_MIN = 0.30` 是模块内的 const,不是 uniform:它与三个 preset 的
`uDitherAniso` 是**一套扫出来的**,单独改它等于把三个 preset 的 `dashAspect` 一起推走。

**`uDitherAniso` 的默认值不是 0.65,也不是「越大越好」。** W3 结题写过「用各向异性把
划线拉长」,那条是对着**坏掉的** `dashAspect` 得出的,方向是反的(§9 坑 6)。
修正口径下 mid 的划线已经够长(2.23 / 基线 3.5),near 更是超了一倍(aniso=0.8 时
3.17 / 基线 1.5),归零才压回 2.00 进区间。

## 3. 色板 token

`src/styles/globals.css` 的 `:root` 新增:

```css
--water-ink:   #32331a;
--water-paper: #e6fefd;
```

取样自《奥伯拉丁的回归》截图:暗色占 81.1% 的像素、亮色占 3.8%。
组件必须从 token 读、解成 vec3 喂 `uDitherInk`/`uDitherPaper`
(AGENTS.md 扩展性红线:组件里不许出现字面量色值)。
`golden/w3/run.mjs` 与 `scripts/water-harness.mjs` 里写死的 `[0.196,0.2,0.102]`
是**脚本不是组件**,允许保留,已在原处注释指向 token。

暗色模式(`[data-theme="dark"]`)给 `#14150b` / `#9fb3b1`:**只压亮度、不翻极性**。
翻极性会让标尺按 baseline 指定的墨点侧统计的 `featureCoverage` 直接量反(§4 坑 4)。
两色明度差从 0.79 降到 0.53,抖动可用阶数变少但仍远超 1-bit 判定所需。

## 4. 自测:`node scripts/water-dither-check.mjs`

四项,`water-metrics.mjs` 一项都量不到(它只看单张成品图)。全部实测通过:

### A 确定性

`mid` preset,`--time 2.5`,两次独立渲染(两次浏览器启动)→ **逐像素差 0**。

### B 时间稳定性(阈值图不许跟着 `uTime` 走)

两个层次:

1. **隔离测**:线性梯度探针(`lum` 只由 `frag.x` 决定,与 `t` 无关),
   t=0 与 t=5 → **逐像素差 0**。
2. **端到端测**:`night` preset t=0 与 t=5。`waterShadeSky(rd)` 不吃时间,
   所以天空那片像素的 `lum` 恒定;若阈值图跟着 t 走,天空的墨点必然重排。
   实测:**自顶 796 行(73.7%,正是天空区)逐像素完全相同**,第一条差异行
   出现在第 796 行(水面起始处),全图差异 13 774 像素,全在水面上。

结构性保证:`waterDitherThreshold(vec2 frag)` 的签名里只有 `frag`,
既不吃 `uTime` 也不吃逆投影出来的水面坐标 `p`。

### C 线性度

1920×1080 的左黑右白线性梯度当 `lum`,按列分 128 箱量暗覆盖率。
理想是 `cover = 1 − lum`(阈值在 [0,1) 上均匀 → 暗的概率就是 1−lum):

| 阈值图 | R² | 拟合斜率 | 相对理想直线的最大偏差 | gridArtifact |
|---|---|---|---|---|
| **蓝噪声 aniso=0** | **0.9999** | −1.000 | 0.011 | **0.00%** |
| **蓝噪声 aniso=0.8** | **0.9996** | −0.999 | 0.021 | **0.00%** |
| Bayer 8×8 aniso=0 | 0.9986 | −1.001 | 0.025 | **99.96%** |
| IGN aniso=0 | 1.0000 | −1.000 | 0.001 | **95.13%** |

验收线 R² ≥ 0.98 / gridArtifact < 2%,两个 aniso 档都过。

**注意读法**:线性度这一列**三种阈值图都近乎完美**(Bayer 甚至比蓝噪声的最大偏差
只差 0.014)。有序抖动本来就线性——它是排好序的阈值阶梯。
**线性度不是选蓝噪声的理由**,`gridArtifact` 那一列才是。

### D 对照:Bayer / IGN(这个模块存在的理由)

W1 记录的是 Bayer 64% / IGN 76%(`docs/water-reference-metrics.md` §6 与 ADR §4.2)。
在梯度台上复现出的是 **99.96% / 95.13%** —— 同一个结论,数字更极端,
因为梯度台是纯抖动、没有水面结构稀释高频谱。

---

## 5. 坑 8 · `gridArtifact` 在我们自己的黄金帧上**抓不到 Bayer**

这是本卡最重要的发现,又是一次「分数骗了人」。

把 `mid` preset 的阈值函数原地换成 Bayer 8×8 与 IGN(其余一字不动),跑标尺:

| 阈值图 | `gridArtifact` | 相干度 | 总分 | 输出 md5 |
|---|---|---|---|---|
| 蓝噪声 128²(现状) | **0%** | 0.956 | **0.951** | `788de195…` |
| Bayer 8×8 | **0%** | 0.972 | 0.864 | `6b6cbc6c…` |
| IGN | **0%** | 0.964 | **0.951** | `71f639f6…` |

三个 md5 互不相同 → 换阈值确实生效了(§11 坑 7 的例行检查)。
但 `gridArtifact` **三个都是 0**,而它的名字就叫「抓 Bayer 网纹」。

**为什么**:`gridArtifact` 在**峰值带的墨点掩码**上量,mid 的峰值带只有 108 行高
→ 列方向 FFT 补零到 128 点 → 0.4×Nyquist 以上只剩 **64 个谱线**,
而 `spikiness` 判尖峰要求 `spec[k] > 8 × median(±15 窗)`——窗口宽度 31 已经吃掉
整个高频段的一半,再宽的峰也顶不到中位数的 8 倍。
换句话说:**在 108 行的带上,这项指标没有分辨率去发现周期性。**
§6 里那个 64.37% 是在改造前的 `water-dither.tsx` 上量的,那张图的构图与网点尺度
恰好让谐波落进了它能看见的窗口,不是这项指标普遍有效的证据。

**后果**:三个 preset 打分表上那个漂亮的 `gridArtifact 0%` **不能**当作
「蓝噪声在起作用」的证据 —— Bayer 也是 0%。真正有判别力的是
`scripts/water-dither-check.mjs` 的梯度台(99.96% vs 0.00%),
以及肉眼(§6)。**验收抖动层必须跑梯度台,不能只看 preset 分数。**

顺带一个更细的读数:换 Bayer 之后**相干度反而涨了**(0.956 → 0.972),
IGN 也涨(0.964),总分 IGN 与蓝噪声**完全相同**(0.951)。
这三个数合起来说明:现有九项指标里没有一项在惩罚有序抖动。
若 W8 要给标尺补一项,应该补的是「反抖动残余的方向性」,不是再调 `gridArtifact` 的阈值。

---

## 6. 肉眼看到了什么

裁剪放大(最近邻 4~6 倍)比对过的图:

**梯度台中灰区(lum≈0.5),960×540 放大:**
- **蓝噪声**:各向同性的不规则迷宫。找不到重复母题,找不到方向偏好,
  墨点之间没有成簇的空洞——void-and-cluster 该有的样子。
- **Bayer 8×8**:**规整的棋盘格**,叠着周期性的「十」字超结构,
  每 16px 一道硬竖缝。就是 `NEXT.md` 里那句「满屏纸碎屑」。
- **IGN**:**斜向斜纹布**。整片朝同一个方向倾斜的平行短杠,像斜纹粗呢。
  ADR §4.2 记的「斜向布纹」一字不差。

**`golden/w4/w4-night-t2.5.png` 月光路径(400×225 放大):**
向观察者方向张开的亮楔形,横向暗波纹一道道切过去,越近越长越粗;
楔形两侧边缘化成细密的**各向同性方颗粒**(night 的 aniso=0,与设定一致),
没有十字纹、没有斜纹、没有成团的墨块。天空是稀疏的亮点,密度均匀不结块
——那是极低亮度下的 1-bit 点画,不是噪点。
一处可记的形态:楔形正中有一道**贯穿的窄亮竖缝**把光路劈成两瓣,
那是 `uShadeLightAz=0` 的镜面脊,物理上该最亮,但边缘偏硬。

**`golden/w4/w4-mid-t0.png` vs `t5.0` 同一区域(240×135 放大):**
波带整体换了形状(水在动,正确),而带边缘的抖动颗粒**没有整体滑移方向**;
颗粒本身是 ~3px 宽 × 2px 高的横向短杠,与 `uDitherPixel=2` × `ANISO_MIN=0.30`
在 aniso=0.8 下算出来的形状一致。配合 §4-B 天空区 796 行零差异,
阈值图锚在屏幕像素这条成立。

**`golden/w4/w4-near-t2.5.png` 峰值带(240×135 放大):**
大片实心墨带与纸带交替,横向贯穿整个裁剪框——就是 §11 结尾说的「木纹」。
抖动颗粒**只出现在带与带的过渡处**,带内部完全饱和(`lum` 离阈值区间太远)。
即 near 的 `featureCoverage` 38.5%(基线 23.7)**不是抖动层的问题**,
是波场的划线太长太平行太厚。抖动层在这里唯一能做的事(边缘颗粒)做对了。

---

## 7. 没做到 / 留给后面

- **near `featureCoverage` 38.5% vs 基线 23.7%** —— W4 未动,也动不了。
  §11 已证伪谱斜率方向,§6 的肉眼观察进一步指向波场的 `uFieldSpread`/`uFieldWander`
  或重定构图,属 W8。
- **night `dashAspect` 0.42 vs 基线 0.23** —— 月光楔形不够竖。
  试过的方向没有一个属于抖动层:`uDitherAniso` 已经是 0(最不横向拉伸的档),
  再往「纵向拉伸」走需要给 `WATER_DITHER_ANISO_MIN` 加一个 y 方向的对偶量。
  没做,因为它会同时动 near/mid 的 `dashAspect`,而那两个现在都 PASS,
  收益(night +0.03 上限)不抵风险,应该等 W8 连同波场一起扫。
- **`spectralLineiness` 三个 preset 都 FAIL(94.99 / 94.91 / 96.44)** —— 与 W4 无关,
  §4 坑 5 已说明这项判别力弱、权重 0.05、当告警不当门槛。
- **`npm run build` 未验证** —— 本容器出口白名单挡掉 `binaries.prisma.sh`,
  prisma 引擎拉不到。**合并前必须在本机跑一次 `npm run lint && npm run build`。**
- **`npm run lint` 有 13 errors / 7 warnings,全部是既有的**
  (`src/components/lab/water-dither.tsx` 的 `react-hooks/refs`、
  `campfire-dither.tsx`、两个 `scripts/*.mjs` 的 console 规则)。
  在 `feat/water-orb` 的父提交上跑是同样的 13/7,W4 一条没新增,也一条没修
  (不在本卡范围)。
