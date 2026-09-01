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

---

## 13. 迭代 5:隧道「最后一页」= 灯球(修前后重叠)

> 需求:无限嵌套结束后,角落微缩页应**变成一颗灯球**。灯球**先占位**,日后换 Blender 建模。

### A. 弃「浅层浮层」改「最后一页就是球」(修 bug)

- **曾试的浅层浮层**(`home-collapse.tsx` 里 `[data-coreorb]` 随帧缩放、末段淡入)有硬伤:它是**独立于
  隧道**的一层,收缩时不与各嵌套页**同步位移/缩放** → 与仍在收缩的 hero 出现**前后重叠 / 双影**。已删除。
- **现方案**:直接把递归的**叶子页(`depth === maxDepth`,不再套娃的那页)整页变成一颗球**。它是隧道
  自身的一部分,随「重合去嵌套」(frame `1/3` + 每张 `[data-nested]` `×3`)一同放大填满 → 末态角落
  即一颗灯球,**无浮层、无前后重叠**。

### B. 实现(改 `home-scene.tsx`)—— 迭代 6 后:**最后一层嵌套卡直接是球**

- 递归终止改在 `[data-nested]` 卡**内部**:`depth+1 < maxDepth` 放 `HomeScene`,否则(最后一层)
  **不再套 HomeScene**,而是让球直接做该卡的子元素:卡加 `bg-background`,内放
  `absolute … aspect-square h-[120%]` + `<DiscoBall size="100%"/>`(直径 ≈ 1.2×卡高、正圆,
  上下溢出由本卡 `overflow-hidden` 裁 → 铺满该卡)。
- **为何这样(修「球/页缩放不同速」)**:旧版把球放在最深那层**独立的 `HomeScene` 叶子页**里,
  多一层 `container-type:size` 容器 + `cqh` 解析 + 溢出裁剪 → 深层多重变换/裁剪下球与页面易亚像素
  不同步。现在球是嵌套卡的**直接后代**、用**相对本卡的百分比**(`h-[120%]`)→ 与卡共享同一条变换链、
  严格同步缩放,并少一层容器。
- `home-collapse.tsx` 的时间线不变(球卡就是最深那张 `[data-nested]`,照常参与段2 `scale→3`)。

### C. 占位件 = `DiscoBall`(Blender 替换契约现成)

- `src/components/home/disco-ball.tsx`(方案 C 预览替身),只暴露 `--disco-size/scale/glow/spin`,
  日后内部换 sprite/webm、props 不变即无痛升级。当前 `showRing={false}`、`glow={0.9}`。
- **配色注意**:蓝铬彩球与 lab 黑白略冲突;不合可调 `disco-ball.module.css` 或待 Blender 再定。

### 待观察 / 可调旋钮(迭代 5)

- **深层撕裂风险**:球在第 `maxDepth`(=7)层,收缩中途(scrub 未到位)各层未精确重合时,理论上
  clip 边界可能出现细缝。已用**不透明 `bg-background`** 消除「露浅层文字」;若仍见细缝,退路是
  **调小 `maxDepth`**(更少 clip 层)或球略放大盖缝。需浏览器实测确认。
- **铺满程度** `size="120cqh"`:`100cqh`(恰卡满高、留左右)→ `130cqh`(铺满更满、上下裁多)。
- **发光/星环** `glow` / `showRing`。

---

## 14. 迭代 6:收缩拆两段(递退 → 依次去嵌套)+ dolly 视差

> 把迭代 4 的「收缩+去嵌套同时发生」拆成**两段滚动**,并强化动感/视差。**取代 §12.A 的单段收缩**;
> 叶子球(迭代 5)、问答/水印/星标覆盖层、光标门控、reduced-motion 兜底均不变。

### A. 段 1 递退一级(`t = 0..SEG1`)

- **整帧 `scale→1/3`(origin F)**:靠自相似合成,每层精确落到「后一层」footprint → 隧道**递退但仍嵌套**
  (不摊平)。这是「越靠前越快」的驱动层,缓动仍引 `motionTokens.ease.accelerate`。
- **dolly 视差(front faster)**:每张 `[data-nested]` 卡加随深度递增的 counter-scale
  `scale: 1 + i*PARALLAX`(`i=0` 最外层不加,`ease:"power2.in"` 后段拉开)→ 深层净递退更慢、隧道被
  「拉深」。因嵌套复合,幅度非线性放大:`PARALLAX≈0.06` 时最深层净递退≈静止(front 明显更快);
  再大最深层会「反涨」溢出(裁掉,可接受)。段 1 末深层略 `>1`,段 2 从此值续到 `3`,连续无跳。

### B. 段 2 依次去嵌套 + 与问答同步(`t = SEG1..SEG1+SEG2`)

- **帧不 tween → 保持 1/3**(「第一层缩略页不动」)。内层卡逐张 `scale→3`(origin F、填满父级)。
- **从最深往外交错(深层先/球先冒)**:`[...nestedCards].reverse()`,起始只铺开 `span=SEG2*0.4`、
  `dur=SEG2−span` → **最后一张卡恰在 `SEG1+SEG2` 收尾**,去嵌套完整落在 `SEG2` 内。各卡 `dur` 相同且
  大幅重叠 → 复合缩放平滑、**球与其页面严格同步放大**。末态灯球填满角落卡。
- **修 bug**:旧版 `at=(k/n)*SEG2` + `dur=0.6*SEG2` 会让末卡越过 `SEG1+SEG2` **拖尾**,最深(球父)卡
  与外层卡收尾错位 → 观感上「球缩放速度 ≠ 页面缩放速度」。新版把整段收束进 `SEG2` 修掉。
- **与问答同步**:`SEG2 = QA_ITEMS.length*QA`,问答 3 条落在 `SEG1 + i*QA` → 去嵌套与问答同跨度推进。

### 当前时间线(替代 §12.A)

```
tl.to(frame, { scale: 1/3, ease: accel, duration: SEG1 }, 0);                 // 段1 递退
nestedCards.forEach((c, i) =>                                                 // 段1 dolly 视差
  tl.to(c, { scale: 1 + i*PARALLAX, ease: "power2.in", duration: SEG1 }, 0));
const deepFirst = [...nestedCards].reverse();                                 // 段2 依次去嵌套(深层先)
const span = SEG2 * 0.4, dur = SEG2 - span;                                   // 收束进 SEG2、大幅重叠
deepFirst.forEach((card, k) =>
  tl.to(card, { scale: 3, ease: accel, duration: dur }, SEG1 + (k/(n-1)) * span));
questions.forEach((q, i) => { /* at = SEG1 + i*QA,与段2 同步 */ });
```

### 可调旋钮(迭代 6)

- **`PARALLAX`(0.06)**:段 1 每层速差 / dolly 强度(合成复合 → 越深越慢,非线性;>0.06 最深层反涨)。
- **`power2.in`**:段 1「前快后慢」的差速曲线。
- **段 2 `span`(`SEG2*0.4`)**:深层先的交错铺开量;大 → 更「依次」但收尾更陡,小 → 更同步平滑。
  `dur=SEG2−span` 恒定 → 末卡始终在段末收尾(不拖尾)。
- **`SEG1 : SEG2`(1:3)**:递退 vs 去嵌套+问答的滚动配额;`end` 仍 `"+=400%"`。

---

## 15. 迭代 7:灯球改「帧级覆盖层」(根治深层裁剪撕裂)

> ⚠️ **迭代 8(2026-08-30)已整体撤回灯球**:见 §16。本节及 §13 的灯球方案暂缓保留作参考。

> **取代 §13/§5.迭代5 的「球放最深嵌套层」**。把球放隧道最深层(第 7 层)后,收缩去嵌套时它要穿过
> **7 层 `overflow-hidden` + 复合放大 ~729×**:缩放中间态各层 clip 亚像素对不齐 → **把圆撕成错位碎片**
> (实测灰片,见 `images/缩小页面bug.png`),且圆是 1:1、在 16:9 卡里随屏幕比例留白/裁切不一致。
> 这是「深层嵌套 + 多层缩放」的物理极限,非参数可调。

### 方案:球脱离隧道,做不缩放覆盖层的单层元素

- **隧道恢复纯递归**(`home-scene.tsx`):`[data-nested]` 卡内永远是 `HomeScene`,最深层为纯 hero;
  **不再有球**。段1 递退 / 段2 去嵌套的时间线不变。
- **球挂 `home-collapse.tsx` 的静止覆盖层**(z-20、`[container-type:size]`、不参与帧缩放,与 watermark/
  star 同层):`[data-orb]` 定位 = 角落卡(`left 58.75% / top 54.9%`、`33.333cqh×33.333cqw`,与帧缩
  `1/3` 后的右下角**精确重合**),`bg-background` 盖住摊平的隧道,内放 `aspect-square h-[120%]` +
  `<DiscoBall size="100%"/>`。
- **动画**:`gsap.set(orb,{transformOrigin:"center center",scale:0.6})`;段 2 后段
  `tl.to(orb,{autoAlpha:1,scale:1,ease:accel,duration:SEG2*0.7}, SEG1+SEG2*0.3)` → 从角落卡**中心
  放大淡入**,末段完全盖住已去嵌套的角落 → **末态角落 = 一颗干净灯球**。

### 为何这样根治

- **不撕裂**:球只经覆盖层这**一层**裁剪、无深层复合缩放。
- **自适应**:尺寸用相对固定覆盖层容器的 `cqh` → 随屏幕比例稳定。
- **无前后重叠**:段 2 后段才淡入,此时隧道已在角落摊平(无「前后」层),`bg-background` 直接盖上。
- 代价:球非「物理最深页」,是覆盖层模拟(用户已认可)。

### 可调旋钮(迭代 7)

- **出现时机/时长** `SEG1+SEG2*0.3` / `SEG2*0.7`:球从多晚开始长、长多久。
- **起始缩放** `scale:0.6`:0 → 从一点冒出;越大越「淡入」少「长大」。
- **铺满/发光** `h-[120%]` / `glow` / `showRing`;**配色** 蓝铬彩球不合可调 `disco-ball.module.css`。
- reduced-motion 下不建时间线 → 球保持 `opacity-0` 不显示(如需静态兜底另加)。

---

## 16. 迭代 8:暂舍弃灯球,回到纯递归隧道(9 层)+ 末态空白

> ⚠️ **迭代 9(2026-08-30)已回退本节的「叶子空白 + 删 orb」**:见 §17。留档。

> 灯球放深层会撕裂(§15)、放覆盖层又非「物理最深页」;**暂缓灯球想法**,先把隧道本身做扎实。

- **移除收缩末态灯球**:删掉 `home-collapse.tsx` 的 `[data-orb]` 覆盖层 + 其时间线 + `DiscoBall` 引用;
  隧道恢复**纯递归 hero**(`home-scene.tsx` 的 `[data-nested]` 卡内永远是 `HomeScene`)。
- **层数 `maxDepth` → 9**,且**最深层(叶子)= 空白页**:`home-scene.tsx` 在 `!hasNested` 时提前 return
  一个纯 `bg-background` 空白 div(不渲染 hero)。段2 去嵌套到底时,不透明空白盖满 → **末态角落空白**。
- **移除每层 Hero 顶部的「灯球占位灰圆」(`data-key="orb"`)**:它在去嵌套放大时被某层 `overflow-hidden`
  从顶部裁成「碗状灰块」(见 `images/缩小bug.png`);既已舍弃灯球,一并移除 → 隧道剩 `nav + wordmark`
  的干净 hero,末态不再残留灰块。(`CursorMirror` 的可高亮元素只剩 `data-key="wordmark"`。)
- 段1 递退 + dolly 视差、段2 依次去嵌套(深层先)、问答/水印/星标、光标门控、reduced-motion 均不变。
- 注:`home-scene` 里 `data-key="orb"` 的**顶部小灰圆**是 Hero 自带的 disco 锚点占位(每层都有),
  与本节移除的「收缩末态灯球」无关,保留。
- 灯球方案(§13/§15)留档,日后接 Blender 资产时再定最终挂法。

---

## 17. 迭代 9:回退空白叶子/删 orb,改「末端隧道缩没入不动点」

> §16 的「叶子空白」破坏了隧道自相似 → 段2 去嵌套中途浅层 `orb` 露出被多层 `overflow-hidden` 裁成
> **碗状灰块**(`images/缩小bug.png`)。用户定案:**页面上保留灯球(orb)**,只在**动画末端让隧道消失**。

### A. 回退(`home-scene.tsx`)

- **删除叶子空白分支**(`if (!hasNested) return 空白 div`)→ 最深层恢复**正常 hero**、隧道各层自相似。
  `maxDepth` 保持 9。
- **恢复 `data-key="orb"` 灯球占位灰圆,但仅最外层 depth 0**(加 `!inner` 条件,同 `showCampfire`):
  深层 orb 会在段2 去嵌套放大时被祖先 `overflow-hidden` 裁成**碗状灰块**(`images/缩小bug.png`)——
  实心圆被裁很扎眼(文字被裁不明显),且**去嵌套中间态各层不同步 → 该裁剪确定会出现**,非自相似可救。
  只 depth 0 渲染 → 无灰块;该灯球随帧缩放、段3 随隧道缩没。(篝火同理,早已只 depth 0。)
- **`SceneNav` 也改为仅 depth 0**(`{!inner && <SceneNav interactive />}`):同理,深层 nav 文字在去嵌套
  放大时留下**裁剪碎字残留**;只 depth 0 渲染即消除。深层 hero 现只剩 `wordmark`(CarryKit. 无限嵌套主体)。

### B. 末端隧道缩没(`home-collapse.tsx`)

- 新增**段3 消失**:段2 后隧道整帧从 `1/3` 继续 `scale→0`(仍 about `FIXED_ORIGIN` F)→ 整幅画面缩向
  右下不动点、缩成一点没入消失。`tl.to(frame,{scale:0,ease:accel,duration:FADE}, SEG1+SEG2)`。
- **范围**:只隧道(帧)缩没;**问答/水印/星标**(覆盖层)不缩、保留 → **末态 = 空背景 + 最后一条问答文字**。
- `end`:`"+=400%"` → **`"+=500%"`**(SEG1 1 + SEG2 3 + FADE 1)。

### 可调旋钮(迭代 9)

- **`FADE`(1)**:末端缩没的滚动量/时长。
- **缩没缓动** `accel`;想更「加速坠入」可换 `power2.in`。

---

## 18. 迭代 10:灯球段1 末尾「吊起升出」+ nav 加回每层递归

> 迭代 9 把 orb/nav 都收窄到仅 depth 0,嵌套隧道只剩 `wordmark` 略单调。用户要:给最外层灯球加
> 「往上吊起、升出画面顶部」的动感,并把 nav 加回每层递归。

### A. nav 加回每层递归(`home-scene.tsx`)

- `{!inner && <SceneNav interactive />}` → **`<SceneNav interactive={!inner} />`**(复原迭代 9 之前):
  每层都渲染 nav,仅 depth 0 可交互、深层为 `StaticNav` 静态镜像。
- **取舍**:深层 nav 文字在段2 去嵌套放大时仍会有**裁剪碎字残留**(迭代 9 移除的原因),用户已认可,
  换取隧道 Droste 更丰富。orb **不**加回嵌套(仍仅 depth 0),只 nav 加回。

### B. 灯球脱离缩放 + 段1 末尾「吊起升出」(`home-scene.tsx` + `home-collapse.tsx`)

> 用户补充:**灯球不随嵌套/收缩动画移动**。故与篝火星标同法「脱离缩放」——从缩放帧摘出,
> 挪到 stage 覆盖层常驻原位,只做独立的吊起。

- **移出 HomeScene(`home-scene.tsx`)**:删除 depth-0 的 orb 块。隧道帧不再含 orb → 收缩时它不随。
- **挪进覆盖层(`home-collapse.tsx`)**:在静止覆盖帧(与星标同层、`[container-type:size]`、不缩放)
  加 orb,定位**帧顶部居中**(`left 50% / top 19.5%`、`7.6cqw`,同原 HomeScene 位置)。**外层定位壳**
  (管居中,GSAP 不碰)+ **内层可动圆**(`[data-orb]`,GSAP 目标,`h-full w-full`)。日后内圆换
  `<DiscoBall size="100%"/>`。因覆盖帧尺寸/`cqw` 与 hero 帧一致,静止顶部态与原位置像素重合。
- **时间线**:orb 在覆盖层不随收缩移动;仅段1 尾段(后 `HOIST_SPAN`)沿自身 `yPercent` 升过帧顶 →
  **升出画面顶部**(用户选定),`SEG1` 收尾 → 第二幕开始前离场,之后停顶外不再可见,无需清理。
  ```
  const orb = root.querySelector('[data-orb]');
  tl.to(orb, { yPercent: HOIST_RISE, ease: motionTokens.ease.swipe, duration: SEG1*HOIST_SPAN },
        SEG1*(1-HOIST_SPAN));
  ```
- **缓动 = 慢快慢**:复用现成 token `motionTokens.ease.swipe`(= `power4.inOut`,`tokens.ts` 注释即
  「慢快慢上刷效果」)→ 起吊慢、中段冲、贴顶缓,舞台吊灯球被拉走的观感。满足「缓动引 token、禁内联」。
- **注**:orb 移入 pointer-events-none 覆盖层后**不再被 CursorMirror 高亮**(与星标一致);可选高亮
  在此设计里让位于「脱离缩放 + 独立吊起」。

### 可调旋钮(迭代 10)

- **`HOIST_RISE`(−220)**:越负升得越高/越确保离场;不足会露在顶部。
- **`HOIST_SPAN`(0.6)**:吊起占段1 尾段比例;大 → 更早起吊更从容,小 → 更贴「末尾」更急。
- **吊起缓动** `motionTokens.ease.swipe`;换 `power2.inOut` 更柔。

---

## 19. 迭代 11:段2 去嵌套改「浅层先/从外往深」

> 反馈:段2 应**从浅(最外层)开始放大**,放大的同时后面(深层)的也慢慢开始、加速跟进放大。

- 原为**深层先**(`[...nestedCards].reverse()`,球先冒的遗留);现去掉 `reverse`,按 `nestedCards`
  **DOM 序(最外浅层→最深)** 交错:最外层先 `scale→3` 填满,深层随 `span` 依次「慢慢开始」。
- **「加速放大」天然满足**:嵌套复合 → 深层内容被每个外层缩放叠乘,越深越放越快,像俯冲钻进隧道;
  各卡仍用 `accel`(慢起→冲刺→轻刹)。`dur=SEG2−span` 不变 → 末(最深)卡仍恰在 `SEG1+SEG2` 收尾。
- 仅改 `home-collapse.tsx` 段2 那段的迭代顺序;时长/`span`/问答同步/段3 均不变。
