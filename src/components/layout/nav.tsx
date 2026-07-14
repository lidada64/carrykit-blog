"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { TextRoll } from "@/components/motion/text-roll";
import { site } from "@/config/site";
import { useLocale, useT, type TKey } from "@/i18n";

const navItems: { key: TKey; href: string }[] = [
  { key: "nav.work", href: "/work" },
  { key: "nav.blog", href: "/blog" },
  { key: "nav.about", href: "/about" },
];

/** 全站导航(DESIGN_SPEC §4):logo + work/blog/about/contact + EN/中,caption mono 大写,当前页高亮 */
export function Nav() {
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <header className="mx-auto w-full max-w-[1120px] px-6 lg:px-12">
      <nav className="flex items-center justify-between gap-4 py-6 text-caption font-mono uppercase">
        {/* 360px 窄屏 logo 降一档,避免与右侧导航贴死(M3-9) */}
        <Link
          href="/"
          className="font-display normal-case text-body sm:text-subheading"
        >
          {site.name}
        </Link>
        {/* 360px 窄屏下 gap-4 会顶满可用宽度,收紧到 gap-3(M3-9) */}
        <div className="flex items-center gap-3 sm:gap-8">
          {navItems.map(({ key, href }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                // duration-500 与 text-roll 滚动时长(duration.base)同步,避免黑底黑字空窗
                className={`-mx-1 px-1 transition-colors duration-500 hover:bg-foreground focus-visible:bg-foreground ${active ? "text-foreground" : "text-muted"}`}
              >
                <TextRoll text={t(key)} />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            aria-label={t("common.language")}
            className="cursor-pointer border-b border-border text-muted hover:text-foreground"
          >
            {locale === "en" ? "中" : "EN"}
          </button>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="cursor-pointer text-muted hover:text-foreground flex items-center justify-center"
          >
            {mounted ? (
              resolvedTheme === "dark" ? (
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
              ) : (
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              )
            ) : (
              <div className="w-[18px] h-[18px]" />
            )}
          </button>
        </div>
      </nav>
    </header>
  );
}
