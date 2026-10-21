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
  heroPrototype: {
    orb: { brightness: 100, density: 55 },
    transition: {
      duration: 2.4, shrinkStart: .1, shrinkEnd: .6,
      lightStart: .35, lightEnd: .75, liftStart: .55, liftEnd: .95,
      finalDiameter: 190, finalHeight: .28,
      ropeStart: .5, ropeEnd: .7, titleEnd: .25, releaseDelay: 450,
    },
    scrollScreens: 2.5, coverStart: 62, feather: 9, blur: 22, titleLift: 12,
    camera: {
      defaultOrbit: -34,
      defaultElevation: 12,
      centered: { yaw: .05, pitch: .055, distance: 6.8, target: [.15, -.1, .95] },
      opening: { yaw: .85, pitch: .18, distance: 6.8, target: [-.65, -.2, .6] },
      right: { yaw: .05, pitch: .055, distance: 5.4, target: [.15, -.1, .95] },
      left: { yaw: Math.PI + .06, pitch: .045, distance: 4.8, target: [.15, -.1, .95] },
    },
  },
  /** 时长(秒):fast=hover 类、base=常规入场、slow=大区块入场 */
  duration: { fast: 0.2, base: 0.5, slow: 0.8 },
  /** 惯性滚动(ScrollSmoother):内容追赶原生滚动位置的时长(秒),越大惯性越明显 */
  inertia: 1.1,
  /** 缓动:enter=入场/揭示,transition=过渡/hover,accelerate=冲刺后急刹的"弹出"感(revealer 覆盖/上刷),swipe=慢快慢上刷效果 */
  ease: { enter: "power4.out", transition: "power2.inOut", accelerate: popSettle, swipe: "power4.inOut" },
  /** 入场位移:y 24px → 0 */
  enterY: 24,
  /** 列表项 stagger 间隔(秒) */
  stagger: 0.08,
  /** 卡片 hover(A8):封面 scale 与卡片上浮 */
  hover: { imageScale: 1.03, cardLift: -4 },
} as const;
