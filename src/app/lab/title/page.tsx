"use client";

import { useState, type CSSProperties } from "react";
import { DiscoBall } from "@/components/home/disco-ball";
import { GlyphCarousel } from "@/components/home/glyph-carousel";

/**
 * /lab/title —— 主页标题「Welcome T[O] / CarryKit」排版调参台(不在站点导航)。
 *
 * 左上面板实时调 Welcome T 的**字号 / 左侧间距 / 字间距**、**灯球大小**、整行高度与
 * **标点轮播速度**。灯球 O 与 "Welcome T" 内联相连读成 "Welcome TO",球右侧
 * ":"/">"/"?" 轮播 SVG 平衡视觉重心。面板底部读出各值,调顺眼后抄回 title-figure.tsx。
 */
export default function TitleLabPage() {
  const [fontSize, setFontSize] = useState(0.5); // em(整组相对主字号 clamp)
  const [leftPad, setLeftPad] = useState(4); // vw(整组左偏移)
  const [letter, setLetter] = useState(0.12); // em(Welcome T 字距)
  const [ballSize, setBallSize] = useState(0.74); // em(相对组内字号)
  const [top, setTop] = useState(14); // vh
  const [gap, setGap] = useState(0.18); // em(球与两侧元素间距)
  const [hold, setHold] = useState(1.6); // s(标点每字停留)

  const row = (
    label: string,
    value: number,
    setValue: (v: number) => void,
    min: number,
    max: number,
    step: number,
    unit: string,
  ) => (
    <label key={label} style={rowStyle}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(parseFloat(e.target.value))}
      />
      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
        {value.toFixed(2)}
        {unit}
      </span>
    </label>
  );

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden", background: "var(--background)" }}>
      {/* 标题舞台:与 disco-hero 同字体/字号基准 */}
      <div
        className="absolute inset-0 font-title font-normal leading-[0.92] tracking-[0.02em] text-[clamp(3.5rem,16vw,14rem)]"
        style={{ color: "var(--foreground)" }}
      >
        {/* Welcome T[O] + 轮播标点:一行相连;字号 / 左间距 / 字间距 / 球大小可调 */}
        <div
          aria-hidden
          className="absolute flex -translate-y-1/2 items-center whitespace-nowrap"
          style={{ left: `${leftPad}vw`, top: `${top}vh`, fontSize: `${fontSize}em`, gap: `${gap}em` }}
        >
          <span className="font-display" style={{ letterSpacing: `${letter}em` }}>Welcome T</span>
          <DiscoBall
            size={`${ballSize}em`}
            spinDuration={7}
            ringDuration={14}
            glow={1}
          />
          <GlyphCarousel hold={hold} style={{ height: "0.72em", width: "0.44em" }} />
        </div>

        {/* CarryKit:屏幕正中(不参与调参,作对照) */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 italic underline decoration-[0.02em] underline-offset-[0.08em]"
        >
          CarryKit
        </span>
      </div>

      {/* 调参面板 */}
      <div style={panelStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          {row("字号", fontSize, setFontSize, 0.25, 1.2, 0.01, "em")}
          {row("左间距", leftPad, setLeftPad, 0, 40, 0.5, "vw")}
          {row("字间距", letter, setLetter, 0, 0.8, 0.01, "em")}
          {row("球大小", ballSize, setBallSize, 0.2, 1.5, 0.01, "em")}
          {row("球间距", gap, setGap, 0, 0.6, 0.01, "em")}
          {row("行高度", top, setTop, 0, 100, 1, "vh")}
          {row("标点速度", hold, setHold, 0.4, 4, 0.1, "s")}
        </div>
        <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.15)", margin: "10px 0" }} />
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", opacity: 0.85 }}>
{`组 Welcome T[O]?
  left: ${leftPad}vw   top: ${top}vh
  fontSize: ${fontSize.toFixed(2)}em
  letterSpacing: ${letter.toFixed(2)}em
灯球 O  size: ${ballSize.toFixed(2)}em   gap: ${gap.toFixed(2)}em
标点   hold: ${hold.toFixed(1)}s`}
        </pre>
      </div>
    </main>
  );
}

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "3rem 1fr 3.5rem",
  gap: 8,
  alignItems: "center",
};

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  padding: "14px 16px",
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  font: "12px/1.5 ui-monospace, monospace",
  borderRadius: 8,
  backdropFilter: "blur(6px)",
  width: 300,
  userSelect: "none",
};
