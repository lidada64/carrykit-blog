"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useLocale } from "@/i18n";

/**
 * SceneNav —— HomeScene 自带的导航行,**与站点导航 src/components/layout/nav.tsx
 * 完全一致**(logo + WORK/BLOG/RADAR + 中/EN + 主题切换太阳/月亮),只是尺寸改用
 * cq 单位随 @container 缩放,以便随自嵌套层层缩小。
 *
 * interactive=true 仅用于最外层(depth 0):中/EN 接真实 useLocale、主题切换接真实
 * useTheme、路由为真 Link。interactive=false 用于所有嵌套副本:纯静态镜像,不挂
 * hook、不可聚焦——避免 N 个订阅,也防误点 20px 的嵌套开关。
 *
 * 注:导航项文案沿用 Figma 稿的英文字面(WORK/BLOG/RADAR),不走 i18n 字典;
 * 中/EN 仍会翻转全站 locale(此处标签不随之本地化,原型取舍)。
 */

const navItems: { label: string; href: string }[] = [
  { label: "WORK", href: "/work" },
  { label: "BLOG", href: "/blog" },
  { label: "RADAR", href: "/radar" },
];

// 图标尺寸对齐真实 nav 的 18px:18/19.2 ≈ 0.94cqw
const SunIcon = (
  <svg className="h-[0.94cqw] w-[0.94cqw]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
);
const MoonIcon = (
  <svg className="h-[0.94cqw] w-[0.94cqw]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
);

/**
 * 布局外壳:logo 顶左、路由组顶右。尺寸用 cq 单位,按 1920 参考宽度换算真实 nav
 * 的 rem 值(1cqw≈19.2px / 1cqh≈10.8px),使满屏顶层与站点 nav 一致,同时仍随
 * 自嵌套等比缩小:
 *   logo text-heading 2rem=32px → 1.67cqw;左内边距 px-8(32)+ml-4(16)=48px → 1.67+0.83
 *   路由项 text-body 1rem=16px → 0.83cqw;组间距 gap-8=32px → 1.67cqw;py-5=20px → 1.85cqh
 */
function NavFrame({ children }: { children: ReactNode }) {
  return (
    <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-[1.67cqw] pt-[1.85cqh] font-display uppercase">
      {/* logo:同站点导航(font-display,常规字重、常规大小写) */}
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
      {navItems.map(({ label, href }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            data-hoverable
            aria-current={active ? "page" : undefined}
            className={`-mx-[0.4cqw] px-[0.4cqw] transition-colors hover:bg-foreground hover:text-background ${active ? "text-foreground" : ""}`}
          >
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setLocale(locale === "en" ? "zh" : "en")}
        aria-label="Toggle language"
        data-hoverable
        className="cursor-pointer border-b-[0.12cqh] border-border hover:text-foreground"
      >
        {locale === "en" ? "中" : "EN"}
      </button>
      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
        data-hoverable
        className="flex cursor-pointer items-center justify-center hover:text-foreground"
      >
        {mounted ? (resolvedTheme === "dark" ? SunIcon : MoonIcon) : <div className="h-[1.3cqw] w-[1.3cqw]" />}
      </button>
    </NavFrame>
  );
}

function StaticNav() {
  return (
    <NavFrame>
      {navItems.map(({ label, href }) => (
        <span key={href}>{label}</span>
      ))}
      <span className="border-b-[0.12cqh] border-border">中</span>
      <span className="flex items-center justify-center">{MoonIcon}</span>
    </NavFrame>
  );
}

export function SceneNav({ interactive }: { interactive: boolean }) {
  return interactive ? <InteractiveNav /> : <StaticNav />;
}
