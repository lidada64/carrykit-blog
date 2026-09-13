"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { HomeScene } from "./home-scene";
import { CursorMirror } from "./cursor-mirror";
import { MidScene } from "./mid-scene";
import { WaterScene } from "@/components/lab/water/water-scene";
import type { WaterDirectorFlags } from "@/components/lab/water/water-director";
import { DiscoBall } from "@/components/home/disco-ball";
import { motionTokens } from "@/components/motion/tokens";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** 递归不动点 = 嵌套汇聚点(50%,38.2%)。整帧以此为原点 zoom-in = 瀑布的「前进」(往隧道深处钻)。 */
const FIXED_ORIGIN = "50% 38.2%";

/** 递归收口层数(多几层 = 隧道更深、瀑布层次更多)。v3.2 加深:嵌套比例调大到 0.7(层间距更小、
 *  更密)后每层步幅变小,需要更多层才收口到不动点;深层 opacity 0.8^d 隐入水面无穿帮。手感旋钮。 */
const MAX_DEPTH = 18;

/** 「前进」:整帧以不动点(golden point,偏上)统一 zoom-in 的目标缩放 —— 把隧道深处往观众面前推、
 *  深层放大;**因原点偏上,前层(在中心下方)会随 zoom 快速往下 descend 冲出屏底 = 前层最快下坠**,
 *  深层(近原点)则留在中心放大。zoom 空间梯度天然给出「前快远、后慢近、无挤团」的错落瀑布:
 *  S=7 时 depth0→冲出屏底、depth1→84%、depth2→63%、深层→~40%(贴原点=只前进微坠)。
 *  **v3.1 主驱动**:删掉加性逐卡下坠(已证伪=挤团),让 zoom 独当「前进+前快后慢」。
 *  越大 = 前进越狠、下落时「前进」速度越大、前层排出越快。手感旋钮。 */
const FRAME_ZOOM = 9;

/* ── 时间线全部按**滚动进度**(0..1)表达:时间线总时长归一为 1,scrub 线性映射到 `end` 的滚动配额,
 *    于是 tween 的 position/duration 数值 = progress 值。所有数值均为**手感旋钮**,实测调。 ── */

/** 水面 night→mid 相机过渡到位的进度点(之后恒 mid)。这是「衔接动画」。 */
const MORPH_END = 0.9;

/** 灯球「吊起升出」的进度窗口 + 上移量(yPercent,负=上);窗口内 orbEnergy 同步 1→0(灯球↔水面光池)。 */
const HOIST_START_P = 0.05;
const HOIST_END_P = 0.4;
const HOIST_RISE = -220;

/** 镜像光标环隐藏的进度阈值(瀑布一开始就藏,回滚恢复)。 */
const MIRROR_HIDE_P = 0.06;

/** 前快后慢的层次瀑布(v3.2:**每层标题 word_d 各自独立坠落** —— 修正 v3.1「只 word0 坠、后层不动、
 *  从第二层起才动且太晚 = 没层次感」)。
 *  为何只驱动各层标题 word_d、不驱动 `[data-nested]` 卡:嵌套卡是所有更深层的 **DOM 祖先**,给它加
 *  yPercent 会被逐层复合累加 → 深层净坠 > 前层 = 挤团(v3 已证伪)。而每层标题 word_d 是「其下更深子树」
 *  的**兄弟**(渲染顺序:wordmark → nested 卡),彼此互不复合、又各自能独立淡出 → 可精确编排
 *  「前层坠得快、深层坠得慢」的剪切式错落,不重蹈挤团。可见的瀑布「层」本就是这些标题(卡透明无框)。
 *  · WORD_FALL_START≈0 + 小 STAGGER:一滑动就起、前层略领先(修正「从第二层起太晚」)。
 *  · 时长 = FRONT_DUR + depth·DUR_STEP:前层短时长=坠得快、深层长时长=坠得慢(前快后慢核心)。
 *  · WORD_FALL_YPCT:下坠量(相对各层自身字高;深层字号小 → 同 % 的绝对位移自动更小,再叠前快后慢)。 */
const WORD_FALL_START = 0.0;
const WORD_FALL_STAGGER = 0.025;
const WORD_FALL_FRONT_DUR = 0.4;
const WORD_FALL_DUR_STEP = 0.07;
const WORD_FALL_YPCT = 520;

/** mid 场景占位淡入的起始进度(随水面到位 + 嵌套坠离,末段承接)。 */
const MID_AT = 0.55;

/** act2 逐条播报(占位,SHOW_BROADCAST=false 时不渲染/不建时间线)。 */
const QA_ITEMS: { q: string; a: string }[] = [
  { q: "What is CarryKit", a: "A KIT YOU CARRY" },
  { q: "Who am I", a: "STILL FINDING OUT" },
  { q: "What is the meaning of life?", a: "TO CARRY ON" },
];
const SHOW_BROADCAST = false;

/** 水面耦合闸门(值同 `hero-water.tsx`)。首页 canvas pointer-events-none,显式关掉只为语义清晰;其余默认 on。 */
const HOME_FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false,
  clickImpulse: false,
  orbDrag: false,
};

/** 空覆盖表。**必须是模块级常量** —— 每次 render 新建 `{}` 会让 props 每帧变。 */
const NO_OVERRIDES: Readonly<Record<string, number>> = {};

/**
 * HomeCollapse —— /lab/home 的滚动转场(v3.2:**zoom 隧道前进 + 各层标题前快后慢瀑布 + 水面 night→mid**)。
 *
 * 一条 pin + scrub 时间线(无「收缩居中」环节),并置四件事:
 * ① 水面 night→mid 过渡:单张 `WaterScene` 作 z-0 持续背景,`scroll` 跟随进度 0→1(MORPH_END 到位 mid)。
 * ② 层次瀑布:整帧以不动点 **zoom-in 前进**(往隧道深处钻、深层放大)做「前进」底座;之上,**每层标题
 *    word_d 各自独立坠落 + 淡出** —— 前层早起短时长=坠得快、深层稍晚长时长=坠得慢,前层领先逐层拉开
 *    = 剪切式倾斜错落(一滑就坠)。嵌套卡是深层 DOM 祖先,驱动会复合挤团(v3 已证伪),故不驱动、
 *    纯随 zoom 前进 —— 层次全来自各层标题的速度差。突破页面(home-scene 已去 overflow-hidden)流入 mid。
 * ③ 灯球吊起升出:前段单独沿 yPercent 升出,orbEnergy 同步淡出 → 水面灯球光池收掉(灯球↔水面交互)。
 * ④ mid 承接:`MidScene` 占位末段 autoAlpha 淡入(progress→1 落在 mid)。
 *
 * z 分层:水面 z-0 < mid 场景占位 z-[1] < 递归 hero 帧 z-10 < 覆盖层 + 灯球 z-20。
 * reduced-motion 不建时间线:静态满屏 hero 兜底(水面定格 night)。
 */
export function HomeCollapse() {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** 水面滚动映射:0=night、1=mid。progress 到 MORPH_END 时到位,之后恒 1(mid)。 */
  const [waterScroll, setWaterScroll] = useState(0);
  /** 水面灯球光池闸门 0..1:灯球吊起窗口内 1→0(球离场 → 水里的光同步收)。 */
  const [orbEnergy, setOrbEnergy] = useState(1);

  useGSAP(
    () => {
      const root = rootRef.current;
      const frame = frameRef.current;
      if (!root || !frame) return;

      const stage = root.querySelector<HTMLElement>("[data-stage]");
      const midScene = root.querySelector<HTMLElement>("[data-midscene]");
      const orb = root.querySelector<HTMLElement>("[data-orb]");
      // 每层标题(DOM 顺序 = depth 0,1,2,… 由外往深)——瀑布的可见「层」。各层标题是其下更深子树的
      // 兄弟,彼此不复合、可独立淡出,故逐个独立驱动(前快后慢)。嵌套卡 [data-nested] 是深层祖先,
      // 若驱动会复合挤团(v3 已证伪),故**不**收集、纯随整帧 zoom 前进。
      const words = gsap.utils.toArray<HTMLElement>('[data-key="wordmark"]', frame);
      if (!stage) return;

      const swipe = motionTokens.ease.swipe;
      const accel = motionTokens.ease.accelerate; // popSettle:冲刺感,给 zoom/下坠动感
      const TL = 1; // 时间线归一总时长 = progress

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.set(frame, { transformOrigin: FIXED_ORIGIN });

        // CursorMirror 门控:瀑布未起(p≤MIRROR_HIDE_P)保留镜像环;一旦开始下坠帧内 rect 剧变 → 隐藏,回滚恢复。
        let hiddenByScroll = false;

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "+=400%", // 无收缩段,较 v2 缩短
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const p = self.progress;
              // ① 水面 night→mid:progress 归一到 [0,MORPH_END] → 到位后恒 1(mid)。
              setWaterScroll(Math.min(1, p / MORPH_END));
              // ③ 灯球光池随「吊起升出」同步淡出(灯球↔水面交互)。
              setOrbEnergy(
                p <= HOIST_START_P
                  ? 1
                  : p >= HOIST_END_P
                    ? 0
                    : 1 - (p - HOIST_START_P) / (HOIST_END_P - HOIST_START_P),
              );
              if (p > MIRROR_HIDE_P && frame.dataset.active === "1") {
                frame.dataset.active = "0";
                hiddenByScroll = true;
              } else if (p <= MIRROR_HIDE_P && hiddenByScroll) {
                frame.dataset.active = "1";
                hiddenByScroll = false;
              }
            },
          },
        });

        // ②a 前进(主驱动):整帧以不动点 zoom-in(往隧道深处钻、深层放大),全程;缓动 accelerate
        //    慢起快收 = 前段「层层堆叠推进」、后段「加速峰落」的瀑布手感。zoom 空间梯度天然造出
        //    前快远、后慢近、深层只前进微坠 —— 独当「前进+前快后慢」的错落瀑布(替代已证伪的加性逐卡下坠)。
        tl.to(frame, { scale: FRAME_ZOOM, ease: accel, duration: TL }, 0);

        // ③ 灯球「吊起升出」:orb 在覆盖层脱离缩放,只做自身 yPercent 升过帧顶(swipe 慢快慢)。
        if (orb)
          tl.to(orb, { yPercent: HOIST_RISE, ease: swipe, duration: HOIST_END_P - HOIST_START_P }, HOIST_START_P);

        // ②b 前快后慢的层次瀑布:每层标题 word_d 各自坠落 + 淡出(yPercent 叠在 className 居中
        //    translate 之上,不 clobber)。前层早起 + 短时长 = 坠得快;深层稍晚 + 长时长 = 坠得慢 →
        //    前层领先、逐层拉开 = 剪切式倾斜错落。全部 p≈0 就起(一滑就坠)。时长封顶到 TL 内。
        //    嵌套卡本身不驱动(会复合挤团),纯随 zoom 前进 —— 层次全来自各层标题的速度差。
        words.forEach((word, i) => {
          const at = WORD_FALL_START + i * WORD_FALL_STAGGER;
          const dur = Math.min(WORD_FALL_FRONT_DUR + i * WORD_FALL_DUR_STEP, TL - at);
          tl.to(word, { yPercent: WORD_FALL_YPCT, autoAlpha: 0, ease: accel, duration: dur }, at);
        });

        // ④ mid 场景占位:末段 autoAlpha 淡入承接(轻微上移到位)。
        if (midScene)
          tl.fromTo(
            midScene,
            { autoAlpha: 0, yPercent: 6 },
            { autoAlpha: 1, yPercent: 0, ease: "none", duration: TL - MID_AT },
            MID_AT,
          );
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      {/* 去掉 bg-background:否则不透明底色盖住水面。兜底靠根 <main className="bg-background">
          (app/lab/home/page.tsx)在水面未就绪 / WebGL 失败时透出。 */}
      <section data-stage className="relative h-svh overflow-hidden">
        {/* ① 水面(z-0 持续背景):preset night + scroll 0→1 = night→mid 过渡。**不随 hero 移动**。 */}
        <WaterScene
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          preset="night"
          scroll={waterScroll}
          orbEnergy={orbEnergy}
          focus={0}
          /* orbX=0:水面光池锁到水平居中的 DiscoBall(left-1/2)正下方(NDC 0)。 */
          orbX={0}
          orbSpin={0}
          lightMode={0}
          quantize
          moonHalo={0}
          overrides={NO_OVERRIDES}
          flags={HOME_FLAGS}
          timeOverride={null}
          forceReducedMotion={false}
        />

        {/* ④ mid 场景占位(z-[1]):坐在水面之上、hero 帧之下。初始隐藏,末段淡入。 */}
        <div data-midscene className="absolute inset-0 z-[1] opacity-0">
          <MidScene />
        </div>

        {/* 问题层(占位,SHOW_BROADCAST=false 时不渲染) */}
        {SHOW_BROADCAST && QA_ITEMS.map(({ q }, i) => (
          <span
            key={i}
            data-question
            className="pointer-events-none absolute left-1/2 top-[7vh] z-20 -translate-x-1/2 whitespace-nowrap font-broadcast text-[clamp(0.9rem,2.6vw,1.6rem)] uppercase tracking-[0.18em] text-muted opacity-0"
          >
            {q}
          </span>
        ))}

        {/* 覆盖层(z-20):[container-type] 使 cqw 与 HomeScene 对齐;承载灯球(+ 隐藏的答案层)。 */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative h-full w-full [container-type:size]">
            {/* 答案层(占位,SHOW_BROADCAST=false 时不渲染) */}
            {SHOW_BROADCAST && QA_ITEMS.map(({ a }, i) => (
              <span
                key={i}
                data-answer
                className="absolute left-[11%] top-1/2 max-w-[80%] -translate-y-1/2 font-broadcast text-[6.5cqw] uppercase leading-[0.92] text-foreground opacity-0"
              >
                {a}
              </span>
            ))}

            {/* 灯球(真 DiscoBall):脱离缩放、常驻覆盖层原位(帧顶居中)。[data-orb] 是「吊起升出」的
                GSAP 目标(动自身 yPercent);升出同步淡出 orbEnergy → 水面灯球光池收掉(灯球↔水面交互)。 */}
            <div className="absolute left-1/2 top-[19.5%] h-[7.6cqw] w-[7.6cqw] -translate-x-1/2 -translate-y-1/2">
              <div data-orb className="h-full w-full">
                <DiscoBall size="100%" glow={1} spinDuration={7} showRing={false} />
              </div>
            </div>
          </div>
        </div>

        {/* ② Hero 帧层(z-10):承载递归 hero(透明,浮在水面上)。递归各层标题/卡在此下坠成瀑布。 */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div ref={frameRef} data-active="0" className="group/frame relative h-full w-full">
            <HomeScene depth={0} maxDepth={MAX_DEPTH} showCampfire />
          </div>
        </div>
        <CursorMirror frameRef={frameRef} />
      </section>

      {/* reduced-motion 兜底:静态堆叠问答(仅在减弱动态时显示) */}
      <section className="hidden min-h-svh flex-col justify-center gap-12 px-[8vw] py-[12vh] motion-reduce:flex">
        {SHOW_BROADCAST && QA_ITEMS.map(({ q, a }, i) => (
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
