import { DiscoHero } from "@/components/home/disco-hero";
import { Preloader } from "@/components/motion/preloader";

/**
 * 主页:迪斯科灯球叙事(docs/homepage-animation-plan.md)。
 * 旧设计的「精选作品 / 最新博客」区块已移除;work/blog/radar 的入口
 * 由后续 HR-9 三板块承接,站点其余内容(HR-10 之后)另行规划。
 */
export default function HomePage() {
  return (
    <>
      <Preloader />
      <DiscoHero />
    </>
  );
}
