# 开发期限制突破记录 (Dev Overrides)

> 约定(2026-08-21 决策):开发中若为「实现效果」需要打破 docs 里的规定限制,
> 不在原规范文档里改动,而在本文件登记一条 DV-x,写明:**破了哪条 / 为什么 /
> 影响范围 / 何时收敛**。规范文档保持其原始约束不被稀释。

---

## DV-1 · 迪斯科球允许字面量色值

- **破了哪条**:DESIGN_SPEC §3 / ARCHITECTURE §7.2「组件禁止字面量色值,一律引用语义色 token」。
- **为什么**:铬/镜面质感依赖多档具体颜色的径向/线性渐变与高光,语义色板(background/foreground/muted/accent…)无法表达金属反光,强套 token 会毁掉观感。「效果优先」原则下允许。
- **影响范围**:仅 `src/components/home/disco-ball.module.css`(灯球预览替身内部)。其余组件仍严守 token 制。
- **何时收敛**:方案 C 的 CSS 球最终会被 Blender 预渲染序列(docs/blender-assets.md B-2/B-3)替换;届时颜色烘进贴图/序列,本 CSS 文件连同这条突破一并退场。

---

## DV-3 · 主页 hero 字号超出 5 档字号阶梯

- **破了哪条**:DESIGN_SPEC §2「公开页只准用 display/heading/subheading/body/caption 5 档,禁止新增中间档」。
- **为什么**:迪斯科球 hero 要求标题占屏约 75%,`text-display`(≤6rem)远不够;改用 `clamp(2.75rem, 11.5vw, 13rem)` 的 vw 大号字。
- **影响范围**:仅 `src/components/home/disco-hero.tsx` 的 `<h1>`。其余页面仍守 5 档。
- **何时收敛**:hero 是全站唯一超大标题的特例,预计长期保留;若后续要纳入体系,可在 @theme 里增设 `--text-hero` 档统一管理。

## DV-2 · (预留)引入 GSAP 之外的第三方库

- **破了哪条**:项目倾向「动效只用 GSAP 一个库」。
- **触发条件**:当序列播放器 / 3D 需要引入 three、@react-three/* 或 sprite 播放库时,在此登记具体库、用途、体积与回退方案。
- **当前状态**:**未触发**。Phase 0~2 的 CSS 球骨架只用既有 GSAP,无新增依赖。
- **备注(2026-08-23)**:曾短暂引入 `@chenglou/pretext` 试验「背景字幕绕标题轮廓流排」,后已**回退并归档**(依赖已移除),完整设计与源码见 [`pretext-scrolling-subtitle-flow.md`](pretext-scrolling-subtitle-flow.md);若重启该方案,再在此正式登记。
