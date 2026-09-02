import { type CSSProperties } from "react";

/**
 * GlyphCarousel —— 竖向轮播 ":" → ">" → "?" 的纯 SVG 动画(SMIL translate)。
 *
 * 用作主标题灯球右侧的「跳动标点」:每字停留片刻后快速上滑到下一字,末尾补一个
 * 首字实现无缝循环。作用是平衡 "Welcome T[O]" 左重的视觉重心。
 *
 * fill=currentColor 跟随主题前景色;字体固定用**次级字体** Anton SC(font-broadcast,
 * 区别于标题衬线);尺寸交给外部 className/style(用 em 即随标题字号等比缩放)。
 * 纯展示,aria-hidden。
 */
const GLYPHS = [":", ">", "?"];

export interface GlyphCarouselProps {
  /** 每字停留 + 切换的时长(秒);整轮 = hold × 字数。默认 1.6 */
  hold?: number;
  className?: string;
  style?: CSSProperties;
}

export function GlyphCarousel({ hold = 1.6, className, style }: GlyphCarouselProps) {
  const slot = 100; // 每字槽位高(user units)
  const n = GLYPHS.length;
  const strip = [...GLYPHS, GLYPHS[0]]; // 末尾补首字 → 循环无缝
  const dur = hold * n;

  // keyTimes/values:每字停留大部分时间,段末 slidePortion 比例内快速滑到下一字。
  const slidePortion = 0.18;
  const times: number[] = [];
  const values: string[] = [];
  for (let i = 0; i <= n; i++) {
    times.push(i / n);
    values.push(`0 ${-slot * i}`);
    if (i < n) {
      times.push((i + 1 - slidePortion) / n);
      values.push(`0 ${-slot * i}`);
    }
  }

  return (
    <svg
      viewBox={`0 0 60 ${slot}`}
      className={["font-broadcast", className].filter(Boolean).join(" ")}
      style={{ display: "block", overflow: "hidden", ...style }}
      aria-hidden
    >
      <g>
        {strip.map((g, i) => (
          <text
            key={i}
            x="30"
            y={slot * i + slot * 0.72}
            textAnchor="middle"
            fill="currentColor"
            fontSize={slot * 0.9}
          >
            {g}
          </text>
        ))}
        <animateTransform
          attributeName="transform"
          type="translate"
          calcMode="linear"
          dur={`${dur}s`}
          repeatCount="indefinite"
          keyTimes={times.join(";")}
          values={values.join(";")}
        />
      </g>
    </svg>
  );
}
