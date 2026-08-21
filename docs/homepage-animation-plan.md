# 主页迪斯科灯球动画 — 需求规划 (Homepage Disco Ball Animation)

> 唯一准绳:[`idea/disco_ball_animation_feasibility.md`](../idea/disco_ball_animation_feasibility.md)
> 技术路线:**路线 2 — Blender 预渲染序列 + GSAP/CSS/DOM 编排**(灯球是「一段透明背景、径向对称、可无缝循环的预渲染素材」,叙事编排全在屏幕 2D 空间用 GSAP + CSS 完成)
> 资产依赖:见 [`docs/blender-assets.md`](blender-assets.md)
> 状态:需求已定,待实现。每个需求点(HR-x)是可验收单元。

---

## 0. 总体结构:两幕 + 一个 pin 住的滚动叙事段

整套动画是一个**高度 = 若干屏、`ScrollTrigger` pin 住首个视口**的 scrollytelling section。内部分两幕:

| 幕 | 拍 | 驱动方式 | 说明 |
|---|---|---|---|
| **Act I 入场** | HR-1 ~ HR-5 | **时间驱动(autoplay)** | 页面载入后自动播放:黑屏 → 灯球接触不良 → 渐亮定住 → 缩小变 "O" → 生出星环。此阶段 `scroll = 0`,页面锁定不可滚。 |
| **Act II 叙事** | HR-6 ~ HR-10 | **滚动驱动(scrubbed)** | Act I 播完解锁滚动。滚动进度 0→1 驱动:大字渐隐+加速 → 球左移+文字绕排 → 凹槽咬合 → 三板块 → To be continued。 |

Act I → Act II 的交接:Act I 末帧状态(小球 + 星环居中)= Act II 首帧状态,视觉连续,无跳变。

---

## 1. 需求点清单 (Requirement Points)

> 每条:**触发**(time / scroll) · **描述** · **验收** · **资产依赖** · **降级**

### HR-1 · 承接 preloader,黑场起手
- **触发**:time(load 后)
- **描述**:现有 preloader(计数器 + 上刷)揭示完成后,主视口短暂纯黑场(约 0.3–0.6s)作为灯球出场的呼吸留白。
- **验收**:preloader 结束到灯球出现之间无闪白、无布局跳动;同会话内 preloader 不重播时,黑场仍保留(或缩短)。
- **资产**:无。
- **降级**:`prefers-reduced-motion` → 跳过黑场,直接进 HR-3 定住态。

### HR-2 · 接触不良闪烁
- **触发**:time
- **描述**:灯球像"刚接好电"一样时断时亮——不规则的亮灭/明暗抖动,模拟电子接触不良。
- **验收**:闪烁节奏不均匀(非匀速呼吸);持续约 1.2–2s 后自然收束进入 HR-3;不产生高频强闪(癫痫安全,闪烁频率 < 3Hz)。
- **资产**:`ball-intro`(灯球入场序列,含灭→闪→亮渐变)**或** `ball-loop` + CSS `filter: brightness/opacity` 用 GSAP `SteppedEase`/`CustomEase` 模拟闪烁(二选一,见资产文档 B-1 取舍)。
- **降级**:reduced-motion → 不闪,直接以定住态淡入。

### HR-3 · 渐亮定住
- **触发**:time
- **描述**:闪烁结束,灯球亮度持续拉升到最亮,并稳定保持发光、缓慢自转。
- **验收**:亮度平滑上升无跳变;定住后灯球进入**无缝循环自转**,循环点无可见跳帧。
- **资产**:`ball-loop`(无缝自转循环)+ 发光叠层(CSS 径向渐变 `drop-shadow`/glow 层)。
- **降级**:reduced-motion → 静态最亮帧,不自转。

### HR-4 · 缩小变 "O",welcome / carrykit 归位
- **触发**:time(Act I 尾)
- **描述**:灯球适当缩小并上移,嵌入标题 **"welcome T[O] carrykit"** 充当 "To" 的字母 O;welcome 在球左、carrykit 在球右。
- **验收**:球缩放/位移平滑(建议 GSAP Flip 跨态补间),最终球心与文本基线对齐、左右词间距视觉均衡;移动端不溢出(见 §2)。
- **资产**:复用 `ball-loop`(缩小仅 CSS `scale`,**不需单独渲染**)。
- **"O" 处理(已定)**:灯球**盖在隐藏的字母 "O" 上**,该 O 不实际渲染(灯球本身看起来就是 O)。DOM 上 "O" 仅作占位/基线对齐锚点,`visibility:hidden` 或透明,球投影到其位置。
- **降级**:reduced-motion → 直接以最终排版态展示标题 + 小球,无补间。

### HR-5 · 星环生成(斜 30°)
- **触发**:time(与 HR-4 同段收尾)
- **描述**:灯球由内向外生出一圈**倾斜约 30°、持续旋转**的星环。
- **验收**:星环倾角与准绳一致(斜向 30°),持续匀速旋转,循环无缝;星环与球的合成关系正确(星环在球赤道面、部分在球后)。
- **资产**:`ring-loop`(**独立**透明循环,便于 HR-6 独立变速)。
- **降级**:reduced-motion → 静态星环或省略。

### HR-6 · 大字渐隐 + 球/星环加速
- **触发**:**scroll**
- **描述**:用户开始下滑,"welcome to carrykit" 大字渐隐;同时球与星环旋转**加速**(下滑越快转越快)。
- **验收**:大字 `opacity` 随滚动进度线性渐隐;旋转速度与滚动速度/进度正相关——通过 GSAP 把 scroll progress 绑定到序列帧**播放速率**(`timeScale` 等效)或帧索引;反向上滑时减速/回退,无突变。
- **资产**:`ball-loop` + `ring-loop`(变速播放,必须严格无缝循环)。
- **降级**:reduced-motion → 大字直接消失,无加速。

### HR-7 · 球左移 + 文字绕排(pretext)
- **触发**:scroll(section 保持 pin)
- **描述**:球平滑移到左侧,介绍文字从右侧滑入并**动态环绕**球体,讲述"这个网站是什么";下滑推进文字。
- **验收**:球左移用 CSS `translateX`;文字真·绕排球的外接圆(非遮挡假象),换行随球位置更新;文字读毕后进入 HR-8。
- **资产**:复用 `ball-loop`(左移=CSS)。文字绕排见 §4 技术选型(`shape-outside: circle()` 为主,[pretext](https://github.com/chenglou/pretext) 为进阶备选)。
- **降级**:reduced-motion / 移动端 → 文字改为球下方常规段落,不绕排。

### HR-8 · 半圆凹槽咬合(反色)
- **触发**:scroll
- **描述**:右侧滑入一个**开口朝左的半圆凹槽,反色**;球进入到一半时开始缩小,凹槽"咬住"球。
- **验收**:凹槽用 DOM(`border-radius` + `mix-blend-mode: difference` 反色)——**路线 2 下混合模式作用于球的 `<img>`/序列元素,正常生效**;凹槽滑入与球缩小时间线严格对齐,球心与凹槽圆心在咬合帧精确吻合,形成物理咬合错觉。
- **资产**:复用 `ball-loop`(缩小=CSS)。凹槽纯 DOM,无 Blender 资产。
- **降级**:reduced-motion → 凹槽与三板块直接淡入,无咬合运动。

### HR-9 · 三板块展示 + 跳转(work / blog / radar)
- **触发**:scroll(咬合 `onComplete`)
- **描述**:咬合完成触发交错动画,优雅浮现 **work / blog / radar** 三块简介 + 跳转路径。
- **验收**:三块内容 stagger 入场;每块可点击跳转到对应路由(`/work`、`/blog`、`/radar`);文案来自 i18n 字典(见 §5 待确认项②)。
- **资产**:无 Blender 资产(可选:球作为背景装饰motif,复用 `ball-loop`)。
- **降级**:reduced-motion → 三块直接显示。

### HR-10 · To be continued
- **触发**:scroll(末端)
- **描述**:叙事收尾,呈现 "to be continued" 收束语,section 解除 pin,继续向下是站点其余内容(精选作品/最新博客等)。
- **验收**:pin 正确释放,后续正常流式内容无重叠/跳动。
- **资产**:无。
- **降级**:直接显示。

---

## 2. 响应式降级(移动端 < md)
- 取消左移对撞、文字绕排、凹槽左右咬合等**横向空间**依赖的编排。
- 改为**纵向堆叠**:灯球在上、标题/介绍在下,球缩放居中。
- 保留:入场闪烁→渐亮(HR-2/3)、球缩小、三板块卡片(HR-9,改为纵向列表)。
- 用 GSAP `matchMedia` 分流桌面/移动时间线。

## 3. reduced-motion 降级(全局红线)
- 逐条见各 HR 的「降级」项;总原则:**跳过闪烁、位移、加速、绕排、咬合等运动性动画,直接呈现关键终态**(标题 + 小球 + 三板块)。
- 遵循 DESIGN_SPEC §5 红线。

## 4. 关键技术选型
- **序列播放**:预渲染帧以 sprite sheet(CSS `background-position` 步进)或 `webm`(VP9-alpha)+ Safari `HEVC-alpha` 回退驱动;必须**无缝循环**以支撑 HR-6 变速。
- **变速旋转**:GSAP ScrollTrigger `progress` → 帧索引/`timeScale`。
- **跨态排版**(HR-4/7):优先 GSAP Flip + `shape-outside: circle()`;绕排复杂度超出 CSS 能力时再引入 pretext。
- **反色凹槽**(HR-8):DOM + `mix-blend-mode`(路线 2 关键优势:混合作用于 img,而非不可混合的 WebGL canvas)。
- **状态共享**:一个轻量 ref(`scrollState`)供 GSAP 写、播放器读,避免 React re-render 抖动。

## 5. 决策记录(原待确认项,已定 · 2026-08-21)
1. **标题 "O" 处理(已定)**:球盖在**隐藏的 "O"** 上,O 不渲染(球本身即 O)。见 HR-4。
2. **信息架构(已定)**:导航 = **work / blog / radar**;about/contact **已移除**,contact 联系方式下沉 footer。已同步 PRD / DESIGN_SPEC / ARCHITECTURE / TASKS。
3. **文档清理(已执行)**:A4 像素标题标注弃用、Home 线框改指本计划、About 线框移除;全库矛盾自检见 [change_8_21.md](change_8_21.md)。

## 5bis. 后续项
- 原 About 承载的 **bio / skills** 内容:**已决定丢弃**(2026-08-21)。contact 联系方式仍在 footer。
- radar 完整 PRD/DESIGN 规范:**暂不设计**(2026-08-21),目前仅 idea/radar-*.md 作内容构想。

## 6. 实现路线图(待路线细节确认后转为逐步清单)
1. 搭建 Blender 主控场景 + 产出 `ball-intro` / `ball-loop` / `ring-loop`(见资产文档)
2. 前端序列播放器组件(无缝循环 + 变速)+ 发光叠层
3. Act I 时间线(HR-1~5,含 preloader 交接)
4. Act II ScrollTrigger pin + 变速(HR-6)
5. 球左移 + 文字绕排(HR-7)
6. 反色凹槽咬合(HR-8)
7. 三板块 + To be continued(HR-9/10)
8. 响应式 + reduced-motion 降级(§2/§3)

> 约定:每完成一个 HR/步骤,按 Conventional Commits 记录并 commit(在 `feature/disco-ball-homepage` 分支),再开下一步。
