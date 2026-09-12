"use client";

/**
 * hero-water.tsx —— W9 首页全屏水面背景
 *
 * `WaterScene`(W8 的装配件)在站点上的唯一挂载点。
 *
 * ── 三条位置约束,每一条都有代价 ────────────────────────────────────────
 * ① **必须渲染在 `<SmoothScroll>` 之外。** ScrollSmoother 用 `transform` 推内容,
 *    而 `transform` 会给子树建立新的**包含块** —— `position: fixed` 的元素在
 *    里面会退化成相对那个包含块定位,滚动时跟着一起走。
 *    这条是 `docs/water-dither-shader.md` §4 记下来的坑,踩过一次。
 * ② **`fixed inset-0 -z-10`。** 导航条 `<Nav>` 在 SmoothScroll 里、`<main>` 之上;
 *    水面若放进 hero 区块里盖不到导航那一条。`-z-10` 能透出是因为 `body` 的
 *    背景绘制在更底层(根元素的背景被提升到画布层),不是因为它透明。
 * ③ **`pointer-events-none`。** 代价是首页**没有鼠标涟漪、也拖不动灯球** ——
 *    那些交互留在 `/lab/water`。这是刻意的:首页 Act I 求静,而且一个铺满
 *    全屏、盖在所有内容下面的 canvas 一旦吃指针事件,整站的点击都要从它身上
 *    绕。所以下面把 `pointerRipple / clickImpulse / orbDrag` 三条也显式关掉 ——
 *    不是"反正收不到事件",而是**让计数板不说谎**。
 *
 * ── 只在首页 ──────────────────────────────────────────────────────────
 * `usePathname() !== "/"` 直接返回 null。挂在 `(site)/layout.tsx` 里是为了
 * 盖住导航,但它只该出现在首页 —— 博客页顶着一片水读不了字。
 *
 * ── 滚动进度怎么来 ────────────────────────────────────────────────────
 * 用 passive 的 `scroll` 监听 + rAF 合帧,**不是**每帧读 `scrollY`。
 * 组件承诺的「每帧零 DOM 读取」说的是 rAF 回调里;scroll 事件里读一次
 * `scrollY` 是浏览器已经算好的值(不触发强制回流),而且一帧最多读一次。
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { WaterDirectorFlags } from "@/components/lab/water/water-director";
import { WaterScene } from "@/components/lab/water/water-scene";

/**
 * 首页关掉的三条耦合。**指针事件根本到不了 canvas**(pointer-events-none),
 * 显式关掉是为了让 `/lab/water` 那块计数板在对比时不出现"收到 0 个事件但
 * 开关是开的"这种含混状态。
 */
const HOME_FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false,
  clickImpulse: false,
  orbDrag: false,
};

/** 空覆盖表。**必须是模块级常量** —— 每次 render 新建一个 `{}` 会让 props 每帧变。 */
const NO_OVERRIDES: Readonly<Record<string, number>> = {};

export interface HeroWaterProps {
  /**
   * 灯球总闸门 0..1。默认 1;HR-8 的时间线接进来之后由它驱动
   * (退场时拉到 0,行⑦/行⑪ 会把光池收回海岸线)。
   */
  orbEnergy?: number;
  /** 球心 NDC x。HR-8 里球的屏幕 x 是常数,所以默认值就够用 */
  orbX?: number;
}

export function HeroWater({ orbEnergy = 1, orbX = -0.44 }: HeroWaterProps): ReactElement | null {
  const pathname = usePathname();
  const [scroll, setScroll] = useState(0);
  /** rAF 合帧:一帧最多读一次 scrollY,连发的 scroll 事件被折叠掉 */
  const rafRef = useRef(0);

  useEffect(() => {
    if (pathname !== "/") return;
    const read = (): void => {
      rafRef.current = 0;
      const doc = document.documentElement;
      const span = doc.scrollHeight - window.innerHeight;
      /* 页面短到没有滚动余量时 progress 恒为 0 —— 除以 0 会得到 NaN,
       * 而 NaN 一路传到 uniform 就是整片黑屏(W1 踩过同一族)。 */
      const p = span > 1 ? window.scrollY / span : 0;
      setScroll(p < 0 ? 0 : p > 1 ? 1 : p);
    };
    const onScroll = (): void => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [pathname]);

  if (pathname !== "/") return null;

  return (
    <WaterScene
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      /* 开幕 hero 用 **night**(唯一天生适合灯球的构图,见方案修订 §1);
       * 滚动区间因此是 night → mid,与编排器的默认区间一致。 */
      preset="night"
      scroll={scroll}
      orbEnergy={orbEnergy}
      /* 首页没有聚焦态:那是 blog / 展示页 mid 的 B 态(W10) */
      focus={0}
      orbX={orbX}
      orbSpin={0}
      lightMode={0}
      quantize
      moonHalo={0}
      overrides={NO_OVERRIDES}
      flags={HOME_FLAGS}
      timeOverride={null}
      forceReducedMotion={false}
    />
  );
}
