/**
 * reduced-motion 工具(DESIGN_SPEC §5 红线):
 * 所有动效组件在创建动画前必须先查询本函数,reduce 时直接静态展示。
 * 仅在客户端(effect/useGSAP 回调)调用。
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
