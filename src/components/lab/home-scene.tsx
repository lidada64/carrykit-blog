"use client";

import { SceneNav } from "./scene-nav";

/**
 * HomeScene —— /lab/home 极简 Hero 的**递归自相似单元**(复刻 Figma "page")。
 *
 * 自相似做法(方案 A):根元素声明 [container-type:size],所有位置用 %、所有
 * 尺寸/字号用 cqw/cqh(相对容器自身)。右下角嵌套一个 1/3 尺寸(33.333cqw ×
 * 33.333cqh,仍为 16:9)的自身 → 内层 cqw 自动解析为父级 1/3,每层无需逐层调参、
 * 文字真实渲染不糊。层层嵌套呈"画中画/无限自嵌套"。
 *
 * - 篝火(灰星)只在最外层:showCampfire 不向下传 → 天然只在 depth 0 出现。
 * - 灯球(灰圆)/篝火(灰星)当前为灰色占位,预留 slot;日后一行替换为
 *   <DiscoBall>(CSS→Blender)/ <CampfireDither>,且只在 depth 0 挂真实动画组件。
 * - 嵌套副本(depth>0)pointer-events-none + aria-hidden,不可点、不被读屏重复朗读。
 */
export interface HomeSceneProps {
  depth: number;
  /** 是否渲染篝火(灰星)——仅最外层传 true,不向下递归 */
  showCampfire?: boolean;
  /** 递归收口层数;默认 6(第 6 层约 1/729 帧,观感"无限",供收缩前滚的深隧道) */
  maxDepth?: number;
}

// 五角星裁剪路径(篝火锚点占位)。导出供 HomeCollapse 的独立星标复用(篝火脱离缩放)。
export const STAR_CLIP =
  "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";

export function HomeScene({ depth, showCampfire = false, maxDepth = 6 }: HomeSceneProps) {
  const inner = depth > 0;
  const hasNested = depth < maxDepth;

  return (
    <div
      className={[
        "relative h-full w-full select-none overflow-hidden bg-background text-foreground [container-type:size]",
        // 嵌套内容先规定为不可选取/不可交互(后续再加"靠近坍缩成黑洞"效果)
        inner && "pointer-events-none",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={inner || undefined}
    >
      {/* 顶部导航:仅最外层可交互 */}
      <SceneNav interactive={!inner} />

      {/* 灰圆 —— disco 灯球锚点占位。中上偏center。选中(镜像)时反色。
          data-key 供顶层命中检测;group-data 变体让每层同 key 元素同步高亮。
          日后替换:<DiscoBall size="7.6cqw" ... /> (仅 depth 0 挂真实组件) */}
      <div
        data-key="orb"
        className="absolute left-1/2 top-[19.5%] h-[7.6cqw] w-[7.6cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted transition-colors duration-200 group-data-[hk=orb]/frame:bg-foreground"
      />

      {/* 主 wordmark:左偏中、大号斜体。字体同现有主页标题(font-title=IM Fell
          English SC,italic),与站点保持一致;scale-y 适度竖向拉长;选中高亮 */}
      <span
        data-key="wordmark"
        className="absolute left-[11%] top-[43.6%] origin-center -translate-y-1/2 scale-y-[1.25] whitespace-nowrap font-title text-[8.5cqw] font-normal italic leading-none tracking-[0.02em] text-foreground transition-colors duration-200 group-data-[hk=wordmark]/frame:text-accent"
      >
        CarryKit.
      </span>

      {/* 灰星 —— 篝火锚点占位,底部居中,仅最外层。选中反色。
          日后替换:<CampfireDither ... /> (仅 depth 0) */}
      {showCampfire && (
        <div
          data-key="star"
          className="absolute left-1/2 top-[91%] h-[3.2cqw] w-[3.2cqw] -translate-x-1/2 -translate-y-1/2 bg-muted transition-colors duration-200 group-data-[hk=star]/frame:bg-foreground"
          style={{ clipPath: STAR_CLIP }}
        />
      )}

      {/* 右下角自嵌套卡片:1/3 尺寸(仍 16:9),内部递归同一场景。当前不可直接选取。
          不传 showCampfire → 篝火天然不下传。描边用 cq 单位以随层缩放。 */}
      {hasNested && (
        <div
          data-nested
          className="absolute left-[58.75%] top-[54.9%] h-[33.333cqh] w-[33.333cqw] overflow-hidden border-[0.1cqw] border-border"
        >
          <HomeScene depth={depth + 1} maxDepth={maxDepth} />
        </div>
      )}

      {/* 递归镜像光标:每层一个环,读 frame 继承的 --cx/--cy 按本层容器定位 →
          等比出现在每层嵌套里。尺寸/描边用 cqw 随层缩小;命中可选元素(frame 有
          data-hk)时放大;鼠标离场(data-active≠1)时隐藏。 */}
      <div
        aria-hidden
        style={{ left: "calc(var(--cx, 0.5) * 100%)", top: "calc(var(--cy, 0.5) * 100%)" }}
        className="pointer-events-none absolute z-10 h-[1.6cqw] w-[1.6cqw] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.12cqw] border-foreground opacity-0 transition-[width,height,opacity] duration-200 ease-out group-data-[active=1]/frame:opacity-100 group-data-[hk]/frame:h-[2.6cqw] group-data-[hk]/frame:w-[2.6cqw]"
      />
    </div>
  );
}
