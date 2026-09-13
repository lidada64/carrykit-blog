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

/* ── 方向 1「月与倒影」——星际牛仔 noir + 艾迪芬奇 diegetic + 超现实 ──
 *  灯球=悬在夜色水面上的月;标题 CarryKit. 卧在地平线附近,被光池照亮;
 *  正下方水面里一份**垂直镜像倒影**,借 SVG 水波扭曲 + 向下淡出融进水面,随波荡漾。
 *  退掉了 /lab/home 的 18 层递归隧道 —— 只剩「月 · 字 · 倒影」三样,安静不杂。
 *  所有数值均为**手感旋钮**(scrub 时间线归一 0..1,position/duration 数值 = 滚动进度)。 */

/** 水面 night→mid 相机过渡到位的进度点(之后恒 mid)。 */
const MORPH_END = 0.9;

/** 「月升」:灯球(月)在前段沿 yPercent 缓升 + orbEnergy 同步淡出(水面光池随之收)。 */
const HOIST_START_P = 0.05;
const HOIST_END_P = 0.55;
const HOIST_RISE = -90; // 负=上;月升幅度(比 home 的 -220 温和,月只是缓缓抬起)

/** 标题竖向锚点(屏幕 %):贴地平线附近(下三分之一),让倒影有水面可落。 */
const TITLE_TOP_PCT = 60;
/** 月晕注入增益(WaterScene moonHalo):给天空一圈月光,强化「月」的读法。 */
const MOON_HALO = 0.6;

/** 倒影:随进度**拉长**(scaleY 1→STRETCH)+ 淡出;波动幅度也随进度加剧(水面被月升搅动)。 */
const REFLECT_STRETCH = 1.6;

/** 水面耦合闸门(首页 canvas pointer-events-none,显式关交互只为语义清晰)。 */
const HOME_FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false,
  clickImpulse: false,
  orbDrag: false,
};
/** 空覆盖表。**必须模块级常量** —— 每次 render 新建 `{}` 会让 props 每帧变。 */
const NO_OVERRIDES: Readonly<Record<string, number>> = {};

/**
 * MoonReflectionScene —— /lab/home-moon 的滚动转场(方向 1)。
 *
 * 一条 pin + scrub 时间线,并置:
 * ① 水面 night→mid(单张 WaterScene 作 z-0 背景,scroll 0→1)。
 * ② 月升:DiscoBall(月)前段 yPercent 缓升,orbEnergy 同步淡出(水面光池收)。
 * ③ 倒影:标题镜像副本随进度拉长 + 波动加剧 + 淡出,溶散进水面;标题本体淡出。
 * ④ mid 承接:MidScene 末段 autoAlpha 淡入。
 * reduced-motion 不建时间线 → 静态月/字/倒影(水面定格 night)兜底。
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
      const midScene = root.querySelector<HTMLElement>("[data-midscene]");
      const disp = root.querySelector<SVGFEDisplacementMapElement>("[data-ripple-scale]");
      if (!stage) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // 倒影「活起来」:持续微摆 + SVG 位移呼吸 = 水在动(与 scrub 无关,循环)。
        const ambient = gsap.timeline({ repeat: -1, yoyo: true });
        if (reflect) ambient.to(reflect, { skewX: 1.6, duration: 3.2, ease: "sine.inOut" }, 0);
        if (disp) ambient.to(disp, { attr: { scale: 14 }, duration: 3.2, ease: "sine.inOut" }, 0);

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

        // ② 月升:orb 自身 yPercent 缓抬(脱离任何缩放)。
        if (orb)
          tl.to(orb, { yPercent: HOIST_RISE, ease: "power1.inOut", duration: HOIST_END_P - HOIST_START_P }, HOIST_START_P);

        // ③ 倒影:拉长 + 淡出(基准镜像 = -1.25 配标题的竖拉 1.25;拉伸时负号保持镜像)。
        if (reflect)
          tl.fromTo(
            reflect,
            { scaleY: -1.25, autoAlpha: 0.55 },
            { scaleY: -1.25 * REFLECT_STRETCH, autoAlpha: 0, ease: "power1.in", duration: 0.85 },
            0.1,
          );
        // 标题本体:后半程随月升离场淡出。
        if (title) tl.to(title, { autoAlpha: 0, ease: "power1.in", duration: 0.45 }, 0.45);

        // ④ mid 承接。
        if (midScene)
          tl.fromTo(
            midScene,
            { autoAlpha: 0, yPercent: 6 },
            { autoAlpha: 1, yPercent: 0, ease: "none", duration: 0.4 },
            0.6,
          );

        return () => ambient.kill();
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      {/* SVG 水波扭曲滤镜(供倒影 filter: url(#moon-ripple) 引用)。零尺寸、不占布局。
          feTurbulence 生成水纹噪声,feDisplacementMap 用它扭曲倒影文字;scale 由 GSAP 呼吸。 */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id="moon-ripple" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves={2} seed={7} result="noise" />
          <feDisplacementMap data-ripple-scale in="SourceGraphic" in2="noise" scale={8} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <section data-stage className="relative h-svh overflow-hidden">
        {/* ① 水面(z-0):night preset + moonHalo 月晕,scroll 0→1 = night→mid。 */}
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

        {/* ④ mid 场景占位(z-[1]):初始隐藏,末段淡入。 */}
        <div data-midscene className="absolute inset-0 z-[1] opacity-0">
          <MidScene />
        </div>

        {/* ② 标题 + 倒影层(z-10):贴地平线的 CarryKit. 与其水中镜像。
            分工:居中定位交给外层 CSS(-translate-x-1/2),动画(scaleY/skew/autoAlpha)交给 GSAP,
            两者作用在不同节点上 → GSAP 不会覆盖掉居中位移(否则 resize 会漂)。 */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* 标题本体:GSAP 只动 autoAlpha(不碰 transform),故 className 的居中+竖拉 1.25 保留。 */}
          <span
            data-title
            style={{ top: `${TITLE_TOP_PCT}%` }}
            className="absolute left-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-y-[1.25] whitespace-nowrap font-title text-[clamp(2.5rem,11vw,9rem)] font-normal italic leading-none tracking-[0.02em] text-foreground"
          >
            CarryKit.
          </span>
          {/* 倒影外层:纯 CSS 居中(translateX -50%)+ 向下淡出 mask + SVG 水波扭曲;不被 GSAP 触碰。
              top 比标题略低 0.3em(随字号缩放的间隙),transform-origin 顶端 → 内层向下翻成倒影。 */}
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
            {/* 内层:GSAP 独占 transform(初始 scaleY(-1.25) 镜像+竖拉,滚动时拉长;ambient 叠 skewX 荡漾)。 */}
            <span
              data-reflect
              className="block origin-top whitespace-nowrap font-title font-normal italic leading-none tracking-[0.02em] text-foreground"
              style={{ transform: "scaleY(-1.25)" }}
            >
              CarryKit.
            </span>
          </div>
        </div>

        {/* 覆盖层(z-20):[container-type:size] 使 SceneNav 的 cq 单位解析;承载顶栏 + 灯球(月)。 */}
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="relative h-full w-full [container-type:size]">
            <div className="pointer-events-auto">
              <SceneNav interactive />
            </div>
            {/* 灯球=月:居中偏上常驻,慢自转(月不该快转);段前 orb yPercent 缓升。 */}
            <div className="absolute left-1/2 top-[24%] h-[9cqw] w-[9cqw] -translate-x-1/2 -translate-y-1/2">
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
