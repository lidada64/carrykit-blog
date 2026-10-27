import { WaterTextProbe } from "@/components/lab/water-text/water-text-probe";

/**
 * /lab/water-text —— 水下隐藏字模验证台(不在站点导航内)。
 *
 * 只验证 idea/灯球彩蛋.md 的成败点「字与水面有没有图层缝」:night 灯球点亮,
 * 一句 "CarryKit is not just CarryKit" 只在光池里显形,拖灯球扫过逐段揭示。
 * 灯球坠落/退出等完整交互本页不做。
 */
export default function LabWaterTextPage() {
  return (
    <main className="bg-background">
      <WaterTextProbe />
    </main>
  );
}
