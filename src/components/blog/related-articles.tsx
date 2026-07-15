"use client";

import Image from "next/image";
import Link from "next/link";
import { FadeUp } from "@/components/motion/fade-up";
import { HoverCard } from "@/components/motion/hover-card";
import { useT } from "@/i18n";
import { Bilingual } from "@/components/ui/bilingual";

export interface RelatedArticle {
  slug: string;
  title: string;
  titleEn: string | null;
  excerpt: string;
  excerptEn: string | null;
  coverImage: string;
}

/**
 * Related Articles 卡片网格(PRD US-B5,阅读进度条属 M3-7):
 * ≤3 篇其他已发布文章;不足 2 篇整块隐藏。卡片 hover 动效(A8)属 M3-1。
 */
export function RelatedArticles({ posts }: { posts: RelatedArticle[] }) {
  const t = useT();

  if (posts.length < 2) return null;

  return (
    <section className="mt-24 border-t border-border pt-12">
      <h2 className="text-caption font-mono uppercase text-muted">
        {t("blog.relatedLabel")}
      </h2>
      <FadeUp
        as="ul"
        stagger
        className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
      >
        {posts.map((post) => (
          <li key={post.slug}>
            <HoverCard>
              <Link
                href={`/blog/${post.slug}`}
                className="flex flex-col gap-3"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-border/40">
                  {post.coverImage && (
                    <Image
                      src={post.coverImage}
                      alt={post.title}
                      fill
                      sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <h3 className="text-subheading">
                  <Bilingual zh={post.title} en={post.titleEn} asBlock />
                </h3>
                {post.excerpt && (
                  <p className="text-body text-muted">
                    <Bilingual zh={post.excerpt} en={post.excerptEn} asBlock />
                  </p>
                )}
              </Link>
            </HoverCard>
          </li>
        ))}
      </FadeUp>
    </section>
  );
}
