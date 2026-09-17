import { SkyScreenScene } from "@/components/lab/sky-screen/sky-screen";

/**
 * /lab/sky-screen —— 天空粒子「可播放屏幕」原型(不在站点导航内)。
 *
 * 未交互:夜空稀疏星场 + 中间由粒子构成的 CarryKit 标题。
 * 悬停中间方框:天空粒子散开,标题交叉淡化成一段预渲染 3D 动画(1-bit 掩码图集,像素全由粒子露出);
 * 点击:暂停/继续。bg-background 兜底:水面未就绪 / WebGL 失败时透出。
 */
export default function LabSkyScreenPage() {
  return (
    <main className="bg-background">
      <SkyScreenScene />
    </main>
  );
}
