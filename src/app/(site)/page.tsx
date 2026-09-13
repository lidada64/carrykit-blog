import { HomeCollapse } from "@/components/lab/home-collapse";

/**
 * 主页:改用原 /lab/home 的滚动收缩转场(HomeCollapse) —— 递归自相似 Hero +
 * 水面 night→mid 过渡 + 灯球吊起升出。原迪斯科灯球叙事(DiscoHero)已下线。
 *
 * 站点布局的 `<main>` 有 max-w-[1120px] 约束,故套一层 `mx-[calc(50%-50vw)]
 * w-screen` 破出到满视口宽(与旧 DiscoHero 的做法一致),让水面/递归帧满屏铺开。
 * pin+scrub 走 ScrollTrigger,与站点布局的 ScrollSmoother 原生兼容。
 */
export default function HomePage() {
  return (
    <div className="mx-[calc(50%-50vw)] w-screen flex-1">
      <HomeCollapse />
    </div>
  );
}
