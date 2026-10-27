"use client";

import { useEffect, useState } from "react";
import { WaterScene } from "@/components/lab/water/water-scene";
import type { WaterDirectorFlags } from "@/components/lab/water/water-director";
import type { WaterPresetName } from "@/components/lab/water/water-director";

/* ── /lab/water-text —— 水下隐藏字模「有没有图层缝」验证台 ──────────────────
 *  只验证 idea/灯球彩蛋.md 的**成败点**:字模在灯球照度里显形时,是不是水面着色
 *  本身的一部分(参与同一套菲涅耳 + tonemap + 1-bit 抖动、按世界坐标平躺、墨点与
 *  水波同源),而不是叠了一层图。灯球坠落/拖拽揭示/退出等交互**本卡不做**。
 *
 *  字走**乘法调制**(不是加法):光斑先把水照到 tonemap 过渡带,字笔画处 body×dark 压成
 *  暗墨 —— 加法在饱和白上零收益,乘法能在发光水面上写墨(idea/灯球彩蛋.md 七)。
 *
 *  默认(无 query)= mid 端发光前景 + 聚焦光池 + 暗墨字,直接可读。调参靠 **URL query**:
 *    ?preset=mid|night|near   默认 mid(乘法主场;想看 night 首页场景传 preset=night)
 *    &scroll=0..1             滚动端(night→mid);mid 默认 1、其余默认 0
 *    &dark=<uOrbTextDark>     字笔画 body 乘数,默认 0.34(<1 暗墨 / >1 亮字)
 *    &lit=<uOrbTextLit>       照度显形阈值,默认 0.04
 *    &pool=<uOrbPoolGain>     聚焦光池增益,默认 0.26   &poolR=<半径 m> 默认 12
 *    &rect=minX,minY,sizeX,sizeY   字铺的场坐标矩形(米),默认按 preset 给
 *    &gain=0|1                字项开关(默认 1);&body / &energy / &t=<秒>|live
 *    &dbg=1                   绕过照度直出字模 + 左上角贴字模贴图(确诊绑定/透视/缝)
 *
 *  canvas 默认吃指针,orbDrag 开着 → 可**手动拖灯球**让光池扫过整句。 */

const TEXT = "CarryKit is not just CarryKit";

/** 各 preset 的字模默认铺法(场坐标矩形,米)。透视/可见水面差很多,一套不通用。 */
const DEFAULT_RECT: Record<WaterPresetName, readonly [number, number, number, number]> = {
  // mid(验证台默认):相机 1.6 m、水面占满、透视缓。字铺前景发光水面,乘法压成暗墨,清晰可读
  mid: [-13, 5, 26, 6],
  // night:抬头构图,可见水面挤在地平线下 —— 字铺 y_field 26~40 横贯 50 m,投在画面下缘那条水带
  night: [-25, 26, 50, 14],
  near: [-3, 1.2, 6, 2],
};

const FLAGS: Partial<WaterDirectorFlags> = {
  pointerRipple: false, // 不下雨,专心看字
  clickImpulse: false,
  orbDrag: true, // 允许拖灯球扫光池
};

/** 画一张 R=字覆盖度的字模贴图 → dataURL。白字黑底,shader 取 .r。 */
function drawTextAtlas(): string {
  const w = 1536;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 先按基准字号量宽,再缩放到铺满 94% 宽 —— 字体加载后度量才准。
  let fs = 200;
  ctx.font = `italic ${fs}px "IM Fell English SC", Georgia, serif`;
  const measured = ctx.measureText(TEXT).width || w;
  fs = Math.max(24, Math.floor((fs * w * 0.94) / measured));
  ctx.font = `italic ${fs}px "IM Fell English SC", Georgia, serif`;
  ctx.fillStyle = "#fff";
  ctx.fillText(TEXT, w / 2, h / 2);
  return c.toDataURL();
}

interface Cfg {
  preset: WaterPresetName;
  scroll: number;
  gain: number;
  rect: readonly [number, number, number, number];
  overrides: Record<string, number>;
  energy: number;
  timeOverride: number | null;
}

function readCfg(): Cfg {
  const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  // 验证台默认 mid:乘法方案在 mid 发光前景上把字压成暗墨,最清晰。想看 night 首页场景传 preset=night。
  const preset = ((): WaterPresetName => {
    const p = q.get("preset");
    return p === "mid" || p === "near" || p === "night" ? p : "mid";
  })();
  const num = (k: string, d: number): number => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && q.get(k) !== null ? v : d;
  };
  const gain = num("gain", 1); // 乘法方案下 gain 只当开关(>0 即开);强度由 dark/lit 控制
  const rect = ((): readonly [number, number, number, number] => {
    const raw = q.get("rect");
    if (raw) {
      const parts = raw.split(",").map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        return [parts[0], parts[1], parts[2], parts[3]] as const;
      }
    }
    return DEFAULT_RECT[preset];
  })();
  const overrides: Record<string, number> = { uOrbTextGain: gain };
  if (q.get("dbg") === "1") overrides.uOrbTextDebug = 1; // 纯看字模世界铺开(绕过照度/分层)
  /* 每 preset 一套「模拟坠落后手电光斑 + 暗墨字」的默认参数(透视/水面差很多,一套不通用):
   * · mid  —— 俯视、水面占满,聚焦白光斑 + dark 0.34,字立得起来最清楚;
   * · night —— 首页场景,平视、水面挤在地平线下。光池往近景大范围铺(near/far 3、poolR 48)
   *   把整片可见水照成白,字压成暗墨浮在上面 —— 平视下字必然朝地平线压扁(物理真实)。 */
  const TUNE: Record<WaterPresetName, { pool: number; poolR: number; near: number; far: number; dark: number; lit: number }> = {
    mid: { pool: 0.26, poolR: 12, near: 0.55, far: 2.6, dark: 0.34, lit: 0.04 },
    night: { pool: 0.4, poolR: 48, near: 3.0, far: 3.0, dark: 0.24, lit: 0.05 },
    near: { pool: 0.26, poolR: 12, near: 0.55, far: 2.6, dark: 0.34, lit: 0.04 },
  };
  const tune = TUNE[preset];
  overrides.uOrbTextDark = num("dark", tune.dark); // <1 暗墨字 / >1 亮字
  overrides.uOrbTextLit = num("lit", tune.lit); // 照度显形阈值
  overrides.uOrbPoolGain = num("pool", tune.pool);
  overrides.uOrbPoolRadius = num("poolR", tune.poolR);
  overrides.uOrbPoolNear = num("near", tune.near); // near 拉大 → 光池往近景铺
  overrides.uOrbPoolFar = num("far", tune.far);
  if (q.get("flat") !== null) overrides.uOrbPoolFlat = num("flat", 0.35);
  if (q.get("body") !== null) overrides.uOrbBodyGain = num("body", 6);
  const tRaw = q.get("t");
  const timeOverride = tRaw === "live" ? null : tRaw !== null ? num("t", 2.5) : 2.5;
  /* 滚动映射是 night→mid:scroll=0 是 night 端,scroll=1 是 mid 端。
   * 默认 mid 场地要 scroll=1(否则停在 night 端渲染),其余 preset 默认 0。 */
  const scroll = Math.min(1, Math.max(0, num("scroll", preset === "mid" ? 1 : 0)));
  return { preset, scroll, gain, rect, overrides, energy: num("energy", 1), timeOverride };
}

export function WaterTextProbe() {
  const [textUrl, setTextUrl] = useState<string | null>(null);
  // lazy init 读 query(SSR window 未定义时 readCfg 走默认分支)。canvas 不进 SSR DOM,无 hydration 风险。
  const [cfg] = useState<Cfg>(() => readCfg());

  useEffect(() => {
    let cancelled = false;
    const build = () => {
      if (!cancelled) setTextUrl(drawTextAtlas());
    };
    build(); // 立即画一次(fallback 字体也够验证);fonts.ready 在 headless 可能不 resolve,不能只等它
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(() => !cancelled && build()); // 字体到位后重画一次(度量更准)
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative h-svh overflow-hidden bg-background">
      {/* 无障碍:真句子给读屏。 */}
      <p className="sr-only">Hidden: {TEXT}</p>

      <WaterScene
        className="absolute inset-0 z-0 h-full w-full"
        preset={cfg.preset}
        scroll={cfg.scroll}
        orbEnergy={cfg.energy}
        focus={0}
        orbX={0}
        orbSpin={0}
        lightMode={0}
        quantize
        moonHalo={0}
        overrides={cfg.overrides}
        flags={FLAGS}
        timeOverride={cfg.timeOverride}
        forceReducedMotion={false}
        textAtlasUrl={textUrl}
        textRect={cfg.rect}
      />

      {/* ?dbg=1:左上角贴出字模贴图本身,独立确诊 dataURL 生成(与 shader 绑定无关)。
          textUrl 未就绪时**不渲染** <img> —— 空 src 会触发 broken image 请求。 */}
      {cfg.overrides.uOrbTextDebug && textUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={textUrl}
          alt="atlas"
          className="absolute left-2 top-2 z-10 w-80 border border-white/40 bg-black/60"
        />
      ) : null}
    </section>
  );
}
