"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { HomeScene, STAR_CLIP } from "./home-scene";
import { CursorMirror } from "./cursor-mirror";
import { motionTokens } from "@/components/motion/tokens";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** 递归不动点(见 docs):嵌套映射 x'=0.5875+x/3、y'=0.549+y/3 的汇聚点。
 *  帧以此为原点缩到 1/3(收进右下角);每张嵌套卡以此为原点放大到 3(恰好填满父级)。 */
const FIXED_ORIGIN = "88.125% 82.35%";

/** 收缩段与每条问答段的时间线时长(单位);end 取其和的百分比。 */
const COLLAPSE = 1;
const QA = 1;

/** act2 逐条播报:问题(屏幕上方) + 答案(缩放画面左侧, Anton SC 大写)。答案为占位, 待填真文案。 */
const QA_ITEMS: { q: string; a: string }[] = [
  { q: "What is CarryKit", a: "A KIT YOU CARRY" },
  { q: "Who am I", a: "STILL FINDING OUT" },
  { q: "What is the meaning of life?", a: "TO CARRY ON" },
];

/**
 * HomeCollapse —— /lab/home 的**滚动收缩转场 + 问答播报**(见 docs/home-collapse-transition.md)。
 *
 * 一个 pin + scrub 时间线,两幕:
 * ① 收缩(视差=重合去嵌套):hero 帧以不动点 scale→1/3 收进右下角;**每张嵌套卡以同一不动点
 *    scale→3 放大恰好填满父级** → 首页缩、嵌套页放,层层重合,末态扁平**无嵌套**。缓动引站点
 *    转场遮罩(revealer)同款 accelerate(popSettle):慢起→指数冲刺→急刹。
 * ② 问答:继续下滑,屏幕上方问题依次交叉淡切(What is CarryKit / Who am I / 生命的意义),
 *    对应答案在缩放画面左侧(Anton SC 大写)切换;「CarryKit」淡化水印留在原位做背景。
 *
 * 篝火(星标)脱离缩放:摘出缩放帧,改在 stage 覆盖层常驻原位(帧底部居中),贯穿转场不缩不盖。
 * 覆盖层(问题/答案/水印/星标)均 pointer-events-none、不随帧缩放。
 * reduced-motion 不建时间线:静态满屏 hero + 其下堆叠问答 + 静态星标兜底。
 */
export function HomeCollapse() {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      const frame = frameRef.current;
      if (!root || !frame) return;

      const stage = root.querySelector<HTMLElement>("[data-stage]");
      const watermark = root.querySelector<HTMLElement>("[data-watermark]");
      const nestedCards = gsap.utils.toArray<HTMLElement>("[data-nested]", frame);
      const questions = gsap.utils.toArray<HTMLElement>("[data-question]", root);
      const answers = gsap.utils.toArray<HTMLElement>("[data-answer]", root);
      if (!stage) return;

      const accel = motionTokens.ease.accelerate;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.set(frame, { transformOrigin: FIXED_ORIGIN });
        nestedCards.forEach((c) => gsap.set(c, { transformOrigin: FIXED_ORIGIN }));

        // CursorMirror 门控:帧一缩放其 getBoundingClientRect 失真、镜像环错位 →
        // 滚出顶部时隐藏镜像环(data-active=0),回到顶部再恢复。仅原本 active 时切换。
        let hiddenByScroll = false;

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "+=400%", // 1 屏收缩 + 3 屏问答
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const p = self.progress;
              if (p > 0.02 && frame.dataset.active === "1") {
                frame.dataset.active = "0";
                hiddenByScroll = true;
              } else if (p <= 0.02 && hiddenByScroll) {
                frame.dataset.active = "1";
                hiddenByScroll = false;
              }
            },
          },
        });

        // ① 收缩:帧缩到 1/3;每张嵌套卡放大到 3(填满父级)→ 逐级重合、末态无嵌套。
        tl.to(frame, { scale: 1 / 3, ease: accel, duration: COLLAPSE }, 0);
        nestedCards.forEach((c) =>
          tl.to(c, { scale: 3, ease: accel, duration: COLLAPSE }, 0),
        );
        // CarryKit 水印:收缩时淡入到低不透明度做背景(承接被覆盖的帧内 wordmark)
        if (watermark)
          tl.fromTo(
            watermark,
            { autoAlpha: 0 },
            { autoAlpha: 0.14, ease: "none", duration: COLLAPSE },
            0,
          );

        // ② 问答逐条交叉淡切(问题+答案同步)。最后一条保持不淡出。
        questions.forEach((q, i) => {
          const pair = [q, answers[i]].filter(Boolean) as HTMLElement[];
          const at = COLLAPSE + i * QA;
          tl.fromTo(
            pair,
            { autoAlpha: 0 },
            { autoAlpha: 1, ease: "none", duration: QA * 0.35 },
            at,
          );
          if (i < questions.length - 1)
            tl.to(pair, { autoAlpha: 0, ease: "none", duration: QA * 0.35 }, at + QA);
        });
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      <section data-stage className="relative h-svh overflow-hidden bg-background">
        {/* 问题层:屏幕上方,3 条同位叠放交叉淡切(初始 opacity-0 → 时间线揭示) */}
        {QA_ITEMS.map(({ q }, i) => (
          <span
            key={i}
            data-question
            className="pointer-events-none absolute left-1/2 top-[7vh] z-20 -translate-x-1/2 whitespace-nowrap font-broadcast text-[clamp(0.9rem,2.6vw,1.6rem)] uppercase tracking-[0.18em] text-muted opacity-0"
          >
            {q}
          </span>
        ))}

        {/* 静止覆盖帧:与 hero 帧同尺寸/居中但不缩放;[container-type] 使 cqw 与 HomeScene 对齐 */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative aspect-[16/9] max-h-full w-full max-w-[calc(100vh*16/9)] [container-type:size]">
            {/* 淡化 CarryKit 水印:原 wordmark 位置/字体,收缩时淡入做背景 */}
            <span
              data-watermark
              className="absolute left-[11%] top-[43.6%] origin-center -translate-y-1/2 scale-y-[1.25] whitespace-nowrap font-title text-[8.5cqw] font-normal italic leading-none tracking-[0.02em] text-foreground opacity-0"
            >
              CarryKit.
            </span>

            {/* 答案层:左侧,放大 + 大写,Anton SC(font-broadcast);3 条同位叠放交叉淡切 */}
            {QA_ITEMS.map(({ a }, i) => (
              <span
                key={i}
                data-answer
                className="absolute left-[11%] top-1/2 max-w-[80%] -translate-y-1/2 font-broadcast text-[6.5cqw] uppercase leading-[0.92] text-foreground opacity-0"
              >
                {a}
              </span>
            ))}

            {/* 篝火星标:脱离缩放,常驻原位(帧底部居中) */}
            <div
              className="absolute left-1/2 top-[91%] h-[3.2cqw] w-[3.2cqw] -translate-x-1/2 -translate-y-1/2 bg-muted"
              style={{ clipPath: STAR_CLIP }}
            />
          </div>
        </div>

        {/* Hero 帧层:居中 16:9 letterbox,唯一参与缩放/视差;不再传 showCampfire(星标已独立) */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            ref={frameRef}
            data-active="0"
            className="group/frame aspect-[16/9] max-h-full w-full max-w-[calc(100vh*16/9)]"
          >
            <HomeScene depth={0} />
          </div>
        </div>
        <CursorMirror frameRef={frameRef} />
      </section>

      {/* reduced-motion 兜底:静态堆叠问答(仅在减弱动态时显示) */}
      <section className="hidden min-h-svh flex-col justify-center gap-12 px-[8vw] py-[12vh] motion-reduce:flex">
        {QA_ITEMS.map(({ q, a }, i) => (
          <div key={i} className="flex flex-col gap-2">
            <span className="font-broadcast text-[1.3rem] uppercase tracking-[0.18em] text-muted">
              {q}
            </span>
            <span className="font-broadcast text-[clamp(2rem,7vw,5rem)] uppercase leading-none text-foreground">
              {a}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
