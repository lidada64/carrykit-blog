"use client";

import Link from "next/link";
import { logout } from "@/app/admin/login/actions";
import { useT } from "@/i18n";

/** admin 后台 header:标题 + posts/projects 导航 + 登出;朴素实用,仅用色板 token */
export function AdminHeader() {
  const t = useT();

  return (
    <header className="flex items-center justify-between border-b border-border pb-4">
      <div className="flex items-baseline gap-8">
        <span className="text-subheading font-display">{t("admin.title")}</span>
        <nav className="flex gap-4 text-caption font-mono uppercase">
          <Link
            href="/admin/posts"
            className="text-muted hover:text-foreground"
          >
            {t("admin.postsLink")}
          </Link>
          <Link
            href="/admin/projects"
            className="text-muted hover:text-foreground"
          >
            {t("admin.projectsLink")}
          </Link>
        </nav>
      </div>
      <form action={logout}>
        <button
          type="submit"
          className="cursor-pointer text-caption font-mono uppercase text-muted hover:text-foreground"
        >
          {t("admin.logout")}
        </button>
      </form>
    </header>
  );
}
