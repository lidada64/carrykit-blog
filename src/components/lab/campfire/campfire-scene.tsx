"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { WaterScene } from "@/components/lab/water/water-scene";
import type { WaterDirectorFlags } from "@/components/lab/water/water-director";
import { DiscoBall } from "@/components/home/disco-ball";
import { SceneNav } from "@/components/lab/scene-nav";
import { MidScene } from "@/components/lab/mid-scene";
import { STAR_CLIP } from "@/components/lab/home-scene";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ── 方向 4「篝火与星座」——星际拓荒的探索者忧郁 ──
 *  保留底部篝火星(复用 STAR_CLIP)微微跳动;标题上方一串**星点连成的星座**逐笔连亮;
 *  灯球=缓缓漂过夜空的行星/月。退掉递归隧道 —— 温暖、辽阔、看星空的安静。
 *  所有数值均为**手感旋钮**(scrub 归一 0..1)。 */

const MORPH_END = 0.9;

/** 行星漂移:灯球随进度横向移过夜空(xPercent 自身位移 + 水面光池 orbX 同步)。 */
const PLANET_X_FROM = -8;
const PLANET_X_TO = 12;
const PLANET_ORBX_FROM = -0.3;
const PLANET_ORBX_TO = 0.35;

/** 标题(星座)竖向锚点(屏幕 %):地平线上方。 */
const TITLE_TOP_PCT = 42;

/** 星座连线「画入」的进度窗口(stroke-dashoffset 1→0)。 */
const DRAW_DUR = 0.6;

/** 星座节点(SVG viewBox 120×24 内的散点,近似字幅上方一条起伏星链)。手感旋钮。 */
const STARS: [number, number][] = [
  [6, 16], [15, 9], [25, 13], [34, 6], [45, 12], [54, 7], [63, 14],
  [73, 8], [83, 13], [93, 6], [102, 12], [111, 9], [117, 15],
];
const POLY = STARS.map(([x, y]) => `${x},${y}`).join(" ");

const HOME_FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false,
  clickImpulse: false,
  orbDrag: false,
};
const NO_OVERRIDES: Readonly<Record<string, number>> = {};

/**
 * CampfireScene —— /lab/home-campfire 的滚动转场(方向 4)。
 *
 * pin + scrub 时间线,并置:
 * ① 水面 night→mid。
 * ② 行星:DiscoBall 随进度横向漂过夜空,水面光池 orbX 同步。
 * ③ 星座:标题上方星链逐笔连亮(stroke-dashoffset)+ 星点错峰 twinkle;真实 CarryKit 文字保底可读。
 * ④ 篝火:底部星 ambient 明度/尺寸脉动(两色不许暖色,靠 paper 明度表现余烬)。
 * ⑤ mid 承接:MidScene 末段淡入。
 * reduced-motion 不建时间线 → 星座定格已连亮、行星定位、水面定格 night。
 */
export function CampfireScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [waterScroll, setWaterScroll] = useState(0);
  const [orbEnergy, setOrbEnergy] = useState(1);
  const [orbX, setOrbX] = useState(PLANET_ORBX_FROM);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const stage = root.querySelector<HTMLElement>("[data-stage]");
      const planet = root.querySelector<HTMLElement>("[data-orb]");
      const title = root.querySelector<HTMLElement>("[data-title]");
      const line = root.querySelector<SVGPolylineElement>("[data-constellation-line]");
      const dots = gsap.utils.toArray<SVGCircleElement>("[data-constellation-dot]", root);
      const fire = root.querySelector<HTMLElement>("[data-fire]");
      const midScene = root.querySelector<HTMLElement>("[data-midscene]");
      if (!stage) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // ④ 篝火余烬:明度 + 尺寸持续小幅脉动(短周期 yoyo)。
        const fireTween = fire
          ? gsap.to(fire, { opacity: 0.55, scale: 0.9, duration: 0.7, ease: "sine.inOut", repeat: -1, yoyo: true })
          : null;
        // 星点持续 twinkle(错峰、随机相位)。
        const dotTween = dots.length
          ? gsap.to(dots, { opacity: 0.35, duration: 1.1, ease: "sine.inOut", repeat: -1, yoyo: true, stagger: { each: 0.12, from: "random" } })
          : null;

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "+=400%",
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const p = self.progress;
              setWaterScroll(Math.min(1, p / MORPH_END));
              setOrbX(PLANET_ORBX_FROM + (PLANET_ORBX_TO - PLANET_ORBX_FROM) * p);
              // 光池在末段随入 mid 淡出。
              setOrbEnergy(p <= 0.6 ? 1 : p >= MORPH_END ? 0 : 1 - (p - 0.6) / (MORPH_END - 0.6));
            },
          },
        });

        // ② 行星横向漂过。
        if (planet) tl.fromTo(planet, { xPercent: PLANET_X_FROM }, { xPercent: PLANET_X_TO, ease: "none", duration: 1 }, 0);

        // ③ 星座连线画入 + 标题淡出承接。
        if (line) tl.fromTo(line, { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, ease: "none", duration: DRAW_DUR }, 0);
        if (title) tl.to(title, { autoAlpha: 0, ease: "power1.in", duration: 0.35 }, 0.55);

        // ⑤ mid 承接。
        if (midScene)
          tl.fromTo(midScene, { autoAlpha: 0, yPercent: 6 }, { autoAlpha: 1, yPercent: 0, ease: "none", duration: 0.4 }, 0.6);

        return () => {
          fireTween?.kill();
          dotTween?.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      <section data-stage className="relative h-svh overflow-hidden">
        {/* ① 水面(z-0):night preset,scroll 0→1 = night→mid。orbX 随行星漂移。 */}
        <WaterScene
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          preset="night"
          scroll={waterScroll}
          orbEnergy={orbEnergy}
          focus={0}
          orbX={orbX}
          orbSpin={0}
          lightMode={0}
          quantize
          moonHalo={0.3}
          overrides={NO_OVERRIDES}
          flags={HOME_FLAGS}
          timeOverride={null}
          forceReducedMotion={false}
        />

        {/* ⑤ mid 场景占位(z-[1])。 */}
        <div data-midscene className="absolute inset-0 z-[1] opacity-0">
          <MidScene />
        </div>

        {/* ③ 星座标题 + ④ 篝火(z-10)。 */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* 星座层:真实文字保底可读 + 上方星链装饰。居中定位交给外层。 */}
          <div
            data-title
            style={{ top: `${TITLE_TOP_PCT}%` }}
            className="absolute left-1/2 w-[min(90vw,60rem)] -translate-x-1/2 -translate-y-1/2"
          >
            {/* 星链(在标题正上方):连线画入 + 星点 twinkle。pathLength=1 归一 dash,便于 0..1 画入。 */}
            <svg viewBox="0 0 120 24" preserveAspectRatio="none" className="block h-[6vh] w-full overflow-visible" aria-hidden>
              <polyline
                data-constellation-line
                points={POLY}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={0}
                className="text-foreground opacity-70"
              />
              {STARS.map(([x, y], i) => (
                <circle key={i} data-constellation-dot cx={x} cy={y} r={0.7} className="fill-foreground" />
              ))}
            </svg>
            {/* 真实标题(保底可读)。 */}
            <span className="mt-[1vh] block scale-y-[1.2] whitespace-nowrap text-center font-title text-[clamp(2.5rem,10vw,8rem)] font-normal italic leading-none tracking-[0.02em] text-foreground">
              CarryKit.
            </span>
          </div>

          {/* ④ 篝火:底部居中一颗星(复用 STAR_CLIP),ambient 脉动作余烬。两色不上暖色。 */}
          <div
            data-fire
            style={{ clipPath: STAR_CLIP }}
            className="absolute left-1/2 top-[88%] h-[3.2vw] w-[3.2vw] -translate-x-1/2 -translate-y-1/2 bg-foreground"
          />
        </div>

        {/* 覆盖层(z-20):container-type 供 SceneNav cq 解析;顶栏 + 灯球(行星)。 */}
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="relative h-full w-full [container-type:size]">
            <div className="pointer-events-auto">
              <SceneNav interactive />
            </div>
            {/* 灯球=行星:偏上、横向漂过(xPercent 由 GSAP 驱动);慢自转。 */}
            <div className="absolute left-1/2 top-[20%] h-[7cqw] w-[7cqw] -translate-x-1/2 -translate-y-1/2">
              <div data-orb className="h-full w-full">
                <DiscoBall size="100%" glow={1} spinDuration={26} showRing={false} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
