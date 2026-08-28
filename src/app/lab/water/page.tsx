"use client";

import { useState } from "react";
import { WaterDither, type WaterDitherParams } from "@/components/lab/water-dither";
import { CampfireDither } from "@/components/lab/campfire-dither";

/**
 * /lab/water —— 奥伯拉丁抖动流水 + 独立篝火 shader 原型预览页(不在站点导航内)。
 *
 * 水面是背景;篝火是**独立物件**叠在最下方中央。左上面板实时调水面参数,
 * Act I / Act II 预设演示「分幕」(入场暗·静 ↔ 叙事亮·流动)。移动鼠标激涟漪。
 */

const ACT_I: WaterDitherParams = { speed: 0.35, cell: 3, brightness: 0.7, contrast: 1.35, glint: 0.6, warp: 0.8, flowBend: 0.7, angle: 0, calmTop: 0 };
const ACT_II: WaterDitherParams = { speed: 1.4, cell: 3, brightness: 1.02, contrast: 1.2, glint: 1.1, warp: 1, flowBend: 1, angle: 0, calmTop: 0 };

export default function WaterLabPage() {
  const [p, setP] = useState<WaterDitherParams>(ACT_II);
  const [fire, setFire] = useState(0.5);
  const [showFire, setShowFire] = useState(true);

  const set = (k: keyof WaterDitherParams) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP((prev) => ({ ...prev, [k]: parseFloat(e.target.value) }));

  const row = (label: string, k: keyof WaterDitherParams, min: number, max: number, step: number) => (
    <label style={rowStyle}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={p[k]} onChange={set(k)} />
      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{p[k].toFixed(2)}</span>
    </label>
  );

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#000" }}>
      {/* 背景:流水 */}
      <WaterDither {...p} className="block h-full w-full" />

      {/* 独立物件:篝火,叠在最下方中央 */}
      {showFire && (
        <CampfireDither
          intensity={fire}
          className="pointer-events-none absolute bottom-0 left-1/2 h-[42vh] w-[26vw] min-w-[220px] -translate-x-1/2"
        />
      )}

      <div style={panelStyle}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button type="button" onClick={() => setP(ACT_I)} style={btn}>Act I 入场(暗·静)</button>
          <button type="button" onClick={() => setP(ACT_II)} style={btn}>Act II 叙事(亮·流)</button>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {row("流速", "speed", 0, 3, 0.05)}
          {row("网点", "cell", 1, 8, 0.5)}
          {row("亮度", "brightness", 0.4, 1.6, 0.05)}
          {row("对比", "contrast", 0.6, 2, 0.05)}
          {row("高光", "glint", 0, 2, 0.05)}
          {row("扭曲", "warp", 0, 2.5, 0.05)}
          {row("流扰", "flowBend", 0, 2.5, 0.05)}
          {row("流向", "angle", 0, 180, 1)}
          {row("静止顶", "calmTop", 0, 240, 4)}
        </div>
        <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.15)", margin: "10px 0" }} />
        <label style={rowStyle}>
          <span>篝火</span>
          <input type="range" min={0} max={1} step={0.05} value={fire} onChange={(e) => setFire(parseFloat(e.target.value))} />
          <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{fire.toFixed(2)}</span>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <input type="checkbox" checked={showFire} onChange={(e) => setShowFire(e.target.checked)} />
          <span>显示篝火(独立物件)</span>
        </label>
        <p style={{ marginTop: 10, opacity: 0.6 }}>移动鼠标激起涟漪</p>
      </div>
    </main>
  );
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "3.5rem 1fr 2.5rem",
  gap: 8,
  alignItems: "center",
};

const panelStyle: React.CSSProperties = {
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

const btn: React.CSSProperties = {
  flex: 1,
  padding: "6px 8px",
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 6,
  color: "#fff",
  font: "11px/1.2 ui-monospace, monospace",
  cursor: "pointer",
};
