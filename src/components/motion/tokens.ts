/**
 * 动效 token(DESIGN_SPEC §5):所有 GSAP 动效必须引用本文件常量,
 * 禁止在组件内出现内联时长/缓动/位移数值。
 */
export const motionTokens = {
  /** 时长(秒):fast=hover 类、base=常规入场、slow=大区块入场 */
  duration: { fast: 0.2, base: 0.5, slow: 0.8 },
  /** 缓动:enter=入场/揭示,transition=过渡/hover,accelerate=起始极慢、尾端指数级急加速的"弹出"感(revealer 覆盖/上刷) */
  ease: { enter: "power4.out", transition: "power2.inOut", accelerate: "expo.in" },
  /** 入场位移:y 24px → 0 */
  enterY: 24,
  /** 列表项 stagger 间隔(秒) */
  stagger: 0.08,
  /** 卡片 hover(A8):封面 scale 与卡片上浮 */
  hover: { imageScale: 1.03, cardLift: -4 },
} as const;
