import { Footer } from "@/components/layout/footer";
import { Nav } from "@/components/layout/nav";

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
    </>
  );
}
