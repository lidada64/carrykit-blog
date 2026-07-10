"use client";

import Image from "next/image";
import Link from "next/link";
import { FadeUp } from "@/components/motion/fade-up";
import { TextRoll } from "@/components/motion/text-roll";
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
 * 负 margin 破格突破 main 的 1120px,容器加宽到 1440px,两栏黄金分割(§4)。
 * 移动端降级单栏,侧栏内容置顶。hover 文字滚动动效属 M3-4,此处不做。
 */
export function BlogList({ posts }: { posts: BlogListItem[] }) {
  const t = useT();

  return (
    // 百分比 margin 相对父容器解析,calc(50%-50vw) 恰好铺满视口;
    // 站点页原生滚动条已隐藏,100vw = clientWidth,不会出横向滚动
    <section className="mx-[calc(50%-50vw)] px-6 py-16 lg:px-12 lg:py-24">
      <div className="mx-auto max-w-[1440px] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.618fr)] lg:gap-16">
        <FadeUp
          as="aside"
          stagger
          className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start"
        >
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
            priority
            sizes="(min-width: 1024px) 320px, 60vw"
            className="w-full max-w-[320px] object-cover"
          />
        </FadeUp>

        <div className="mt-12 lg:mt-0">
          <FadeUp className="grid grid-cols-[6.5rem_1fr] border-b border-border pb-3 text-caption font-mono uppercase text-muted">
            <span>{t("blog.dateHeader")}</span>
            <span>{t("blog.nameHeader")}</span>
          </FadeUp>
          <FadeUp as="ul" stagger>
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  // 整行反色(A3):px/-mx 让色条比文字略宽,对齐不变;
                  // duration-500 与 text-roll 滚动时长(duration.base)同步,避免黑底黑字空窗
                  className="-mx-3 grid grid-cols-[6.5rem_1fr] items-center border-b border-border px-3 py-5 transition-colors duration-500 hover:bg-foreground focus-visible:bg-foreground"
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
        </div>
      </div>
    </section>
  );
}
