"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useLocale } from "@/i18n";

/**
 * SceneNav —— HomeScene 自带的导航行,**与站点导航 src/components/layout/nav.tsx
 * 一致**(logo + WORK/BLOG/RADAR + 中/EN + 主题切换),尺寸用 cq 单位随 @container
 * 缩放。interactive=true 仅用于最外层(depth 0):中/EN 接 useLocale、主题接 useTheme、
 * 路由为真 Link;interactive=false 用于所有嵌套副本:纯静态镜像。
 *
 * 选择镜像:每个可选项带 `data-key`(供顶层命中检测)+ 字面量 `group-data-[hk=…]/frame:`
 * 高亮变体(frame 得到该 key 时,每层同 key 元素一起亮)。变体必须写成字面量,Tailwind
 * 才能扫描生成,故 highlight 类放在 navItems 静态表里。
 */

const navItems: { label: string; href: string; key: string; hi: string }[] = [
  { label: "WORK", href: "/work", key: "work", hi: "group-data-[hk=work]/frame:bg-foreground group-data-[hk=work]/frame:text-background" },
  { label: "BLOG", href: "/blog", key: "blog", hi: "group-data-[hk=blog]/frame:bg-foreground group-data-[hk=blog]/frame:text-background" },
  { label: "RADAR", href: "/radar", key: "radar", hi: "group-data-[hk=radar]/frame:bg-foreground group-data-[hk=radar]/frame:text-background" },
];

const SunIcon = (
  <svg className="h-[0.94cqw] w-[0.94cqw]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
);
const MoonIcon = (
  <svg className="h-[0.94cqw] w-[0.94cqw]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
);

/**
 * 布局外壳:logo 顶左、路由组顶右。尺寸用 cq 单位,按 1920 参考宽度换算真实 nav 的 rem
 * 值(1cqw≈19.2px / 1cqh≈10.8px),使满屏顶层与站点 nav 一致,同时仍随自嵌套等比缩小。
 */
function NavFrame({ children }: { children: ReactNode }) {
  return (
    <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-[1.67cqw] pt-[1.85cqh] font-display uppercase">
      <span className="ml-[0.83cqw] normal-case leading-none text-foreground text-[1.67cqw]">CarryKit</span>
      <div className="flex items-center gap-[1.67cqw] font-bold leading-none text-muted text-[0.83cqw]">
        {children}
      </div>
    </nav>
  );
}

function InteractiveNav() {
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <NavFrame>
      {navItems.map(({ label, href, key, hi }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            data-key={key}
            aria-current={active ? "page" : undefined}
            className={`-mx-[0.4cqw] px-[0.4cqw] transition-colors ${hi} ${active ? "text-foreground" : ""}`}
          >
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setLocale(locale === "en" ? "zh" : "en")}
        aria-label="Toggle language"
        data-key="lang"
        className="cursor-pointer border-b-[0.12cqh] border-border transition-colors group-data-[hk=lang]/frame:text-foreground"
      >
        {locale === "en" ? "中" : "EN"}
      </button>
      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
        data-key="theme"
        className="flex cursor-pointer items-center justify-center transition-colors group-data-[hk=theme]/frame:text-foreground"
      >
        {mounted ? (resolvedTheme === "dark" ? SunIcon : MoonIcon) : <div className="h-[0.94cqw] w-[0.94cqw]" />}
      </button>
    </NavFrame>
  );
}

function StaticNav() {
  return (
    <NavFrame>
      {navItems.map(({ label, href, key, hi }) => (
        <span
          key={href}
          data-key={key}
          className={`-mx-[0.4cqw] px-[0.4cqw] transition-colors ${hi}`}
        >
          {label}
        </span>
      ))}
      <span data-key="lang" className="border-b-[0.12cqh] border-border transition-colors group-data-[hk=lang]/frame:text-foreground">中</span>
      <span data-key="theme" className="flex items-center justify-center transition-colors group-data-[hk=theme]/frame:text-foreground">{MoonIcon}</span>
    </NavFrame>
  );
}

export function SceneNav({ interactive }: { interactive: boolean }) {
  return interactive ? <InteractiveNav /> : <StaticNav />;
}
