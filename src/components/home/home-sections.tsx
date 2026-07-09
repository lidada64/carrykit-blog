"use client";

import Image from "next/image";
import Link from "next/link";
import { FadeUp } from "@/components/motion/fade-up";
import { HoverCard } from "@/components/motion/hover-card";
import { PixelTitle } from "@/components/motion/pixel-title";
import { TextRoll } from "@/components/motion/text-roll";
import { site } from "@/config/site";
import { useT } from "@/i18n";

export interface HomeProject {
  slug: string;
  title: string;
  summary: string;
  coverImage: string;
}

export interface HomePost {
  slug: string;
  title: string;
  /** 已格式化日期(YYYY.MM.DD),服务端生成 */
  date: string;
}

/**
 * Home 页区块(DESIGN_SPEC §6 / PRD US-H1、US-H2):
 * hero(标语 + 大图 + 双栏 description)+ 精选作品(≤3)+ 最新博客(≤3)。
 * 区块无内容时整体隐藏;preloader(A2)、pixelated 标题(A4)、
 * 入场/hover 动效(A3/A7/A8)属 M3。
 */
export function HomeSections({
  projects,
  posts,
}: {
  projects: HomeProject[];
  posts: HomePost[];
}) {
  const t = useT();

  return (
    <>
      <section className="flex flex-col justify-center gap-10 py-16 lg:min-h-svh lg:py-24">
        {/* hero 标题走 A4 像素揭示,不参与 A7 stagger,避免双动画叠加 */}
        <h1 className="max-w-[16ch] text-display font-display">
          <PixelTitle text={t("home.slogan")} />
        </h1>
        <FadeUp className="relative aspect-[16/9] w-full overflow-hidden bg-border/40">
          <Image
            src={site.heroImage}
            alt=""
            fill
            priority
            sizes="(min-width: 1120px) 1024px, 100vw"
            className="object-cover"
          />
        </FadeUp>
        <FadeUp stagger className="grid gap-8 md:grid-cols-2">
          <p className="max-w-[48ch] text-body text-muted">
            {t("home.descriptionLeft")}
          </p>
          <p className="max-w-[48ch] text-body text-muted">
            {t("home.descriptionRight")}
          </p>
        </FadeUp>
      </section>

      {projects.length > 0 && (
        <section className="py-16 lg:py-24">
          <FadeUp>
            <h2 className="text-caption font-mono uppercase text-muted">
              {t("home.selectedWorkLabel")}
            </h2>
          </FadeUp>
          <FadeUp
            as="ul"
            stagger
            className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
          >
            {projects.map((project) => (
              <li key={project.slug}>
                <HoverCard>
                  <Link
                    href={`/work/${project.slug}`}
                    className="flex flex-col gap-3"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-border/40">
                      {project.coverImage && (
                        <Image
                          src={project.coverImage}
                          alt={project.title}
                          fill
                          sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <h3 className="text-subheading">{project.title}</h3>
                    {project.summary && (
                      <p className="text-body text-muted">{project.summary}</p>
                    )}
                  </Link>
                </HoverCard>
              </li>
            ))}
          </FadeUp>
        </section>
      )}

      {posts.length > 0 && (
        <section className="py-16 lg:py-24">
          <FadeUp>
            <h2 className="text-caption font-mono uppercase text-muted">
              {t("home.latestWritingLabel")}
            </h2>
          </FadeUp>
          <FadeUp as="ul" stagger className="mt-8">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="grid grid-cols-[6.5rem_1fr] items-center border-b border-border py-5"
                >
                  <TextRoll
                    text={post.date}
                    className="text-caption font-mono text-muted"
                  />
                  <TextRoll text={post.title} className="text-subheading" />
                </Link>
              </li>
            ))}
          </FadeUp>
        </section>
      )}
    </>
  );
}
