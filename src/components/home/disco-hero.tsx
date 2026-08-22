"use client";

import { type CSSProperties } from "react";
import { BroadcastWall } from "./broadcast-wall";
import { DiscoBall } from "./disco-ball";
import { TitleContent } from "./title-content";

/**
 * DiscoHero —— 主页迪斯科灯球叙事段(docs/homepage-animation-plan.md)。
 *
 * Phase 0(当前):静态呈现 HR-4 终态排版 —— "welcome T[O] carrykit",
 * 灯球充当字母 O、持续自转 + 斜星环,用于实时预览最终观感。
 *
 * 背景字幕的「标题清空」= 底片挖空法(无需测量,替代旧 use-title-envelope 梯形):
 *   把标题排版复制一份作「底片层」——fill/描边都用背景色,叠在字幕之上、标题之下。
 *   底片按「字形 + 描边 halo」用背景色盖住字幕,于是字幕精确贴着字形边缘消失;
 *   标题层(前景色)再叠在最上。两层同源 markup + grid 叠放 → 像素级贴合、天然响应式。
 */
export function DiscoHero() {
  return (
    <section
      // full-bleed:冲破 layout.tsx 的 max-w-[1120px] 容器,撑满整屏宽
      className="relative mx-[calc(50%-50vw)] flex min-h-svh w-screen flex-col items-center justify-center px-6 py-16"
    >
      {/* HR-BG 背景播报层:密集平铺 + 隔行反向横滚,垫在标题之后(z-0) */}
      <BroadcastWall />
      <h1
        // grid 叠放:底片层与标题层同格重合([&>*] 全部落在 col/row 1)。
        // z-10 整体盖在字幕之上;底片层(背景色)负责在字幕上挖出字形。
        className="relative z-10 grid place-items-center text-center font-display leading-[0.92] tracking-[0.04em] [&>*]:col-start-1 [&>*]:row-start-1"
        style={
          {
            fontSize: "clamp(1.6rem, 6.6vw, 7rem)",
            "--hero-stretch": "1.6", // welcome/carrykit 与 TO 等比同高
            "--hero-lc": "1.5", // 小写纵向拉高顶到大写字高
            "--halo": "0.1em", // 字形外扩光晕宽度(底片描边);越大字幕离字越远
          } as CSSProperties
        }
      >
        {/* 无障碍:完整读作 "welcome to carrykit";视觉里 O 由灯球充当。
            absolute(sr-only)不占 grid 轨道,不影响两层重合 */}
        <span className="sr-only">welcome to carrykit</span>

        {/* 底片层:fill/描边=背景色 → 在字幕上按字形 + halo 挖空。
            -webkit-text-stroke 把字形向外扩一圈,fill 同为背景色 → 字形被背景色实心盖住,
            外扩 halo 给字幕留出干净边距。aria-hidden 纯装饰。 */}
        <span
          aria-hidden
          className="[color:var(--background)] [-webkit-text-stroke:var(--halo)_var(--background)]"
        >
          <TitleContent
            oSlot={
              // O 槽:0.78em 方盒保持与标题层同布局;内叠一枚更大的背景色圆盘,
              // 盖住灯球 glow/星环(156%)后方的字幕。absolute 溢出不影响文字排布。
              <span className="relative inline-block h-[0.78em] w-[0.78em] shrink-0">
                <span className="absolute left-1/2 top-1/2 h-[1.7em] w-[1.7em] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--background)]" />
              </span>
            }
          />
        </span>

        {/* 标题层:前景色实字,叠在底片之上。O 槽 = 真·灯球 */}
        <span aria-hidden className="relative [color:var(--foreground)]">
          <TitleContent
            oSlot={
              <DiscoBall
                size="0.78em"
                spinDuration={7}
                ringDuration={14}
                glow={1}
                className="shrink-0"
              />
            }
          />
        </span>
      </h1>
    </section>
  );
}
