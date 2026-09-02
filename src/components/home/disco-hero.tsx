import { TitleFigure } from "./title-figure";

/**
 * DiscoHero —— 主页迪斯科灯球叙事段(docs/homepage-animation-plan.md)。
 *
 * 当前进度:**只有标题**——矢量标题 "welcome T[O] carrykit"(TitleFigure,
 * 灯球充当 O、自转 + 斜星环)居中呈现,暂无背景。
 *
 * 两套背景方案均已原型化并归档(含完整源码),日后重启时据此接入:
 * - 抖动流水背景:docs/water-dither-shader.md(WaterDither,曾接入又移除)
 * - 背景字幕「绕标题轮廓流排」:docs/pretext-scrolling-subtitle-flow.md
 */
export function DiscoHero() {
  return (
    <section data-hero className="relative mx-[calc(50%-50vw)] w-screen flex-1 overflow-hidden">
      <TitleFigure
        className="absolute inset-0"
        spinDuration={7}
        ringDuration={14}
        glow={1}
      />
    </section>
  );
}
