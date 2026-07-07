"use client";

import { useT, type TKey } from "@/i18n";

/** M0 占位页(M1 各任务逐个替换):大标题 + 建设中提示 */
export function PagePlaceholder({ titleKey }: { titleKey: TKey }) {
  const t = useT();

  return (
    <section className="flex flex-col gap-6 py-16 lg:py-24">
      <h1 className="text-display font-display">{t(titleKey)}</h1>
      <p className="text-body text-muted">{t("common.comingSoon")}</p>
    </section>
  );
}
