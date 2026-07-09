"use client";

import Image from "next/image";
import Link from "next/link";
import { site } from "@/config/site";
import { useT } from "@/i18n";

export interface BlogListItem {
  slug: string;
  title: string;
  /** 已格式化日期(YYYY.MM.DD),服务端生成 */
  date: string;
}

/**
 * Blog 列表双栏布局(DESIGN_SPEC §6 / PRD US-B1、US-B2):
 * 左侧 sticky 侧栏(Blog(N) + About 描述 + 缩略图)+ 右侧 DATE/NAME 文章列表。
 * 移动端降级单栏,侧栏内容置顶。hover 文字滚动动效属 M3-4,此处不做。
 */
export function BlogList({ posts }: { posts: BlogListItem[] }) {
  const t = useT();

  return (
    <section className="py-16 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16 lg:py-24">
      <aside className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
        <h1 className="text-display font-display">
          {t("blog.title")}({posts.length})
        </h1>
        <div className="flex flex-col gap-2">
          <span className="text-caption font-mono uppercase text-muted">
            {t("blog.aboutLabel")}
          </span>
          <p className="max-w-[40ch] text-body text-muted">
            {t("blog.description")}
          </p>
        </div>
        <Image
          src={site.blogThumbnail}
          alt=""
          width={640}
          height={800}
          sizes="(min-width: 1024px) 320px, 60vw"
          className="w-full max-w-[320px] object-cover"
        />
      </aside>

      <div className="mt-12 lg:mt-0">
        <div className="grid grid-cols-[6.5rem_1fr] border-b border-border pb-3 text-caption font-mono uppercase text-muted">
          <span>{t("blog.dateHeader")}</span>
          <span>{t("blog.nameHeader")}</span>
        </div>
        <ul>
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="grid grid-cols-[6.5rem_1fr] items-baseline border-b border-border py-5"
              >
                <span className="text-caption font-mono text-muted">
                  {post.date}
                </span>
                <span className="text-subheading">{post.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
