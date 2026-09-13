"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/* ── 方向4「篝火与星座」v2:标题+星座**由水面天空的真星构成** ──
 *  不再叠 DOM 文字。改由 shader 在夜空铺稀疏星场(sky-stars.glsl),中间用一张屏幕空间遮罩
 *  清出留白、把 CarryKit + 星座作亮星点亮。本组件只负责:①生成遮罩画布喂给 WaterScene;
 *  ②经 overrides 开关/驱动星场与标题增益;③DOM 只留篝火星 + 行星(灯球)+ 顶栏。 */

const MORPH_END = 0.9;

/** 星场/标题增益(叠加在天空辐射上,tonemap 前;需够大才能越过夜空 pivot 翻成纸色墨点)。手感旋钮。 */
const STAR_GAIN = 0.7;
const STAR_DENSITY = 0.9; // 越大越稀疏(sky-stars 的阈值)
const TITLE_GAIN_MAX = 1.4; // 标题星座峰值(tonemap 会 clamp,足量=实心纸色细线)

/** 行星漂移:灯球随进度横向移过夜空 + 水面光池 orbX 同步。 */
const PLANET_X_FROM = -8;
const PLANET_X_TO = 12;
const PLANET_ORBX_FROM = -0.3;
const PLANET_ORBX_TO = 0.35;

const HOME_FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false,
  clickImpulse: false,
  orbDrag: false,
};

/** 把 CarryKit + 星座画进遮罩画布(数据纹理,非显示色):
 *  R 通道 = 清空区(模糊加粗一版 → 该区抑制环境星,给标题留白);
 *  G 通道 = 标题/星座(细描边斜体 + 星点节点 + 连线 → 作亮星点亮)。
 *  红线说明:这里的红/绿是**通道数据**(同 blue-noise PNG),不是渲染到屏幕的色值,水面按 R/G
 *  取值再用 ink/paper token 上色 —— 不违反"色值只来自 token"。 */
function drawSkyMask(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.34; // 上部 = 天空
  const fs = Math.min(w * 0.13, h * 0.22);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic ${fs}px "IM Fell English SC", Georgia, serif`;

  // R:清空留白 —— 模糊加粗的字块,给标题周围一圈干净夜空。
  ctx.save();
  ctx.filter = `blur(${Math.round(fs * 0.3)}px)`;
  ctx.fillStyle = "rgb(255,0,0)";
  ctx.fillText("CarryKit", cx, cy);
  ctx.fillText("CarryKit", cx, cy); // 叠一遍加厚留白
  ctx.restore();

  // G:标题星座 —— 细描边(字形=连线)+ 沿字幅上方一串星点节点 + 连线。lighter 叠加,不抹掉 R。
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgb(0,255,0)";
  ctx.lineWidth = Math.max(1.5, fs * 0.014);
  ctx.lineJoin = "round";
  ctx.strokeText("CarryKit", cx, cy);

  // 星点节点 + 连线:字幅上方一条起伏星链。
  ctx.fillStyle = "rgb(0,255,0)";
  const half = fs * 3.1; // 约字幅一半
  const topY = cy - fs * 0.72;
  const pts: [number, number][] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = cx - half + t * half * 2;
    const y = topY + Math.sin(t * Math.PI * 2.3 + 0.6) * fs * 0.12;
    pts.push([x, y]);
  }
  ctx.strokeStyle = "rgba(0,255,0,0.55)";
  ctx.lineWidth = Math.max(1, fs * 0.006);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  const r = Math.max(1.5, fs * 0.02);
  pts.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/**
 * CampfireScene v2 —— /lab/home-campfire。标题+星座由水面 shader 的天空星场构成。
 * reduced-motion:不建时间线,标题增益钉在满值(静态星座),星场靠 uTime 冻结成静态点。
 */
export function CampfireScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [waterScroll, setWaterScroll] = useState(0);
  const [orbEnergy, setOrbEnergy] = useState(1);
  const [orbX, setOrbX] = useState(PLANET_ORBX_FROM);
  const [starGain, setStarGain] = useState(STAR_GAIN);
  const [titleGain, setTitleGain] = useState(0);
  const [skyMask, setSkyMask] = useState<HTMLCanvasElement | null>(null);

  // 生成遮罩画布(字体就绪后;resize 重建 → 换引用 → 水面重传纹理)。
  useEffect(() => {
    let cancelled = false;
    const build = () => {
      const w = Math.min(window.innerWidth || 1280, 1920);
      const h = Math.min(window.innerHeight || 720, 1080);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      drawSkyMask(ctx, w, h);
      if (!cancelled) setSkyMask(c);
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(() => !cancelled && build());
    else build();
    window.addEventListener("resize", build);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", build);
    };
  }, []);

  const overrides = useMemo(
    () => ({ uSkyStarGain: starGain, uSkyStarDensity: STAR_DENSITY, uSkyTitleGain: titleGain }),
    [starGain, titleGain],
  );

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const stage = root.querySelector<HTMLElement>("[data-stage]");
      const planet = root.querySelector<HTMLElement>("[data-orb]");
      const fire = root.querySelector<HTMLElement>("[data-fire]");
      const midScene = root.querySelector<HTMLElement>("[data-midscene]");
      if (!stage) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        // 静态兜底:标题星座满值点亮(星场 uTime 冻结成静点)。
        setTitleGain(TITLE_GAIN_MAX);
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // 篝火余烬:明度/尺寸小幅脉动。
        const fireTween = fire
          ? gsap.to(fire, { opacity: 0.55, scale: 0.9, duration: 0.7, ease: "sine.inOut", repeat: -1, yoyo: true })
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
              // 标题星座:[0.05,0.5] 逐渐连亮,[0.7,0.9] 随入 mid 淡出。
              const draw = p <= 0.05 ? 0 : p >= 0.5 ? 1 : (p - 0.05) / 0.45;
              const fade = p <= 0.7 ? 1 : p >= MORPH_END ? 0 : 1 - (p - 0.7) / (MORPH_END - 0.7);
              setTitleGain(TITLE_GAIN_MAX * draw * fade);
              setStarGain(STAR_GAIN * fade);
              // 光池随入 mid 淡出。
              setOrbEnergy(p <= 0.6 ? 1 : p >= MORPH_END ? 0 : 1 - (p - 0.6) / (MORPH_END - 0.6));
            },
          },
        });

        if (planet) tl.fromTo(planet, { xPercent: PLANET_X_FROM }, { xPercent: PLANET_X_TO, ease: "none", duration: 1 }, 0);
        if (midScene)
          tl.fromTo(midScene, { autoAlpha: 0, yPercent: 6 }, { autoAlpha: 1, yPercent: 0, ease: "none", duration: 0.4 }, 0.6);

        return () => {
          fireTween?.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      {/* 无障碍:真标题给读屏/SEO(视觉隐藏,画面里的标题由天空星座呈现)。 */}
      <h1 className="sr-only">CarryKit</h1>

      <section data-stage className="relative h-svh overflow-hidden">
        {/* ① 水面(z-0):night preset + 天空星场/星座标题(overrides + skyMask)。 */}
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
          overrides={overrides}
          flags={HOME_FLAGS}
          timeOverride={null}
          forceReducedMotion={false}
          skyMask={skyMask}
        />

        {/* ⑤ mid 场景占位(z-[1])。 */}
        <div data-midscene className="absolute inset-0 z-[1] opacity-0">
          <MidScene />
        </div>

        {/* ④ 篝火(z-10):底部复用 STAR_CLIP 一颗星,ambient 脉动作余烬(两色不上暖色)。 */}
        <div className="pointer-events-none absolute inset-0 z-10">
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
