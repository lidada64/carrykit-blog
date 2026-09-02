"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { HomeScene, STAR_CLIP } from "./home-scene";
import { CursorMirror } from "./cursor-mirror";
import { motionTokens } from "@/components/motion/tokens";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** 递归不动点 = 嵌套汇聚点。嵌套比例 r=0.5 映射 x'=0.25+0.5x、y'=0.309+0.5y,
 *  不动点 = (L/(1−r), T/(1−r)) = (50%, 61.8%) → 屏幕水平居中、竖直下黄金比线。
 *  帧以此为原点缩到 r(递退一级);每张嵌套卡以此为原点放大到 1/r(填满父级)。 */
const FIXED_ORIGIN = "50% 61.8%";

/** 嵌套比例 r:子卡 = 父级 r。转场缩放目标由它派生(段1 帧→r 递退一级、段2 卡→1/r 去嵌套)。
 *  改比例须与子卡 left/top(= F·(1−r) = 25% / 30.9%)、FIXED_ORIGIN 联动。
 *  r 越小 = 层数密度越低(每层递缩步幅越大、隧道更疏)。 */
const NEST_RATIO = 0.5;

/** 时间线时长(单位);end = 各段之和的百分比。
 *  段1 递退一级(整帧 →r);段2 依次去嵌套(内层卡 →1/r,深层先)与问答同步铺满;段3 隧道缩没(帧 →0)。 */
const SEG1 = 1;
const QA = 1;
const FADE = 1; // 段3:末端隧道缩没入不动点的滚动配额

/** 段1 dolly 视差幅度:每层 counter-scale(越深越大 → 净递退越慢 = 越靠前越快)。手感旋钮。
 *  注:嵌套复合 → 幅度非线性放大,~0.06 时最深层净递退≈静止;再大最深层会「反涨」溢出(裁掉,可接受)。 */
const PARALLAX = 0.06;

/** 段1 末尾灯球「吊起升出」:占段1 尾段的比例 + 上移量(orb 自身高的倍数,负=上)。
 *  −220% ≈ 从 top 19.5% 升过帧顶完全离场(orb 高 7.6cqw、帧高 56.25cqw 换算),第二幕开始前已离场。 */
const HOIST_SPAN = 0.6; // 吊起动作占 SEG1 的后 60%(「末尾」)
const HOIST_RISE = -220; // yPercent:升出顶部的目标位移

/** act2 逐条播报:问题(屏幕上方) + 答案(缩放画面左侧, Anton SC 大写)。答案为占位, 待填真文案。 */
const QA_ITEMS: { q: string; a: string }[] = [
  { q: "What is CarryKit", a: "A KIT YOU CARRY" },
  { q: "Who am I", a: "STILL FINDING OUT" },
  { q: "What is the meaning of life?", a: "TO CARRY ON" },
];

/**
 * HomeCollapse —— /lab/home 的**滚动收缩转场 + 问答播报**(见 docs/home-collapse-transition.md)。
 *
 * 一个 pin + scrub 时间线,拆成两段(+ 同步问答):
 * ① 段1 递退一级:hero 帧以不动点 scale→r(NEST_RATIO)收进下黄金比点 → 靠自相似合成,每层精确落到「后一层」
 *    footprint,整条隧道递退但**仍保持嵌套**(不摊平)。dolly 视差:深层 counter-scale 滞后 →
 *    越靠前越快、隧道被拉深。缓动引站点转场遮罩(revealer)同款 accelerate(popSettle)。
 *    灯球(orb)在覆盖层脱离缩放、不随收缩移动,仅段1 末尾以 swipe(慢快慢)「吊起升出」帧顶。
 * ② 段2 依次去嵌套(与问答同步):第一层卡(帧)保持 r 不动,内层嵌套卡逐张 scale→1/r 填满父级,
 *    **从最外浅层往深处**交错(外层先放大、深层加速跟进,末卡恰在段末收尾)。同时屏幕上方问题依次交叉淡切
 *    (What is CarryKit / Who am I / 生命的意义),答案在左侧(Anton SC 大写)切换;CarryKit 水印做背景。
 * ③ 段3 消失:段2 后隧道整帧从 r 继续 scale→0(about F)→ 缩向下黄金比不动点没入消失;问答/水印/星标
 *    (覆盖层)不缩、保留 → 末态 = 空背景 + 最后一条问答文字。
 *
 * 篝火(星标)、灯球(orb)脱离缩放:摘出缩放帧,改在 stage 覆盖层常驻原位(星标帧底部居中、
 * orb 帧顶部居中),不随收缩移动;orb 另在段1 末尾单独吊起升出。
 * 覆盖层(问题/答案/水印/星标/灯球)均 pointer-events-none、不随帧缩放。
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
      const SEG2 = QA_ITEMS.length * QA; // 段2 = 问答总长,去嵌套与其同步
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
            end: "+=500%", // 段1 递退(1) + 段2 去嵌套/问答(3) + 段3 缩没(1)
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

        // ① 段1 递退一级:整帧 scale→NEST_RATIO(about F)→ 靠合成让每层精确落到「后一层」footprint,
        //    隧道自相似递退、仍保持嵌套(不摊平)。此为「越靠前越快」的驱动层。
        tl.to(frame, { scale: NEST_RATIO, ease: accel, duration: SEG1 }, 0);
        // dolly 视差(front faster):给每张嵌套卡随深度递增的 counter-scale(i=0 最外层不加),
        //    深层净递退更慢 → 段1 期间隧道被「拉深」。段1 末深层略 >1(几 %),段2 再从此值 →1/r。
        nestedCards.forEach((c, i) =>
          tl.to(c, { scale: 1 + i * PARALLAX, ease: "power2.in", duration: SEG1 }, 0),
        );
        // 灯球「吊起升出」:orb 在覆盖层脱离缩放 → **不随嵌套/收缩动画移动**,只在段1 尾段
        //    (后 HOIST_SPAN)沿自身 yPercent 升过帧顶,缓动 swipe(power4.inOut = 慢快慢);
        //    SEG1 收尾 → 第二幕开始前离场。之后停在顶外,不再可见,无需清理。
        const orb = root.querySelector<HTMLElement>("[data-orb]");
        if (orb)
          tl.to(
            orb,
            { yPercent: HOIST_RISE, ease: motionTokens.ease.swipe, duration: SEG1 * HOIST_SPAN },
            SEG1 * (1 - HOIST_SPAN),
          );
        // CarryKit 水印:段1 淡入到低不透明度做背景(承接被覆盖的帧内 wordmark);
        //    **进入段2 先消失**(t=SEG1 快速淡出)→ 段2 不再有水印背景。
        if (watermark) {
          tl.fromTo(
            watermark,
            { autoAlpha: 0 },
            { autoAlpha: 0.14, ease: "none", duration: SEG1 },
            0,
          );
          tl.to(watermark, { autoAlpha: 0, ease: "none", duration: QA * 0.3 }, SEG1);
        }

        // ② 段2 依次去嵌套(**浅层先/从外往深**)+ 与问答同步:帧不 tween → 保持 r;
        //    内层卡逐张 scale→1/NEST_RATIO(about F、填满父级),按 DOM 序 **从最外浅层往深处交错**:
        //    最外层先放大填满,随后深层「慢慢开始」并加速跟进——嵌套复合(深层内容被每个外层缩放
        //    叠乘)→ 越深越放越快,像俯冲钻进隧道。
        //    起始只铺开 span、dur=SEG2−span → **最后一张(最深)卡恰在 SEG1+SEG2 收尾**,
        //    去嵌套完整落在 SEG2 内;各卡 dur 相同且大幅重叠 → 复合缩放平滑连续。
        const n = nestedCards.length; // nestedCards DOM 序:[0]=最外浅层 … 末=最深层
        const span = SEG2 * 0.4; // 各卡起始时间的总铺开(浅层先→深层后)
        const dur = SEG2 - span; // 末(最深)卡在 SEG1+SEG2 收尾
        nestedCards.forEach((card, k) => {
          const at = SEG1 + (n > 1 ? (k / (n - 1)) * span : 0);
          tl.to(card, { scale: 1 / NEST_RATIO, ease: accel, duration: dur }, at);
        });

        // ③ 问答逐条交叉淡切(问题+答案同步),与段2 去嵌套同步推进。最后一条保持不淡出。
        questions.forEach((q, i) => {
          const pair = [q, answers[i]].filter(Boolean) as HTMLElement[];
          const at = SEG1 + i * QA;
          tl.fromTo(
            pair,
            { autoAlpha: 0 },
            { autoAlpha: 1, ease: "none", duration: QA * 0.35 },
            at,
          );
          if (i < questions.length - 1)
            tl.to(pair, { autoAlpha: 0, ease: "none", duration: QA * 0.35 }, at + QA);
        });

        // ④ 段3 消失:段2 后,隧道整帧从 1/3 继续 scale→0(仍 about F)→ 整幅画面缩向右下不动点、
        //    缩成一点没入消失。问答/水印/星标(覆盖层)不缩、保留 → 末态 = 空背景 + 最后一条问答文字。
        tl.to(frame, { scale: 0, ease: accel, duration: FADE }, SEG1 + SEG2);
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

        {/* 静止覆盖帧:与 hero 帧同尺寸(填满视口、去 16:9 锁)但不缩放;[container-type] 使 cqw 与 HomeScene 对齐 */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative h-full w-full [container-type:size]">
            {/* 淡化 CarryKit 水印:与 scene wordmark 同(**水平居中**)位置/字体,收缩时淡入做背景 */}
            <span
              data-watermark
              className="absolute left-1/2 top-[43.6%] origin-center -translate-x-1/2 -translate-y-1/2 scale-y-[1.25] whitespace-nowrap font-title text-[11cqw] font-normal italic leading-none tracking-[0.02em] text-foreground opacity-0"
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

            {/* 灯球(disco orb 占位):脱离缩放、常驻原位(帧顶部居中,同 HomeScene 原位)→
                **不随嵌套/收缩动画移动**。外壳定位居中,内圆 [data-orb] 是段1 末尾「吊起升出」的
                GSAP 目标(动自身 yPercent,不扰居中)。日后内圆换 <DiscoBall size="100%" ... />。 */}
            <div className="absolute left-1/2 top-[19.5%] h-[7.6cqw] w-[7.6cqw] -translate-x-1/2 -translate-y-1/2">
              <div data-orb className="h-full w-full rounded-full bg-muted" />
            </div>
          </div>
        </div>

        {/* Hero 帧层:填满视口(去 16:9 锁),唯一参与缩放/视差;不再传 showCampfire(星标已独立) */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            ref={frameRef}
            data-active="0"
            className="group/frame relative h-full w-full"
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
