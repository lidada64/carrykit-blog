"use client";

import { SceneNav } from "./scene-nav";

/**
 * HomeScene —— /lab/home 极简 Hero 的**递归自相似单元**(复刻 Figma "page")。
 *
 * 自相似做法(方案 A):根元素声明 [container-type:size],所有位置用 %、所有
 * 尺寸/字号用 cqw/cqh(相对容器自身)。嵌套一个**比例 0.55** 尺寸(55cqw ×
 * 55cqh)的自身 → 内层 cqw 自动解析为父级 0.55,每层无需逐层调参、文字真实渲染不糊。
 * 嵌套居中向**屏幕正中心**汇聚(不动点 50% / 50%),层层往后叠 + 逐层淡出。
 *
 * - 篝火(灰星)只在最外层 depth 0(showCampfire 不向下递归)。当前灰色占位,预留 slot;
 *   日后一行替换为 <CampfireDither>。
 * - 灯球(orb)**不在本组件内**:它需「不随嵌套/收缩动画移动」,故与篝火同样脱离缩放帧,
 *   改由 HomeCollapse 挂在 stage 覆盖层常驻原位、段1 末尾单独「吊起升出」(见 home-collapse.tsx)。
 * - nav 栏**暂不嵌套**:仅最外层 depth 0 渲染(嵌套层不出 nav)。
 * - 嵌套副本(depth>0)pointer-events-none + aria-hidden,不可点、不被读屏重复朗读。
 */
export interface HomeSceneProps {
  depth: number;
  /** 是否渲染篝火(灰星)——仅最外层传 true,不向下递归 */
  showCampfire?: boolean;
  /** 递归收口层数;默认 6(第 6 层不再套娃,自然收口为纯 hero)。 */
  maxDepth?: number;
}

// 五角星裁剪路径(篝火锚点占位)。导出供 HomeCollapse 的独立星标复用(篝火脱离缩放)。
export const STAR_CLIP =
  "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";

/** wordmark 逐层竖向错位:本层竖向锚点(容器局部 %)= BASE − depth·STEP。都是手感旋钮。
 *  BASE=61.8 = **下黄金线**(在收缩中心/不动点 50% 的**下方**):depth 0 的 CarryKit 落在这条线、
 *  最前最大;收缩中心 = **屏幕正中 50%**,越深的层靠**自然嵌套汇聚**逐级往上收进正中心。
 *  STEP=0 → 不额外手动偏移(自然汇聚已给「越深越往上」);>0 可再把深层手动往上推。
 *  注:HomeCollapse 的水印(承接 depth 0 的 wordmark)须与 depth 0 的值(=BASE)对齐。 */
export const WORDMARK_TOP_BASE = 61.8; // depth 0(最靠前)——下黄金线,正中心下方
const WORDMARK_TOP_STEP = 0; // 逐层手动上移的百分点(0=纯靠自然汇聚)
export const wordmarkTopPct = (depth: number) => WORDMARK_TOP_BASE - depth * WORDMARK_TOP_STEP;

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
      {/* 顶部导航:**暂不嵌套**——仅最外层 depth 0 渲染(嵌套副本不再出 nav)。 */}
      {!inner && <SceneNav interactive />}

      {/* 灯球(orb)已移出本组件 → HomeCollapse 的 stage 覆盖层(脱离缩放、不随嵌套动画移动)。 */}

      {/* 主 wordmark:**水平居中**、大号斜体。字体同现有主页标题(font-title=IM Fell
          English SC,italic),与站点保持一致;scale-y 适度竖向拉长;选中高亮。
          z-[1] 置于本层嵌套卡之上 → **外层字体不透明**,内层 wordmark 随嵌套卡 opacity 复合渐隐。 */}
      <span
        data-key="wordmark"
        style={{ top: `${wordmarkTopPct(depth)}%` }}
        className="absolute left-1/2 z-[1] origin-center -translate-x-1/2 -translate-y-1/2 scale-y-[1.25] whitespace-nowrap font-title text-[11cqw] font-normal italic leading-none tracking-[0.02em] text-foreground transition-colors duration-200 group-data-[hk=wordmark]/frame:text-accent"
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

      {/* 自嵌套卡片:**比例 0.55** 尺寸,居中定位 → 向**屏幕正中心不动点(50%/50%)**汇聚。
          比例越小 = 每层递缩步幅越大 = 层数密度越低(隧道更疏、后退更快)。
          opacity-[0.7]:每层不透明度沿嵌套复合递减(depth d ≈ 0.7^d)→ 越往后越快淡向背景。
          不传 showCampfire → 篝火天然不下传。
          注:不加边框——收缩时卡放大 1/0.55×、逐层复合,任何 border 都会被同步放大成
          越往里越粗、在不动点堆成"灰疙瘩";无框才能让各层无缝重合。 */}
      {hasNested && (
        <div
          data-nested
          className="absolute left-[22.5%] top-[22.5%] h-[55cqh] w-[55cqw] overflow-hidden opacity-[0.7]"
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
