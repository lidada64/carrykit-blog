# 主页迪斯科灯球动画实现计划 (Epic: Homepage Disco Animation)

根据前期分析，本项目旨在实现一个基于滚动的复杂、炫酷叙事型首页动画。以下是详细的任务拆解与技术说明。

## 任务拆解 (Tasks)

### Task 1: 准备资产与初始闪烁发光动画 (Phase 1)
- **目标**: 实现进入页面的初始状态——黑屏后灯球闪烁、点亮并最终保持发光。
- **技术解释**:
  - 准备 2D (高质量 WebP/PNG) 或 SVG 格式的迪斯科灯球素材，以保证性能。
  - 使用 GSAP 的 Timeline，结合 CSS `filter: brightness()` 和 `drop-shadow`（或者多重带有径向渐变的绝对定位层）来制作发光效果。
  - 使用 GSAP 的粗糙缓动函数 (如 `SteppedEase` 或 `CustomEase`) 搭配 `opacity`，模拟电子线路接触不良的 "Glitch" (时断时亮) 视觉效果。
  - **前置条件**: 确认灯球素材。

### Task 2: 排版重构与字形融合 (Phase 2)
- **目标**: 灯球停止闪烁后缩小，融合进 "welcome to carrykit" 的文本中。
- **技术解释**:
  - 利用 GSAP 计算出精准的 `y` 轴平移和 `scale` 缩小值。
  - 巧妙运用布局逻辑：比如将 "welcome", "t", "carrykit" 独立分块，并将灯球的 DOM 节点通过绝对定位或 Flex 布局“嵌入”到文本中，充当 "to" 单词中的字母 "o"。
  - 为防止布局突变，可考虑使用 `GSAP Flip` 插件或非常平滑的跨节点补间动画。

### Task 3: 3D 星环与 ScrollTrigger 联动 (Phase 3)
- **目标**: 灯球四周生成 30 度倾斜并持续旋转的星环，下滑时星环加速，大字渐隐。
- **技术解释**:
  - **星环样式**: 使用一个带边框 (`border`) 或虚线样式的 `div`，通过 CSS 3D 变换 (`transform: rotateX(70deg) rotateZ(30deg)`) 模拟 3D 倾斜轨道。
  - **持续旋转**: 一个 `repeat: -1, ease: "none"` 的 GSAP Tween。
  - **加速机制**: 挂载 GSAP `ScrollTrigger`，将其滚动进度 (progress) 与持续旋转动画的 `timeScale()` 绑定，实现“随下拉加速”的物理反馈。大字的透明度 (`opacity: 0`) 也通过同一个 ScrollTrigger 控制。

### Task 4: 平移与 Pretext 文字环绕动效 (Phase 4)
- **目标**: 继续下滑时，灯球平滑移向左侧，文本从右侧滑入并**动态环绕**灯球。
- **技术解释**:
  - 此阶段需在 ScrollTrigger 中 `pin` (固定) 住当前 section。灯球的左移利用 `x` 轴补间实现。
  - **重点参考**: 文字环绕效果需仔细研究 [chenglou/pretext](https://github.com/chenglou/pretext) 的实现机制。由于传统 CSS 的 `shape-outside` 对 DOM 结构有强限制，`pretext` 这种基于纯数学计算的高性能文本布局引擎，能帮我们在复杂 Canvas 或高度动态的 GSAP 动画场景下，非常精准、高性能地计算出折行和环绕位置，避免浏览器的重排 (Reflow) 灾难。

### Task 5: 凹槽咬合与终局展开 (Phase 5 & 6)
- **目标**: 右侧滑入半圆反色凹槽，中途咬合缩小的灯球，展示三大版块导航 (work, blog, radar)，最后呈现 "to be continue"。
- **技术解释**:
  - **反色凹槽**: 用 `border-radius: 50% 0 0 50%` 结合特定的主题背景色或 `mix-blend-mode` 创建。
  - **物理咬合感**: 极度依赖 GSAP 时间线对齐——凹槽 `x` 轴滑入的过程，与灯球 `scale` 缩小以及可能发生的位移要同时、无缝进行。
  - **卡片展示**: 咬合动作的 `onComplete` 回调触发交错 (staggered) 动画，使内容优雅浮现。

### Task 6: 响应式降级与无障碍处理
- **目标**: 确保在手机端可用，并遵循全局的减弱动效规范。
- **技术解释**:
  - 使用媒体查询或 GSAP `matchMedia`，在小屏下采用上下堆叠布局（如：上方灯球，下方文字），取消复杂的左移和凹槽左右对撞，改为普通的淡入淡出。
  - 针对 `prefers-reduced-motion: reduce` 用户，禁用 `ScrollTrigger` 中导致大幅度位移和视差的动画，仅保留最终状态。

---

## 提交日志记录 / Git Modification Logs
> **约定**：每次完成上述的一个 Task，都必须严格遵守 `AGENTS.md` 的 Conventional Commits 规范，并在本区域记录进度并 commit。之后方可开启下一个 Task。

- [ ] **Phase 1**: Initial Glitch Animation 
      - *Git msg*: `feat(motion): add initial disco ball glitch effect`
- [ ] **Phase 2**: Typography Shift 
      - *Git msg*: `feat(motion): implement disco ball typography integration`
- [ ] **Phase 3**: Star Ring & Acceleration 
      - *Git msg*: `feat(motion): create 30-deg rotating star ring with scroll acceleration`
- [ ] **Phase 4**: Pretext Text Wrap 
      - *Git msg*: `feat(motion): apply pretext engine for dynamic text wrapping around ball`
- [ ] **Phase 5**: Groove & Final Reveal 
      - *Git msg*: `feat(motion): add groove catching animation and reveal final sections`
- [ ] **Phase 6**: Responsive & A11y 
      - *Git msg*: `fix(motion): add mobile degradation and reduced-motion support for homepage`
