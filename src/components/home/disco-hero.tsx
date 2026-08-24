import { TitleFigure } from "./title-figure";

/**
 * DiscoHero —— 主页迪斯科灯球叙事段(docs/homepage-animation-plan.md)。
 *
 * 当前进度:**只有标题**——矢量标题 "welcome T[O] carrykit"(TitleFigure,
 * 灯球充当 O、自转 + 斜星环)居中呈现,暂无背景字幕。
 *
 * 背景字幕(HR-BG)的「绕标题轮廓流排」方案已原型化并归档,见
 * docs/pretext-scrolling-subtitle-flow.md(含完整源码),日后重启时据此接入。
 */
export function DiscoHero() {
  return (
    <section data-hero className="relative mx-[calc(50%-50vw)] flex min-h-svh w-screen items-center justify-center overflow-hidden px-6 py-16">
      <TitleFigure
        className="w-[min(98vw,1700px)]"
        spinDuration={7}
        ringDuration={14}
        glow={1}
      />
    </section>
  );
}
