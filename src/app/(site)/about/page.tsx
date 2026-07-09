"use client";

import type { ReactNode } from "react";
import { FadeUp } from "@/components/motion/fade-up";
import { site } from "@/config/site";
import { useT } from "@/i18n";

/**
 * About 页分节布局(DESIGN_SPEC §6 / PRD US-A1~A3):
 * BIO / SKILLS / CONNECT 三节 + 大写 mono label;文案走 i18n,
 * 技能与联系方式数据在 src/config/site.ts。
 * 节间用大间距而非分割线(DESIGN_SPEC §1)。
 */
export default function AboutPage() {
  const t = useT();

  return (
    <div className="flex flex-col gap-20 py-16 lg:gap-24 lg:py-24">
      <Section label={t("about.bioLabel")}>
        <h1 className="max-w-[24ch] text-display font-display">
          {t("about.intro")}
        </h1>
        <p className="mt-8 max-w-[65ch] text-body text-muted">
          {t("about.bio")}
        </p>
      </Section>

      <Section label={t("about.skillsLabel")}>
        <ul className="flex flex-wrap gap-3">
          {site.skills.map((skill) => (
            <li
              key={skill}
              className="border border-border px-3 py-1 text-caption font-mono uppercase"
            >
              {skill}
            </li>
          ))}
        </ul>
      </Section>

      <Section label={t("about.connectLabel")}>
        <ul className="flex flex-col gap-2">
          <li>
            <a
              href={`mailto:${site.contactEmail}`}
              className="text-subheading hover:text-accent"
            >
              {site.contactEmail}
            </a>
          </li>
          {site.socials.map((social) => (
            <li key={social.href}>
              <a
                href={social.href}
                target="_blank"
                rel="noreferrer"
                className="text-subheading hover:text-accent"
              >
                {social.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FadeUp
      as="section"
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:gap-16"
    >
      <span className="text-caption font-mono uppercase text-muted">
        {label}
      </span>
      <div>{children}</div>
    </FadeUp>
  );
}
