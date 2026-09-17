import { HomeHero } from "@/components/home/home-hero";

/**
 * 主页:CarryKit 粒子标题(点击爆开 → 每颗随机角度+力度成速度线 → 中央 3D 视频循环 → 长按倒流)+
 * 吊起的迪斯科灯球 + 自定义光标环;**下滑时水面 night→mid**,滚到底接站点 Footer。
 * 具体见 `src/components/home/home-hero.tsx`。原递归自嵌套 Hero 等实验已归档到 /archive/(不入库)。
 */
export default function HomePage() {
  return <HomeHero />;
}
