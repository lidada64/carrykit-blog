import { HomeCollapse } from "@/components/lab/home-collapse";

/**
 * /lab/home —— 极简 Hero + 右下角"无限自嵌套"原型,叠加**滚动收缩转场**
 * (复刻 Figma "page",不在站点导航内)。
 *
 * HomeCollapse pin 整屏:滚轮向下把整帧 Hero 以右下角嵌套页为焦点收缩(scale 1→1/3),
 * 腾出的画面显示 What is CarryKit,尾段去嵌套 → 角落停留扁平 Hero 总览。
 * 递归自相似单元 HomeScene + 光标/选择镜像 CursorMirror 均由 HomeCollapse 承载。
 * 详见 docs/home-collapse-transition.md。
 */
export default function LabHomePage() {
  return (
    <main className="bg-background">
      <HomeCollapse />
    </main>
  );
}
