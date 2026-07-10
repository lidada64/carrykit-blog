/**
 * 动效 token(DESIGN_SPEC §5):所有 GSAP 动效必须引用本文件常量,
 * 禁止在组件内出现内联时长/缓动/位移数值。
 */

/** popSettle 分段点:前 82% 时间以压缩 expo.in 冲完 94% 距离 */
const popPeakTime = 0.82;
const popPeakValue = 0.94;
/**
 * revealer "弹出"缓动:起始极慢 → 指数加速冲至巅峰(压缩 expo.in,
 * 巅峰速度高于纯 expo.in)→ 贴近边缘时速度骤降(power3.out)缓停收边。
 * 两段在分段点数值连续、速度故意不连续,形成"冲刺后急刹"的手感。
 */
const popSettle = (p: number): number => {
  if (p <= 0) return 0;
  if (p < popPeakTime) {
    return popPeakValue * Math.pow(2, 10 * (p / popPeakTime - 1));
  }
  const q = (p - popPeakTime) / (1 - popPeakTime);
  return popPeakValue + (1 - popPeakValue) * (1 - Math.pow(1 - q, 3));
};

export const motionTokens = {
  /** 时长(秒):fast=hover 类、base=常规入场、slow=大区块入场 */
  duration: { fast: 0.2, base: 0.5, slow: 0.8 },
  /** 缓动:enter=入场/揭示,transition=过渡/hover,accelerate=冲刺后急刹的"弹出"感(revealer 覆盖/上刷) */
  ease: { enter: "power4.out", transition: "power2.inOut", accelerate: popSettle },
  /** 入场位移:y 24px → 0 */
  enterY: 24,
  /** 列表项 stagger 间隔(秒) */
  stagger: 0.08,
  /** 卡片 hover(A8):封面 scale 与卡片上浮 */
  hover: { imageScale: 1.03, cardLift: -4 },
} as const;
