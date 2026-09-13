import { MoonReflectionScene } from "@/components/lab/moon-reflection/moon-reflection-scene";

/**
 * /lab/home-moon —— 标题融入画面·方向 1「月与倒影」原型(不在站点导航内)。
 *
 * 保留灯球 + 水面 + 1-bit 抖动风,退掉 /lab/home 的递归隧道:灯球=月,标题 CarryKit.
 * 卧地平线、水中有随波荡漾的倒影。与 /lab/home-campfire(方向 4)并列供对照挑选。
 * bg-background 兜底:水面未就绪 / WebGL 失败时透出。
 */
export default function LabHomeMoonPage() {
  return (
    <main className="bg-background">
      <MoonReflectionScene />
    </main>
  );
}
