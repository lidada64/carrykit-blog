import { CampfireScene } from "@/components/lab/campfire/campfire-scene";

/**
 * /lab/home-campfire —— 标题融入画面·方向 4「篝火与星座」原型(不在站点导航内)。
 *
 * 保留灯球 + 水面 + 1-bit 抖动风,退掉 /lab/home 的递归隧道:底部篝火星跳动,标题上方
 * 星链逐笔连亮,灯球=漂过夜空的行星。与 /lab/home-moon(方向 1)并列供对照挑选。
 * bg-background 兜底:水面未就绪 / WebGL 失败时透出。
 */
export default function LabHomeCampfirePage() {
  return (
    <main className="bg-background">
      <CampfireScene />
    </main>
  );
}
