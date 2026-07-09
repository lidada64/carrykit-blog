"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
                className={active ? "text-foreground" : "text-muted hover:text-foreground"}
              >
                <TextRoll text={t(key)} />
              </Link>
            );
          })}
          <a
            href={`mailto:${site.contactEmail}`}
            className="text-muted hover:text-foreground"
          >
            <TextRoll text={t("nav.contact")} />
          </a>
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            aria-label={t("common.language")}
            className="cursor-pointer border-b border-border text-muted hover:text-foreground"
          >
            {locale === "en" ? "中" : "EN"}
          </button>
        </div>
      </nav>
    </header>
  );
}
