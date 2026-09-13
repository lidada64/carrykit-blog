"use client";

import { WORDMARK_TOP_BASE } from "./home-scene";

/**
 * MidScene —— night 页面瀑布式上浮离场后**承接的 mid 场景**(占位骨架)。
 *
 * 目前只是最小骨架:一个 [container-type:size] 容器 + 居中 wordmark 占位
 * (与 HomeScene 同字体/位置基准),坐在后景 mid 水面之上、night 帧之下(z-[1])。
 * 由 HomeCollapse 的时间线在段3(整帧上浮)同窗口把它从 autoAlpha 0 淡入到位,
 * 做到「night 离场 → mid 自然承接」。
 *
 * TODO:填真实 mid 内容(标题/导航/正文/UI)。预留下面的 slot 区。
 * 覆盖层不接指针(pointer-events-none):真站点若要交互再放开对应子节点。
 */
export function MidScene() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-foreground">
      <div className="relative h-full w-full [container-type:size]">
        {/* mid wordmark 占位:与 HomeScene 同位置基准(WORDMARK_TOP_BASE)/字体,风格一致。
            日后替换为 mid 场景的真实标题/内容。 */}
        <span
          style={{ top: `${WORDMARK_TOP_BASE}%` }}
          className="absolute left-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-y-[1.25] whitespace-nowrap font-title text-[11cqw] font-normal italic leading-none tracking-[0.02em] text-foreground"
        >
          CarryKit.
        </span>

        {/* TODO(mid-scene): 在此填 mid 场景的真实内容 slot */}
      </div>
    </div>
  );
}
