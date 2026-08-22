import type { ReactNode } from "react";

/**
 * TitleContent —— 主标题「welcome T[O] carryKit」的可视内文(aria-hidden)。
 *
 * 同一份排版被两层复用(见 disco-hero):
 *   · 标题层  —— fill=前景色,O 槽放真·灯球;
 *   · 底片层  —— fill/描边=背景色,O 槽放背景色圆盘,叠在字幕之上、标题之下,
 *               按「字形 + 描边 halo」在背景播报字幕上挖出干净字形轮廓。
 * 两层用同一份 markup + CSS grid 叠放 → 像素级重合,遮罩天然贴合字形(无需测量)。
 *
 * oSlot:字母 O 的占位。两层必须传入「盒尺寸一致」的元素(0.78em 方盒),
 * 否则文字排布错位、两层不再重合。
 */
export function TitleContent({ oSlot }: { oSlot: ReactNode }) {
  return (
    // 单行不换行:等比放大用 font-size(真实占位),靠 nowrap 保证一行
    <span className="flex flex-nowrap items-center justify-center gap-x-[0.16em] whitespace-nowrap">
      {/* Welcome:W 大写、elcome 小写 scaleY 拉高顶到大写字高 */}
      <span className="inline-block [font-size:calc(1em*var(--hero-stretch))]">
        <span className="inline-block">W</span>
        <span className="inline-block origin-bottom [transform:scaleY(var(--hero-lc))]">
          elcome
        </span>
      </span>
      {/* T + 灯球 O(叙事母题 & 本组高度基准),保持大写 */}
      <span className="flex items-center gap-x-[0.04em] [font-size:calc(1em*var(--hero-stretch))]">
        <span className="inline-block">T</span>
        {oSlot}
      </span>
      {/* carryKit:carry / it 小写拉高,K 大写 */}
      <span className="inline-block [font-size:calc(1em*var(--hero-stretch))]">
        <span className="inline-block origin-bottom [transform:scaleY(var(--hero-lc))]">
          carry
        </span>
        K
        <span className="inline-block origin-bottom [transform:scaleY(var(--hero-lc))]">
          it
        </span>
      </span>
    </span>
  );
}
