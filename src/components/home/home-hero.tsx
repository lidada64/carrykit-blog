"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { Observer } from "gsap/Observer";
import { useGSAP } from "@gsap/react";
import { SkyScreenScene } from "@/components/lab/sky-screen/sky-screen";
import { DiscoBall } from "@/components/home/disco-ball";
import { CursorRing } from "@/components/home/cursor-ring";

gsap.registerPlugin(Observer, useGSAP);

/**
 * HomeHero —— 首页壳:sky-screen 粒子标题(点击爆开/中央 3D 视频/长按倒流)+ 吊在夜空的迪斯科灯球 +
 * 自定义光标环(CursorRing)+ **下滑劫持转场**。
 *
 * 两个手势各管一件事(互斥,只能从 act1 各走各的):
 *  · **下滑滚动** = 水面 **night→mid** 升起(切换场景):下滑一下整段升到 mid,上滑一下退回 night;
 *    到 mid 顶部再下滑一下才松锁露 Footer,从 Footer 滚回顶部重新上锁。
 *  · **点灯球** = 灯球**坠落** + 天空粒子整体**压暗到几乎没有**(盖住成形的标题,不爆开)+ 灯球照度点亮
 *    在 **night 水面**上**浮现水下隐藏字**;再点一下(或落定后)回升复原。坠落中锁标题热区、灯球按钮禁用。
 * 灯球坠落态下不响应下滑、水面 mid 态下不响应点球(互斥 → 也避免「水面升起 + 浮字」参数打架)。
 * reduced-motion:不劫持,灯球静止,水面恒 night,页面正常滚动。
 */

const TRANSITION_S = 0.9; // 转场补间时长(定时补间,与滚动距离无关)
const DROP_VH = 46; // 灯球坠落行程(吊线拉长的 vh);落到暗水面上方,可视觉微调

export function HomeHero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /* waterP —— 水面 night→mid(下滑驱动),0=night, 1=mid。 */
  const [waterP, setWaterP] = useState(0);
  /* transP —— 灯球坠落压暗量(星场 + 标题粒子溶暗 + 基础天空压暗),0=满亮, 1=几乎无粒子(标题被盖住)。 */
  const [transP, setTransP] = useState(0);
  /* lit —— 灯球对水面的照度(0..1),点亮水下隐藏字。随灯球坠落点亮。 */
  const [lit, setLit] = useState(0);
  /* ballDrop —— 灯球坠落量(0=吊在顶, 1=落到底)。由专属时间线(顿挫/惯性/回弹)驱动,与 transP 解耦。 */
  const [ballDrop, setBallDrop] = useState(0);
  /* locked —— 标题被盖住(灯球坠落态):锁标题热区(不能爆开)。 */
  const [locked, setLocked] = useState(false);
  /* ballBusy —— 灯球坠落/回升**动画进行中**:禁用灯球按钮(防连点打架);落定/回到 act1 后可再点切换。 */
  const [ballBusy, setBallBusy] = useState(false);
  /* 点灯球 = 触发坠落(toggle):act1 点→坠落盖标题+浮字,已落定点→回升复原。函数在 useGSAP 闭包里赋进来;
   * reduced-motion 下不赋值 → 点球无反应。 */
  const dropRef = useRef<(() => void) | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // 状态放 plain object(闭包读最新值,避免 setState 异步):
        const pw = { water: 0 }; // 水面 night→mid 补间载体
        const pd = { trans: 0, lit: 0 }; // 压暗 + 照度补间载体
        const bp = { ball: 0 }; // 灯球坠落补间载体(专属时间线)
        const atMid = { v: false }; // 水面已在 mid
        const armed = { v: false }; // 到 mid 后「离开过顶部」→ 才允许滚回顶部重新上锁
        const dropped = { v: false }; // 灯球已落定
        const animW = { v: false }; // 水面补间中
        const animD = { v: false }; // 灯球坠落补间中

        // ── ① 下滑:水面 night→mid ──────────────────────────────────
        const tweenWater = (to: number, onDone: () => void) => {
          animW.v = true;
          gsap.to(pw, {
            water: to,
            duration: TRANSITION_S,
            ease: "power2.inOut",
            overwrite: true,
            onUpdate: () => setWaterP(pw.water),
            onComplete: () => {
              animW.v = false;
              onDone();
            },
          });
        };
        const goMidWater = () => {
          if (animW.v || atMid.v || dropped.v) return; // 灯球坠落态下不切场景(互斥)
          tweenWater(1, () => {
            atMid.v = true;
            armed.v = false;
          });
        };
        const goNightWater = () => {
          if (animW.v || !atMid.v) return;
          tweenWater(0, () => {
            atMid.v = false;
          });
        };

        // ── ② 点灯球:坠落 + 压暗 + 浮字(留 night 水面)───────────────
        const ballTl = gsap
          .timeline({ paused: true, onUpdate: () => setBallDrop(bp.ball) })
          .to(bp, { ball: -0.04, duration: 0.12, ease: "power2.out" }) // 起坠顿一下(微微上提蓄势)
          .to(bp, { ball: 1, duration: 0.72, ease: "bounce.out" }); // 惯性加速 + 落底回弹
        const tweenDrop = (trans: number, litTo: number, onDone: () => void) => {
          animD.v = true;
          setBallBusy(true); // 动画中禁用灯球按钮(防连点)
          gsap.to(pd, {
            trans,
            lit: litTo,
            duration: TRANSITION_S,
            ease: "power2.inOut",
            overwrite: true,
            onUpdate: () => {
              setTransP(pd.trans);
              setLit(pd.lit);
            },
            onComplete: () => {
              animD.v = false;
              setBallBusy(false);
              onDone();
            },
          });
        };
        const dropDown = () => {
          if (animD.v || dropped.v || atMid.v || animW.v) return; // 水面 mid/切换中 不响应点球(互斥)
          setLocked(true); // 标题被盖住 → 锁标题热区
          ballTl.play();
          tweenDrop(1, 1, () => {
            dropped.v = true;
          });
        };
        const dropUp = () => {
          if (animD.v || !dropped.v) return;
          ballTl.reverse(); // 灯球回升
          tweenDrop(0, 0, () => {
            dropped.v = false;
            setLocked(false); // 标题恢复 → 解锁热区
          });
        };
        /* 点灯球 = toggle:未落定→坠落盖标题+浮字;已落定→回升复原。动画进行中不响应。 */
        dropRef.current = () => {
          if (animD.v) return;
          if (!dropped.v) dropDown();
          else dropUp();
        };

        // 滚轮/触摸手势劫持:preventDefault 锁住原生滚动;deltaY>0(下滑)=onDown,deltaY<0(上滑)=onUp。
        const observer = Observer.create({
          target: window,
          type: "wheel,touch,pointer",
          tolerance: 10,
          preventDefault: true,
          onDown: () => {
            // 动画进行中(水面补间/灯球坠落)一律忽略 —— 否则反向动画途中下滑会误触发 disable(atMid 尚未翻)→ 死锁。
            if (dropped.v || animD.v || animW.v) return;
            if (!atMid.v) goMidWater();
            else observer.disable(); // 已**稳定**在 mid 顶部又下滑 → 松锁直达 Footer
          },
          onUp: () => {
            if (dropped.v || animD.v || animW.v) return;
            if (atMid.v) goNightWater();
          },
        });

        /* observer 被松锁(仅「mid 顶部下滑露 Footer」那次)后重新上锁:离开顶部(arm)再回顶部 → enable。
         * **只看 observer.isEnabled,不依赖 atMid** —— 松锁那刻 atMid=true、重锁后仍 true,解耦可避免
         * 「observer 已禁用而 atMid 已变 false」→ 永远无法重锁的死锁。 */
        const onScroll = () => {
          if (observer.isEnabled) return;
          if (window.scrollY > 60) armed.v = true;
          else if (armed.v) {
            observer.enable();
            armed.v = false;
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });

        return () => {
          observer.kill();
          ballTl.kill();
          window.removeEventListener("scroll", onScroll);
          dropRef.current = null;
        };
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="relative mx-[calc(50%-50vw)] w-screen flex-1">
      <div ref={stageRef} data-stage className="relative">
        {/* 下滑 → 水面 night→mid(waterP)+ 天空元素(星点/标题)消失;点球坠落 → 压暗盖标题 + 基础天空压暗 + 浮字。
            titleDim(元素消失)取两手势最大;baseSkyDim(基础天空压暗)只点球用 → mid 保留自然天空。 */}
        <SkyScreenScene
          waterScroll={waterP}
          titleDim={Math.max(transP, waterP)}
          baseSkyDim={transP}
          orbLit={lit}
          locked={locked}
        />

        {/* 吊在夜空的迪斯科灯球(无星环/光晕)。**点它 = 触发坠落**(盖标题 + 浮出水下字);已落定再点 → 回升。
            下滑到 mid 时灯球作为「其他元素」随 waterP 淡出消失(与点球坠落互斥)。
            外层 pointer-events-none 让点击落到 sky-screen 热区,只有灯球本身可点(动画中/水面已切场景时禁用)。 */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-[6] -translate-x-1/2"
          style={{ opacity: 1 - waterP }}
        >
          <div className="flex flex-col items-center">
            <div
              className="w-px"
              style={{
                /* 吊线长度随坠落量;夹 height≥0(起坠 ball<0 的上提蓄势保留 → 灯球先微微上抬再落)。 */
                height: `${Math.max(0, 2.5 + ballDrop * DROP_VH).toFixed(2)}vh`,
                backgroundColor: "var(--water-paper)",
                opacity: 0.5,
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!ballBusy && waterP < 0.001) dropRef.current?.();
              }}
              disabled={ballBusy || waterP > 0.001}
              aria-label="灯球坠落 / 回升"
              className="pointer-events-auto cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-default"
            >
              <DiscoBall size={90} glow={0} showRing={false} spinDuration={9} />
            </button>
          </div>
        </div>
      </div>

      {/* 自定义光标环:仅舞台内接管(舞台外导航保留原生光标)。 */}
      <CursorRing stageRef={stageRef} />
    </div>
  );
}
