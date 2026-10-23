"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useLocale, useT, type TKey } from "@/i18n";

/**
 * HomeNav —— **仅首页**的导航(替代全站 Nav,参考 vintage.agency):
 * - 左上:大写 `CARRY`(链接回首页),浮在 hero 水面之上、无黑色底条。
 * - 右上:三条线汉堡按钮;**hover 时一道黑色条纹从左到右扫过**(见 globals.css `home-nav-swipe`)。
 * - 点击汉堡 → 开合**全屏菜单**(纸色底):WORK / BLOG / RADAR + 中英 + 主题,保证导航不断。
 *
 * 自门控:仅在 `/` 渲染(其余路由用全站 Nav)。放在 SmoothScroll **之外**(见 (site)/layout.tsx)
 * 才能真正 fixed(ScrollSmoother 的 transform 会让层内 fixed 失效)。CARRY/汉堡用固定纸色 `#fafaf8`
 * 保证在始终为暗的 night 水面上可读(不随主题变)。
 */

const navItems: { key: TKey; href: string }[] = [
  { key: "nav.work", href: "/work" },
  { key: "nav.blog", href: "/blog" },
  { key: "nav.radar", href: "/radar" },
];

const PAPER = "#fafaf8";
const INK = "#1a1a1a";

export function HomeNav() {
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  // setTimeout(0) 而非直接 setState:避开 react-hooks/set-state-in-effect(与全站 Nav 同款)。
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // 打开时:Esc 关闭。(路由跳转由各 Link 的 onClick 直接收起,无需额外 effect。)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname !== "/") return null;

  return (
    <>
      {/* 顶栏:透明浮层,只有 CARRY / 汉堡本身可点(容器 pointer-events-none)。
          home-nav-root:夺回原生光标(CursorMirror 全局 cursor:none)。 */}
      <div className="home-nav-root pointer-events-none fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-6 py-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label={t("common.home")}
          className="pointer-events-auto font-display text-[clamp(1.35rem,2.4vw,2rem)] uppercase leading-none tracking-[0.06em]"
          style={{ color: PAPER }}
        >
          Carry
        </Link>

        {/* 汉堡按钮:overflow-hidden 承载 hover 扫过的黑条纹;三条线置于 z-10 之上。 */}
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="home-nav-burger pointer-events-auto group relative flex h-11 w-14 items-center justify-center"
        >
          {/* 图标框(三条线):黑条纹**与图标同尺寸**、被 overflow-hidden 限制在框内。三条线在下、
              黑条纹在上(z-10)——hover 时条纹缓慢扫过、盖住三条线的一部分(暗水面上被盖处的纸色线随之隐没)。 */}
          <span className="relative flex w-7 flex-col gap-[6px] overflow-hidden">
            <span className="h-[2px] w-full" style={{ backgroundColor: PAPER }} />
            <span className="h-[2px] w-full" style={{ backgroundColor: PAPER }} />
            <span className="h-[2px] w-full" style={{ backgroundColor: PAPER }} />
            <span className="home-nav-swipe pointer-events-none absolute inset-y-0 left-0 z-10 w-1/2" aria-hidden style={{ backgroundColor: INK }} />
          </span>
        </button>
      </div>

      {/* 全屏菜单:纸色底 + 墨色大字。open 时淡入 + 链接上浮。 */}
      <div
        className={[
          "home-nav-root fixed inset-0 z-[70] flex flex-col transition-[opacity,visibility] duration-500 ease-out",
          open ? "visible opacity-100" : "invisible opacity-0",
        ].join(" ")}
        style={{ backgroundColor: PAPER, color: INK }}
        aria-hidden={!open}
      >
        {/* 顶行:CARRY + 关闭 */}
        <div className="flex items-center justify-between px-6 py-5 sm:px-8 lg:px-10">
          <Link href="/" className="font-display text-[clamp(1.35rem,2.4vw,2rem)] uppercase leading-none tracking-[0.06em]">
            Carry
          </Link>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="relative flex h-11 w-11 items-center justify-center"
          >
            <span className="absolute h-[2px] w-7 rotate-45" style={{ backgroundColor: INK }} />
            <span className="absolute h-[2px] w-7 -rotate-45" style={{ backgroundColor: INK }} />
          </button>
        </div>

        {/* 大字链接 */}
        <nav className="flex flex-1 flex-col justify-center gap-2 px-6 sm:px-10 lg:px-16">
          {navItems.map(({ key, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="home-nav-link group relative w-fit overflow-hidden px-[0.12em] font-display text-[clamp(2.4rem,9vw,6.5rem)] font-bold uppercase leading-[1.02] tracking-[0.01em]"
            >
              {/* 默认:墨色块藏在左侧屏外(单词清晰可读)。hover:块从左到右填入,文字翻成纸色叠其上。
                  用 Tailwind utility 的 -translate-x-full 确保**默认隐藏**(不再默认盖住单词)。 */}
              <span
                className="pointer-events-none absolute inset-0 -translate-x-[101%] transition-transform duration-500 ease-out group-hover:translate-x-0"
                aria-hidden
                style={{ backgroundColor: INK }}
              />
              <span className="relative z-10 transition-colors duration-300 group-hover:text-[#fafaf8]">
                {t(key)}
              </span>
            </Link>
          ))}
        </nav>

        {/* 底行:中英 + 主题 */}
        <div className="flex items-center justify-between px-6 py-6 text-body font-display uppercase sm:px-10 lg:px-16">
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            aria-label={t("common.language")}
            className="cursor-pointer border-b border-current pb-[2px]"
          >
            {locale === "en" ? "中" : "EN"}
          </button>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="flex cursor-pointer items-center justify-center"
          >
            {mounted ? (
              resolvedTheme === "dark" ? (
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
              ) : (
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
              )
            ) : (
              <div className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
