"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SkyScreenScene } from "@/components/lab/sky-screen/sky-screen";
import { DiscoBall } from "@/components/home/disco-ball";
import { CursorRing } from "@/components/home/cursor-ring";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * HomeHero —— 首页壳:sky-screen 粒子标题(点击爆开/中央 3D 视频/长按倒流)+ 吊起的迪斯科灯球 +
 * 自定义光标环(CursorRing)+ **下滑时水面 night→mid**。
 *
 * night→mid:ScrollTrigger pin 住舞台,滚动进度 scrub 给 `waterScroll` 0→1(water 内部 night→mid 混合);
 * 滚过这段后解 pin → 露出站点 Footer。复刻旧首页 ① 那段(递归 zoom / 欢迎语已随归档去掉)。
 * reduced-motion:不建时间线,水面恒 night。
 */
export function HomeHero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // 一个滚动进度 scrollP(0..1)同驱三样:水面 night→mid、标题爆开(openOverride)、灯球吊起。
  const [scrollP, setScrollP] = useState(0);

  useGSAP(
    () => {
      const stage = stageRef.current;
      if (!stage) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const st = ScrollTrigger.create({
          trigger: stage,
          start: "top top",
          end: "+=140%",
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => setScrollP(self.progress),
        });
        return () => st.kill();
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="relative mx-[calc(50%-50vw)] w-screen flex-1">
      <div ref={stageRef} data-stage className="relative">
        {/* 转场:滚动同时驱动水面 night→mid + 标题粒子爆开(速度线)。 */}
        <SkyScreenScene waterScroll={scrollP} openOverride={scrollP} />

        {/* 吊在夜空的迪斯科灯球(无星环/光晕);转场时**吊起升出**(上移 + 淡出)。pointer-events-none。 */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-[6] -translate-x-1/2">
          <div
            className="flex flex-col items-center"
            style={{ transform: `translateY(${(-scrollP * 34).toFixed(2)}vh)`, opacity: 1 - scrollP }}
          >
            <div className="w-px" style={{ height: "2.5vh", backgroundColor: "var(--water-paper)", opacity: 0.5 }} />
            <DiscoBall size={90} glow={0} showRing={false} spinDuration={9} />
          </div>
        </div>
      </div>

      {/* 自定义光标环:仅舞台内接管(舞台外导航保留原生光标)。 */}
      <CursorRing stageRef={stageRef} />
    </div>
  );
}
