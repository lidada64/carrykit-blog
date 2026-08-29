# /lab/home 滚动收缩转场:Hero → What is CarryKit

> **状态**:2026-08-29 立项。基于已完成的「自相似无限自嵌套」Hero 原型
> (`/lab/home`,见 `src/components/lab/home-scene.tsx` + `cursor-mirror.tsx`),
> 追加**滚轮向下的收缩转场**:整帧 Hero 以右下角嵌套页为焦点收缩进角落,腾出画面
> 显示「What is CarryKit」。本期仅在 `/lab/home` 原型落地,不动线上主页
> `src/app/(site)/page.tsx`。参照 idea/homepage方案.md §4.3–4.4 的滚动增强。

---

## 1. 一句话定位

滚轮向下 → Hero 帧以 `transform-origin: 88.125% 82.35%` 为焦点 `scale 1→1/3`,
**精确坍缩进它自己右下角那张嵌套卡**(Droste 逐像素连续),腾出的画面里淡入
「What is CarryKit」;收缩到位后角落停留一张**没有进一步嵌套**的扁平 Hero 总览小卡。

---

## 2. 核心:收缩焦点是「递归不动点」,不是嵌套卡中心

`HomeScene` 的嵌套副本把父帧的归一化坐标 `(x, y)` 映射到子帧:

```
x' = 0.5875 + x/3      (嵌套卡 left = 58.75%,尺寸 1/3)
y' = 0.549  + y/3      (嵌套卡 top  = 54.9%,尺寸 1/3)
```

这是一个相似压缩映射,其**不动点**(无限嵌套逐层汇聚到的那一点)满足 `p = 0.5875 + p/3`:

```
originX = 0.5875 / (1 − 1/3) = 0.5875 / (2/3) ≈ 0.88125  → 88.125%
originY = 0.549  / (1 − 1/3) = 0.549  / (2/3) ≈ 0.8235   → 82.35%
```

**为什么必须用这一点**:把整帧以该不动点为 `transform-origin` 缩放 `1/3`,外层帧四角
会精确落到嵌套卡四角:

```
角 (0,0)     → (88.125·2/3, 82.35·2/3)                    = (58.75%, 54.9%)
角 (100,100) → (88.125 + 11.875/3, 82.35 + 17.65/3)       = (92.08%, 88.23%)
落点矩形 = [58.75%, 92.08%] × [54.9%, 88.23%] = 右下角嵌套卡本身
```

于是外层帧 → 嵌套卡、嵌套卡 → 下一层……**每一层同步落到下一层**,收缩到位时画面与
「原来的嵌套卡」逐像素重合,无缝。若错用嵌套卡几何中心 `(75.4%, 71.6%)` 作 origin,
则落点偏移、出现可见滑移。

> 通式:嵌套 `left=L`、`top=T`、缩放 `1/N` 时,不动点 `= (L/(1−1/N), T/(1−1/N))`。

---

## 3. 机制:复用 scroll-gallery 的 pin + scrub

参照 `src/components/motion/scroll-gallery.tsx`:GSAP `ScrollTrigger` `pin` 整屏,
`gsap.matchMedia` 排除 reduced-motion,时间线用 `scrub` 把滚动进度线性绑上动画进度
(正反向可逆)。GSAP / ScrollTrigger / `@gsap/react` 均已在依赖,零新增。

```
gsap.set(frame, { transformOrigin: "88.125% 82.35%" });
const tl = gsap.timeline({ scrollTrigger: {
  trigger: stage, start: "top top", end: "+=120%",
  pin: true, scrub: true, invalidateOnRefresh: true,
}});
tl.to(frame,      { scale: 1/3, ease: "none" }, 0);       // 全程收缩
tl.fromTo(whatIs, { autoAlpha: 0 }, { autoAlpha: 1, ease: "none" }, 0.35); // 后半淡入
tl.to(nestedCard, { autoAlpha: 0, ease: "none" }, 0.7);   // 尾段:去嵌套(见 §4)
```

- `end: "+=120%"` ≈ 一屏多的滚动量走完收缩,`scrub` 让每帧进度 = 滚动进度。
- 舞台 `data-stage` 为 `h-svh` 全屏,内部两层:**What-is 层**(`absolute inset-0`,z 低,
  初始 `autoAlpha:0`)+ **Hero 帧层**(现有 16:9 letterbox 帧 + `HomeScene` + `CursorMirror`,z 高)。

---

## 4. 「无嵌套结束态」

需求:转场结束角落停留的是**没有嵌套的 Hero 总览**——无限嵌套只是转场手段,不在静止态延续。

- `home-scene.tsx` 的 `hasNested` 外层 `<div>` 加 `data-nested`,供 depth-0 实例定位。
- 收缩尾段(p≈0.7→1)把 **depth-0 的那张嵌套卡**(`stage.querySelector('[data-nested]')`,
  取第一个 = 最外层)`autoAlpha → 0`。收缩到位时它正落在右下角,淡出后角落只剩一张扁平 Hero。
- 视觉差异只在那块**已缩到几像素**的嵌套槽区域,肉眼不可辨,所以「去嵌套」不露破绽。

---

## 5. CursorMirror 门控

- 镜像光标 / 注入的 `*{cursor:none}` 只在顶部(p≈0)有意义;帧一旦被 `scale` 缩放,
  `CursorMirror` 里的 `getBoundingClientRect` 会失真、环会错位。
- `home-collapse` 在 `scrollTrigger.onUpdate` 里:`progress > 0.02` 时置 `frame.dataset.active="0"`
  (`CursorMirror` 现有逻辑据此隐藏镜像环),回到顶部再置 `"1"`。`CursorMirror` 本身无需改
  (它 mount 时置一次 `data-active`,tick 里不强写)。
- **打磨项(非阻塞)**:p>0 时顺带移除 `*{cursor:none}` 恢复原生光标。

---

## 6. reduced-motion / 兜底

`gsap.matchMedia("(prefers-reduced-motion: no-preference)")` 不匹配时不建时间线:
Hero 帧静态满屏,What-is 区块直接堆在其下常规滚动,无 pin、无缩放
(与 `scroll-gallery` 的降级思路一致)。

---

## 7. 文件计划

**新增**
- `src/components/lab/home-collapse.tsx` —— pin+scrub 收缩控制器 + What-is 层 + 帧/光标

**改动**
- `src/app/lab/home/page.tsx` —— 去 `fixed inset-0` 独占布局(需真实滚动高度),改挂 `<HomeCollapse/>`
- `src/components/lab/home-scene.tsx` —— 嵌套外层 `<div>` 加 `data-nested`

**参考复用**
- `src/components/motion/scroll-gallery.tsx`(pin + matchMedia + scrub 范式)
- `src/components/motion/reduced-motion.ts`

---

## 8. 里程碑(功能实现)

- **M1 收缩**:pin + `scale 1→1/3`(origin 88.125%/82.35%),滚动可逆。验证落点与嵌套卡重合。
- **M2 揭示**:What-is 层随进度淡入;调 `end` 时长与 `fromTo` 起点手感。
- **M3 结束态**:depth-0 嵌套卡尾段淡出 →「无嵌套总览」小卡;CursorMirror 门控。
- **M4 打磨**:reduced-motion 兜底、pin 结束后 What-is 正文延续区、`cursor:none` 复位。

---

## 9. 待定旋钮 / 开放问题

- **滚动量 `end`**:`+=120%` 够不够?更长更从容,更短更利落。
- **What-is 淡入起点**:`0.35` 偏早/偏晚,与收缩节奏的错位手感。
- **结束态落点**:精确落在递归卡footprint(最无缝)还是留出更舒适的角落内边距(牺牲一点无缝)。
- **What-is 内容**:本期占位文案,后续接真实「What is CarryKit」正文 + 排版。
- **主题**:明/暗两套下 What-is 层与 Hero 边框的对比表现(复用 `--foreground/--background/--muted`)。

---

## 10. 迭代 2:动感 + 背景页前推 + 嵌套 6 层

在同一组文件上增强,**不改「hero 收缩进右下角」的大方向**;§3 的时间线为迭代 1 基线,
以下为当前实际参数。

### A. 嵌套 6 层

`HomeScene` 的 `maxDepth` 默认 `4 → 6`(`home-scene.tsx`)。第 6 层 ≈ `(1/3)^6 ≈ 1/729` 帧
(满屏约 2–3px),隧道更深、前滚里程更长。收尾「无嵌套总览」仍成立:淡出 depth-0 嵌套卡会连同
其整棵(现 5 层)子树一起隐去。

### B. 背景页「前推补位」替代纯淡入

What-is 不再 `autoAlpha 0→1` 纯淡入,而是由「推远缩小」态**前推放大补位**,读作「后面的页面
滚上前来」;`transform-origin` 默认居中,末端 `back.out(1.1)` 轻微回弹 settle。

### C. 三种「动感」手法

1. **惯性平滑**:`scrub: true → scrub: 1`(约 1s 缓动追赶滚动位置,松手后再滑行一小段)。
2. **缓动加速/回弹**:tween 不再 `ease:"none"`——hero 收缩 `power2.in`(先慢后快坠入),
   What-is 前推 `back.out(1.1)`(回弹 settle)。
3. **层间视差**:对 depth≥1 内层嵌套卡(`gsap.utils.toArray('[data-nested]', frame)` 跳过 index 0)
   叠加逐层递增微缩放(随嵌套复合),深层比外层多前进一点 → 景深。跳过 depth-0 卡保证收尾落角/
   淡出干净。幅度克制(每层 ~1.5%),过大读作抖动就调小。

### 当前时间线(替代 §3 代码块)

```
gsap.set(frame,  { transformOrigin: "88.125% 82.35%" });
gsap.set(whatIs, { autoAlpha: 0, scale: 0.72, yPercent: 6 });

const tl = gsap.timeline({ scrollTrigger: {
  trigger: stage, start: "top top", end: "+=120%",
  pin: true, scrub: 1, invalidateOnRefresh: true, onUpdate: /* 光标门控 */,
}});

tl.to(frame, { scale: 1/3, ease: "power2.in" }, 0);                 // 收缩(先慢后快)
innerCards.forEach((c, i) =>                                        // 层间视差
  tl.to(c, { scale: 1 + (i + 1) * 0.015, ease: "power1.in" }, 0));
tl.fromTo(whatIs,                                                   // 前推补位 + 回弹
  { autoAlpha: 0, scale: 0.72, yPercent: 6 },
  { autoAlpha: 1, scale: 1, yPercent: 0, ease: "back.out(1.1)" }, 0.3);
tl.to(nestedCard0, { autoAlpha: 0, ease: "none" }, 0.72);          // 结束态去嵌套
```

### 可调旋钮(迭代 2 新增)

- **视差幅度** `(i+1)*0.015`:每层前进量;大 → 景深强但可能抖,小 → 稳。
- **前推起点/量** `0.3` / `scale 0.72` / `yPercent 6`:What-is 迎面来的时机与纵深。
- **惯性** `scrub: 1`:调大更"重"更粘手,调小更跟手。
- **回弹** `back.out(1.1)`:括号内 overshoot 强度。

---

## 11. 迭代 3:去收尾淡出 + 前慢后快视差 + 缓动对齐站点转场

### A. 去掉收尾淡出

删除迭代 2 的 `tl.to(nestedCard0, { autoAlpha: 0 }, 0.72)`。收缩完成后**嵌套隧道整棵保留可见**,
不再有「无嵌套总览」结束态。

### B. 层间视差:越靠前越慢、越靠后越快

- 给**每张** `[data-nested]` 卡设 `transform-origin: 88.125% 82.35%`(各自内层不动点),在收缩
  时间线上叠加**前滚**放大 `scale 1 → PARALLAX_FORWARD`(`>1`,起始 1.1)。
- 卡片层层相套 → 变换**自然复合**:depth-d 内容总缩放 ≈ `frameScale · FORWARD^d`,故**最外层
  (帧表面)只随基础收缩最慢、越深的层前滚越快**。以内层不动点向上放大 + `overflow-hidden`
  裁剪溢出 → **不留空隙**(优于迭代 2 的居中微缩放)。
- 替代迭代 2 的 C.3(那版跳过 index 0、居中微缩放)。现对**所有**卡生效(含最外层卡)。

### C. 缩放缓动对齐站点「原 hero 转场」

- hero 收缩 + 视差前滚的 `ease` 由内联 `power2.in`/`power1.in` **改引 `motionTokens.ease.accelerate`**
  (`tokens.ts` 的 `popSettle`)——与页面转场遮罩 `revealer.tsx` 放大同曲线:起始极慢 → 指数冲刺
  (82% 时间冲完 94% 距离)→ `power3.out` 急刹缓停。满足 DESIGN_SPEC §5(缓动引 token、禁内联)。
- `scrub:1` 惯性保留(略柔化急刹);What-is 前推 `back.out(1.1)` 回弹不动。

### 当前时间线(替代 §10)

```
gsap.set(frame,  { transformOrigin: "88.125% 82.35%" });
gsap.set(whatIs, { autoAlpha: 0, scale: 0.72, yPercent: 6 });

const tl = gsap.timeline({ scrollTrigger: {
  trigger: stage, start: "top top", end: "+=120%",
  pin: true, scrub: 1, invalidateOnRefresh: true, onUpdate: /* 光标门控 */,
}});

tl.to(frame, { scale: 1/3, ease: motionTokens.ease.accelerate }, 0);   // 收缩(冲刺后急刹)
nestedCards.forEach((card) => {                                        // 前慢后快视差
  gsap.set(card, { transformOrigin: "88.125% 82.35%" });
  tl.to(card, { scale: PARALLAX_FORWARD, ease: motionTokens.ease.accelerate }, 0);
});
tl.fromTo(whatIs,                                                      // 前推补位 + 回弹
  { autoAlpha: 0, scale: 0.72, yPercent: 6 },
  { autoAlpha: 1, scale: 1, yPercent: 0, ease: "back.out(1.1)" }, 0.3);
// (删除)结束态淡出
```

### 可调旋钮(迭代 3)

- **视差幅度** `PARALLAX_FORWARD`(默认 1.1):越大景深/眩晕越强;`<1` 则翻成向内塌缩式视差。
- 收缩/视差 **缓动** 现统一为 `motionTokens.ease.accelerate`,改手感应改 token 或换 token 引用。

---

## 12. 迭代 4:视差=重合去嵌套 + 篝火独立 + 问答播报

> 用户对「视差」的精确定义 + 内容层。**取代迭代 3 的 `PARALLAX_FORWARD` 与迭代 2 的 What-is 前推面板**。

### A. 视差 = 前缩后放、最终重合去嵌套

- 语义:首页帧**缩小**同时,其后每层嵌套页**放大**,最终所有层**重合** → 收缩后的小页不再有嵌套。
- 机制:frame `scale 1→1/3`(origin `88.125% 82.35%`);**每张 `[data-nested]` 卡 `scale 1→3`
  (同一 origin)**——卡本是父的 1/3,×3 恰好填满父级;层层如此 → 隧道逐级重合、末态扁平无嵌套。
- 「越深越快」天然满足:depth-d 内容渲染 `scale=(1/3)·3^d`;`overflow-hidden` 裁剪不溢出。
  即迭代 3 的 `PARALLAX_FORWARD` 由 1.1 **改成 3**。

### B. 篝火(星标)脱离缩放 → 原位持久锚点

- depth-0 星标从缩放帧摘出:frame 不再传 `showCampfire`;stage 覆盖层渲染一颗**不参与缩放**的星,
  定位原位(帧底部居中 `left 50%/top 91%`),贯穿转场常驻。`STAR_CLIP` 由 `home-scene.tsx` 导出复用。

### C. 问答播报(先收缩,再逐条)

- 一个 pin + scrub 时间线,`end:"+=400%"`(1 屏收缩 + 3 屏问答)。时长单位 `COLLAPSE=1`、`QA=1`。
- **问题(屏幕上方)** 依次 `What is CarryKit` / `Who am I` / `What is the meaning of life?`,
  相邻交叉淡切(问题+答案同步 fade)。
- **答案(缩放画面左侧, `font-broadcast`=Anton SC 大写, 放大)**:每题一条,**占位**待填
  (`QA_ITEMS`)。
- **CarryKit 水印**:覆盖帧内原 wordmark 位置(`left 11%/top 43.6%`, `font-title`),收缩时
  `autoAlpha→0.14` **淡化做背景**,承接被覆盖的帧内 wordmark。

### 覆盖层结构(`data-stage` 内, 均 `pointer-events-none`、**不随帧缩放**)

- 问题层:`[data-question]` × 3(屏幕上方,同位叠放,初始 `opacity-0`)。
- 静止覆盖帧(同 hero 帧 `aspect-[16/9]`/居中, `[container-type:size]` 使 cqw 与 HomeScene 对齐):
  `[data-watermark]` 淡化 CarryKit + `[data-answer]` × 3(左侧 Anton SC 大写) + 持久星标。
- hero 帧(唯一缩放)+ `CursorMirror`(门控不变)。

### reduced-motion 兜底

- 不建时间线:hero 静态满屏;其下 `hidden motion-reduce:flex` 段堆叠 3 组「问题 + 答案」;星标静态。

### 可调旋钮(迭代 4)

- **`end:"+=400%"`**、**`COLLAPSE`/`QA`** 段时长比:收缩与每条问答的滚动配额。
- **交叉淡切** `QA*0.35`:相邻问答的重叠淡切时长。
- **答案文案** `QA_ITEMS[].a`:占位,待填真答案;字号 `text-[6.5cqw]`。
- **水印淡度** `0.14`:CarryKit 背景水印的不透明度。
