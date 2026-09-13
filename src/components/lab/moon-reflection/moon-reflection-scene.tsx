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

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ── 方向 1「月与倒影」v2 —— 星际牛仔 noir + 艾迪芬奇 diegetic + 超现实 ──
 *  灯球=悬在夜色水面上的月。补齐 v1 缺的两样:
 *   ①**月的倒影** = 镜像月盘(翻转 DiscoBall) + 其下延展的**波光月华路径**(碎裂竖光带);
 *   ②**朦胧雾感** = 月背光晕 bloom + 地平线雾带 + 近地平线一薄层 backdrop-blur。
 *  都随水波荡漾(SVG 位移)+ 向下淡出融进水面。标题 CarryKit. 卧地平线,亦有其文字倒影。
 *  颜色只用 var(--water-paper)/token;mask 里的黑/透明是遮罩通道非色值。手感旋钮(scrub 归一 0..1)。 */

const MORPH_END = 0.9;

/** 「月升」:灯球(月)前段沿 yPercent 缓升 + orbEnergy 同步淡出(水面光池收)。 */
const HOIST_START_P = 0.05;
const HOIST_END_P = 0.55;
const HOIST_RISE = -90;

const TITLE_TOP_PCT = 60; // 标题竖向锚点(屏幕 %),贴地平线
const MOON_TOP_PCT = 24; // 月(灯球)竖向锚点,与倒影/光路对齐
const MOON_HALO = 0.6; // 天空月晕(WaterScene moonHalo)
const REFLECT_STRETCH = 1.6; // 文字倒影拉长量

const HOME_FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false,
  clickImpulse: false,
  orbDrag: false,
};
const NO_OVERRIDES: Readonly<Record<string, number>> = {};

/**
 * MoonReflectionScene v2 —— /lab/home-moon。
 * pin+scrub:月升 → 倒影(月盘+光路+文字)拉长闪烁后淡散、雾渐浓 → night→mid → MidScene 承接。
 * reduced-motion 不建时间线 → 静态月/倒影/雾(水面定格 night)。
 */
export function MoonReflectionScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [waterScroll, setWaterScroll] = useState(0);
  const [orbEnergy, setOrbEnergy] = useState(1);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const stage = root.querySelector<HTMLElement>("[data-stage]");
      const orb = root.querySelector<HTMLElement>("[data-orb]");
      const title = root.querySelector<HTMLElement>("[data-title]");
      const reflect = root.querySelector<HTMLElement>("[data-reflect]");
      const moonDisc = root.querySelector<HTMLElement>("[data-moon-disc]");
      const moonPath = root.querySelector<HTMLElement>("[data-moon-path]");
      const moonGlow = root.querySelector<HTMLElement>("[data-moon-glow]");
      const midScene = root.querySelector<HTMLElement>("[data-midscene]");
      const disp = root.querySelector<SVGFEDisplacementMapElement>("[data-ripple-scale]");
      if (!stage) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // 荡漾:SVG 位移呼吸 + 文字倒影微摆 + 月光路径碎光闪烁(与 scrub 无关,循环)。
        const ambient = gsap.timeline({ repeat: -1, yoyo: true });
        if (disp) ambient.to(disp, { attr: { scale: 16 }, duration: 3.2, ease: "sine.inOut" }, 0);
        if (reflect) ambient.to(reflect, { skewX: 1.6, duration: 3.2, ease: "sine.inOut" }, 0);
        if (moonPath) ambient.to(moonPath, { opacity: 0.32, duration: 1.6, ease: "sine.inOut" }, 0);
        if (moonDisc) ambient.to(moonDisc, { skewX: 2.2, duration: 2.6, ease: "sine.inOut" }, 0);

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
              setOrbEnergy(
                p <= HOIST_START_P
                  ? 1
                  : p >= HOIST_END_P
                    ? 0
                    : 1 - (p - HOIST_START_P) / (HOIST_END_P - HOIST_START_P),
              );
            },
          },
        });

        // ② 月升:orb 自身 yPercent 缓抬。
        if (orb)
          tl.to(orb, { yPercent: HOIST_RISE, ease: "power1.inOut", duration: HOIST_END_P - HOIST_START_P }, HOIST_START_P);

        // ③ 月之倒影(月盘 + 光路)随月升拉长 + 淡出。
        if (moonDisc) tl.to(moonDisc, { yPercent: -40, autoAlpha: 0, ease: "power1.in", duration: 0.7 }, 0.1);
        if (moonPath) tl.to(moonPath, { scaleY: 1.5, autoAlpha: 0, ease: "power1.in", duration: 0.7 }, 0.1);
        if (moonGlow) tl.to(moonGlow, { autoAlpha: 0, ease: "power1.in", duration: 0.6 }, 0.2);

        // ③' 文字倒影:拉长 + 淡出(基准镜像 -1.25 配标题竖拉 1.25)。
        if (reflect)
          tl.fromTo(
            reflect,
            { scaleY: -1.25, autoAlpha: 0.55 },
            { scaleY: -1.25 * REFLECT_STRETCH, autoAlpha: 0, ease: "power1.in", duration: 0.85 },
            0.1,
          );
        if (title) tl.to(title, { autoAlpha: 0, ease: "power1.in", duration: 0.45 }, 0.45);

        // ④ mid 承接。
        if (midScene)
          tl.fromTo(midScene, { autoAlpha: 0, yPercent: 6 }, { autoAlpha: 1, yPercent: 0, ease: "none", duration: 0.4 }, 0.6);

        return () => ambient.kill();
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      {/* SVG 水波扭曲滤镜(倒影/月盘/光路共用 filter:url(#moon-ripple))。scale 由 GSAP 呼吸。 */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id="moon-ripple" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.045" numOctaves={2} seed={7} result="noise" />
          <feDisplacementMap data-ripple-scale in="SourceGraphic" in2="noise" scale={10} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <section data-stage className="relative h-svh overflow-hidden">
        {/* ① 水面(z-0):night + moonHalo,scroll 0→1 = night→mid。 */}
        <WaterScene
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          preset="night"
          scroll={waterScroll}
          orbEnergy={orbEnergy}
          focus={0}
          orbX={0}
          orbSpin={0}
          lightMode={0}
          quantize
          moonHalo={MOON_HALO}
          overrides={NO_OVERRIDES}
          flags={HOME_FLAGS}
          timeOverride={null}
          forceReducedMotion={false}
        />

        {/* 雾感(z-[1]):坐在水面之上、mid 之下,不抢主体。 */}
        <div className="pointer-events-none absolute inset-0 z-[1]">
          {/* 月背光晕 bloom:大半径柔光,压低透明度 */}
          <div
            data-moon-glow
            style={{
              top: `${MOON_TOP_PCT}%`,
              background: "radial-gradient(closest-side, var(--water-paper), transparent)",
              filter: "blur(14px)",
            }}
            className="absolute left-1/2 h-[42vh] w-[42vh] -translate-x-1/2 -translate-y-1/2 opacity-25"
          />
          {/* 地平线雾带:横向柔光,近地平线一层薄霾 */}
          <div
            style={{ top: "52%", background: "linear-gradient(to bottom, transparent, var(--water-paper) 55%, transparent)", filter: "blur(6px)" }}
            className="absolute inset-x-0 h-[22vh] -translate-y-1/2 opacity-15"
          />
          {/* 近地平线薄层 backdrop-blur:梦幻化(subtle) */}
          <div className="absolute inset-x-0 top-[46%] h-[14vh] backdrop-blur-[2px]" />
        </div>

        {/* ④ mid 场景占位(z-[1] 之上仍用 z-[1] 组;这里单列 z-[1] 保持与雾同层但后绘) */}
        <div data-midscene className="absolute inset-0 z-[1] opacity-0">
          <MidScene />
        </div>

        {/* ② 月之倒影(z-[2]):月盘镜像 + 波光路径,在水面上、标题层下。 */}
        <div className="pointer-events-none absolute inset-0 z-[2]">
          {/* 波光月华路径:碎裂竖光带(repeating-linear-gradient),clip 成上窄下宽三角,mask 上下淡出,
              SVG 位移荡漾。颜色 var(--water-paper),mask 的黑/透明是通道。 */}
          <div
            data-moon-path
            style={{
              top: `${MOON_TOP_PCT + 10}%`,
              height: "70%",
              width: "16vw",
              transformOrigin: "top center",
              background:
                "repeating-linear-gradient(to bottom, var(--water-paper) 0 2px, transparent 2px 9px)",
              filter: "url(#moon-ripple)",
              clipPath: "polygon(44% 0, 56% 0, 78% 100%, 22% 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 14%, #000 60%, transparent 96%)",
              maskImage: "linear-gradient(to bottom, transparent, #000 14%, #000 60%, transparent 96%)",
            }}
            className="absolute left-1/2 -translate-x-1/2 opacity-45"
          />
          {/* 镜像月盘:翻转 DiscoBall,低透明度,SVG 位移 + 向下淡出。 */}
          <div
            data-moon-disc
            style={{
              top: `${MOON_TOP_PCT + 20}%`,
              filter: "url(#moon-ripple)",
              WebkitMaskImage: "linear-gradient(to bottom, #000, transparent 88%)",
              maskImage: "linear-gradient(to bottom, #000, transparent 88%)",
            }}
            className="absolute left-1/2 h-[9vh] w-[9vh] -translate-x-1/2 origin-top -scale-y-100 opacity-40"
          >
            <DiscoBall size="100%" glow={1} spinDuration={30} showRing={false} />
          </div>
        </div>

        {/* ③ 标题 + 文字倒影(z-10)。 */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <span
            data-title
            style={{ top: `${TITLE_TOP_PCT}%` }}
            className="absolute left-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-y-[1.25] whitespace-nowrap font-title text-[clamp(2.5rem,11vw,9rem)] font-normal italic leading-none tracking-[0.02em] text-foreground"
          >
            CarryKit.
          </span>
          <div
            style={{
              top: `calc(${TITLE_TOP_PCT}% + 0.3em)`,
              filter: "url(#moon-ripple)",
              WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent 78%)",
              maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent 78%)",
            }}
            className="absolute left-1/2 -translate-x-1/2 origin-top text-[clamp(2.5rem,11vw,9rem)]"
            aria-hidden
          >
            <span
              data-reflect
              className="block origin-top whitespace-nowrap font-title font-normal italic leading-none tracking-[0.02em] text-foreground"
              style={{ transform: "scaleY(-1.25)" }}
            >
              CarryKit.
            </span>
          </div>
        </div>

        {/* 覆盖层(z-20):container-type 供 SceneNav cq 解析;顶栏 + 灯球(月)。 */}
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="relative h-full w-full [container-type:size]">
            <div className="pointer-events-auto">
              <SceneNav interactive />
            </div>
            <div
              style={{ top: `${MOON_TOP_PCT}%` }}
              className="absolute left-1/2 h-[9cqw] w-[9cqw] -translate-x-1/2 -translate-y-1/2"
            >
              <div data-orb className="h-full w-full">
                <DiscoBall size="100%" glow={1} spinDuration={30} showRing={false} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
