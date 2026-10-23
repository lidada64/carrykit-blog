---
name: carrykit-water-orb
description: 在 carrykit 仓库里继续做 1-bit 水面（Obra Dinn 风格）或迪斯科灯球的活时用：红线、必知约定、资产复现流水线、验收闸门，以及已经花代价证伪过的路。
---

# 水面 / 灯球 —— 接手指南

这份 skill 是**索引与流程**，不是全部细节。真正的内容在两份长文档里，
动手前**必须**读完对应的那一份：

| 你要动什么 | 先读 |
|---|---|
| 水面着色 / 波场 / 涟漪 / 编排器 / 性能 | `docs/water-handover.md`（§0~§7，全景 + 每张待办卡的契约） |
| 灯球建模 / 抖动 / 精灵图 / 接入页面 | `docs/blender-assets.md` §F、**§G**（实测数据 + 全流程 + 四个坑） |
| 某个参数为什么是这个值 | **代码注释**。这个仓库的注释写的是「为什么」和实测数，不是「做了什么」 |
| 某个指标为什么这么动 | `docs/water-reference-metrics.md` —— 权威标尺 + 21 个坑的全部记录 |

**代码注释是第一手资料，文档是索引。** 两者冲突时以注释为准，并在提交信息里指出冲突。

---

## 1 · 先跑这一条，别手敲

```bash
node scripts/water-gates.mjs
```

四道闸门 + 黄金帧自身的 md5 + lint 基线，一条命令跑完。**每次提交前跑它。**
闸门 ④（组件的零 DOM 读取 / reduced-motion）需要 dev server：

```bash
npm run dev                       # 另开一个终端
node scripts/water-gates.mjs --with-scene
```

闸门说的是：⓪ 黄金帧没被悄悄换掉 · ① 三个 preset 不开灯球时逐字节不变 ·
② 灯球 `energy = 0` 时水面一点残光都没有 · ③ `focus = 0` 与展示态逐字节相同 ·
④ 组件每帧零 DOM 读取，`prefers-reduced-motion` 下连续两帧逐像素相同。

---

## 2 · 红线

1. **`WATER_PRESETS.near` 是冻结的。** 它是定过稿的构图，不许动。
2. **菲涅耳分层是不变量**：`lum = (1−F)·body·dim + F·(env + spec + orbSpec)`。
   任何「让某处亮一点」的改动都不许绕过这条分层去加常数。
3. **色值只能来自 `src/styles/globals.css` 的 `:root` token。** 组件里不许出现字面量色值。
   已有的例外只有 `disco-ball.module.css` 的光晕与星环（记录在 `docs/dev-overrides.md` DV-1），
   换成 B-3 资产时要一并清掉。
4. **不许加框架、UI 套件、状态库或任何重依赖**，除非用户明确同意。
   栈是锁死的：Next.js 16 / TypeScript strict / Tailwind 4 / GSAP / Prisma / SQLite。
5. 不许 `any` / `@ts-ignore`，不许跳过类型检查或 lint，不许 `--force`，
   不许删 SQLite 数据文件或 migration。

---

## 3 · 三条不知道必然写错的约定

**三套坐标系，第三轴符号不同。** 相机空间、场坐标、Blender 世界坐标。
`orbWorldCenter` 返回的是 `[x, 离水面高度, −z_相机]`。跨层抄数之前先确认是哪一套。

**单一真相来源。** 同一个量抄第二遍就会漂（这是坑 7）。典型：
光池中心 `uOrbCenter.xz` 是球心的派生量，shader 直接取，不许另存一份；
灯球精灵图的几何（球径 / 球心 / 行列）只在 `public/orb/orb-loop.json` 里，
组件从它算，**不许手抄进 CSS**。

**GLSL 写在 TS 模板字符串里。** `export const SRC = \`...\`` —— 注释里出现一个反引号
就会提前终止模板串，报错位置还是假的（`TS1005: ',' expected` 指向莫名其妙的行）。
**写 GLSL 注释时一个反引号都不许有。** 这条踩过两次。

---

## 4 · 两条工作方法

**分数只能证伪，不能证真。** 指标对「东西落在画框外」完全免疫 —— 灯球第一版光斑
全在框外、涟漪 night 第一版只翻动 81 个像素，九项指标一位不差。所以每张卡都要附黄金帧，
而且**提交的人必须真的用眼睛看过**。只贴数字不算。

**「怎么调都没反应」先算几何，别先怀疑代码。** 一条通道可以被几何完全禁止，
而消融开关不会告诉你：「关掉它画面没变」「它本来就没起作用」「它坏了」三者表现一样。
先算 `dot(N,H)`、算落点在不在画框内。

**只有把页面真跑起来才发现的问题，静态推理通不过。** 最近一轮有两个（掩码没 alpha、
标题球尺寸）都是截图才暴露的。改了渲染路径就跑一次：

```bash
npm run dev
# headless 截图。注意两点，都写在 §5
```

---

## 5 · 环境的坑（不要试图「修」它们）

- **`npm run build` 在云容器里跑不起来** —— 出口代理挡了 `binaries.prisma.sh`，
  Prisma client 生成不了。这**不是**要修的东西，本机能跑。
  容器里只能验 `npm run lint` 和 `npx tsc --noEmit`（后者有 3 条同源的既有报错）。
- **`git push` 是 403**（仓库不在授权集里）。交付走 bundle / patch：
  `git format-patch -N --stdout > out.patch`。
- **Blender MCP：每次调用控制在 30 秒以内。** 超时会掉 socket，而且掉过一次
  **直接把 Blender 崩了、内存里没保存的全丢**。所以：渲染分批（一次 8 帧约 30 s）、
  建场景与渲染**分两次调用**、每次改完立刻 `bpy.ops.wm.save_mainfile()`。
  场景永远是 `blender/orb-build.py` 的输出，不是一串手工操作的沉淀。
- **Playwright 自带的浏览器版本号对不上**：
  `chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })`。
  **不要**跑 `playwright install`。
- **容器里截首页整页是一块 `#1a1a1a`** —— preloader 的幕布（`z-[60]`）不落幕，
  因为它的计数动画在等被出口代理挡掉的 Google Fonts。不是页面 bug，截图前：
  `document.querySelectorAll('[class*="z-[60]"]').forEach(e => e.remove())`。
  水面 canvas 在软件 GL 下每帧很慢，只看 DOM 时可以一并 remove 掉。

---

## 6 · 灯球资产怎么重出一遍

全流程与每个参数的来由在 `docs/blender-assets.md` §G。五条命令：

```python
# 1) 建场景（在 Blender 的 Scripting 里，或经 MCP）。跑完自动存盘
exec(compile(open(r"...\orb-build.py", encoding="utf-8").read(), "orb-build", "exec"))
```
```bash
# 2) 渲 1..48 帧到 loop/（每帧约 3.1 s，一次 8 帧）
# 3) 量化：--pixel 2 --aniso 0 --contrast 2.2
node scripts/orb-dither.mjs <raw_dir> <dith_dir> --pixel 2 --aniso 0 --contrast 2.2
# 4) 打包
node scripts/orb-pack.mjs <dith_dir> public/orb/orb-loop --cols 8 --deg 90
# 5) 回测 —— 拿它证伪，不是证真
node scripts/orb-measure.mjs <帧> --alpha
```

三个参数的道理（改之前先懂）：

- **`--aniso 0` 灯球必须是 0。** 各向异性是把阈值图在 x 向压扁让墨点连成横划 ——
  那是水面的语言（波脊是横的）。球面没有「横」的理由。
- **`--pixel` 由 `PIXEL · D = F` 定。** 水面的抖动格是**后备缓冲像素**，
  DPR 2 档位 0 时等于 2 设备像素；精灵图帧宽 F 按 CSS 宽 D 显示时一格是
  `2·PIXEL·D/F` 设备像素。当前交付是 F=360 配 PIXEL=2。
- **`--contrast 2.2` 是给 Cycles 补的**，水面没有这一档。水面的 lum 是逐片元解析算的，
  亚像素细节走 σ²（展宽分布）不是求平均，中间调全是真色调；Cycles 是像素内超采样
  再平均，瓦片边缘那一两个像素的灰是**抗锯齿**。不压掉它，网格会被噪点啃成毛边。

**回测要和参考图同尺度才有意义**：标定模式用 `RES=672 + CAM_LENS=78`（球径 470 px，
参考图是 472 px）；交付模式是 `RES=360 + CAM_LENS=100`。`CAM_LOC` 两种模式都不许动 ——
那条透视纬度换算只依赖距离 D。

---

## 7 · 还剩什么

每张卡在 `docs/water-handover.md` §4 里有固定格式的契约
（**目标 / 你会拿到什么 / 交什么 / 怎么算做完 / 已知陷阱 / 不许做**），
「怎么算做完」全部是可执行的，不是形容词。

- **T1** 灯球时间线 → 水面联动（水面这侧已做完，只差把球的生命周期喂进两个 prop）
- **T2** 主页 HR-1 ~ HR-10 叙事时间线
- **T3** `ball-waterlight`（B-4）资产 + 灯球模式 B 验证
- **T4** mid 聚焦态的真实落点
- **T5** 真机性能三条（容器里量不了，要本机 GPU）
- **T6** 三条美术方向 —— **做之前先找用户确认**
- **T7** 灯球尺寸与粗瓦 LOD —— **做之前先找用户确认**。
  已量到的事实：标题里那个字母 O 是精灵原生尺寸的 0.13~0.51 倍，
  而水面标定的灯球是 0.88 倍。水面那颗正好合身，标题那颗小了 2~8 倍。

还没做的资产：**B-3 `ring-loop`**（土星环已在 `orb-build.py` 里建好、渲染时默认
`hide_render`。环比球宽 2.3 倍且**不转**，单独出一张静图比塞进循环划算）。

---

## 8 · 提交

Conventional Commits，一张卡一个 commit。提交信息里写清楚：
改了什么、**为什么**、掉了哪项分数以及换到了什么。
只改自己那张卡的文件；动了 `contract.ts` 要说明原因。
`npm run lint` 必须与基线（20 problems）持平。
