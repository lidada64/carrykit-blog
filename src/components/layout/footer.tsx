"use client";

import { site } from "@/config/site";
import { useT } from "@/i18n";

/** 全站 Footer(DESIGN_SPEC §4):极简一行,署名 + 社交链接 */
export function Footer() {
  const t = useT();

  return (
    <footer className="mx-auto mt-auto w-full max-w-[1120px] px-6 lg:px-12">
      <div className="flex items-center justify-between border-t border-border py-6 text-caption font-mono uppercase text-muted">
        <span>{t("footer.byline")}</span>
        <div className="flex items-center gap-5">
          {site.socials.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
