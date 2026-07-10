import { Footer } from "@/components/layout/footer";
import { Nav } from "@/components/layout/nav";
import { Revealer } from "@/components/motion/revealer";
import { ScrollIndicator } from "@/components/motion/scroll-indicator";

/** 公开站布局:共享导航与 Footer;admin 不走此布局(ARCHITECTURE §2) */
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-6 lg:px-12">
        {children}
      </main>
      <Footer />
      {/* 页面过渡遮罩(A1):仅公开站启用 */}
      <Revealer />
      {/* 右侧滚动进度矩形:替代原生滚动条,仅公开站启用 */}
      <ScrollIndicator />
    </>
  );
}
