"use client";

import { useLocale, useT } from "@/i18n";

/** 临时演示组件(M0-3 验收用):t() 取文案 + EN/中 即时切换 + localStorage 持久化 */
export function LocaleDemo() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <section className="flex flex-col gap-4">
      <p className="text-caption font-mono uppercase text-muted">
        i18n — locale: {locale}
      </p>
      <div className="flex gap-2">
        {(["en", "zh"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={`rounded border border-border px-3 py-1 text-caption font-mono uppercase ${
              locale === l ? "bg-foreground text-background" : "text-muted"
            }`}
          >
            {l === "en" ? "EN" : "中"}
          </button>
        ))}
      </div>
      <p className="text-body">
        {t("nav.work")} · {t("nav.blog")} · {t("nav.about")} ·{" "}
        {t("nav.contact")} — {t("common.backToBlog")}
      </p>
    </section>
  );
}
