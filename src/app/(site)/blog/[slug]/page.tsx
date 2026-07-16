import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PostMeta } from "@/components/blog/post-meta";
import { PostTitle } from "@/components/blog/post-title";
import { RelatedArticles } from "@/components/blog/related-articles";
import { BackToTop } from "@/components/blog/back-to-top";
import { ProgressBar } from "@/components/motion/progress-bar";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { db } from "@/lib/db";
import { formatDate, parseTags } from "@/lib/utils";

/** ISR(ARCHITECTURE §4):generateStaticParams 预渲染已发布文章,草稿与未知 slug 404 */
export const revalidate = 60;

export async function generateStaticParams() {
  const posts = await db.post.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
  });
  return posts.map(({ slug }) => ({ slug }));
}

/** 文章 SEO(M3-8):独立 title/description + OG article 标签,绝对 URL 由 metadataBase 解析 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await db.post.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") return {};

  return {
    title: post.title,
    description: post.excerpt || undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt || undefined,
      type: "article",
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt?.toISOString(),
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await db.post.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") notFound();

  // 相关文章:V1 取最新的其他已发布文章(≤3);不足 2 篇时组件整块隐藏(US-B5)
  const related = await db.post.findMany({
    where: { status: "PUBLISHED", slug: { not: slug } },
    orderBy: { publishedAt: "desc" },
    take: 3,
    select: { slug: true, title: true, titleEn: true, excerpt: true, excerptEn: true, coverImage: true },
  });

  return (
    // 负 margin 破格突破 main 的 1120px,容器加宽到 1440px(DESIGN_SPEC §4);
    <article className="mx-[calc(50%-50vw)] px-6 pt-16 pb-8 lg:px-12 lg:pt-24 lg:pb-12">
      <div className="mx-auto max-w-[1440px]">
        {post.coverImage && (
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              priority
              sizes="(min-width: 1440px) 1344px, 100vw"
              className="object-cover"
            />
          </div>
        )}
        <PostTitle titleZh={post.title} titleEn={post.titleEn} />
        {/* 两栏布局:左侧固定较窄，右侧正文较宽 */}
        <div className="blog-scroll-container">
          <div className="mt-12 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16 xl:gap-24">
            <PostMeta
              titleZh={post.title}
              titleEn={post.titleEn}
              excerptZh={post.excerpt}
              excerptEn={post.excerptEn}
              date={formatDate(post.publishedAt ?? post.createdAt)}
              tags={parseTags(post.tags)}
            />
            <div className="right-content mt-10 lg:mt-0">
              {!post.contentEn ? (
                <MarkdownContent content={post.content} />
              ) : (
                <>
                  <div className="[[data-locale='en']_&]:hidden">
                    <MarkdownContent content={post.content} />
                  </div>
                  <div className="hidden [[data-locale='en']_&]:block">
                    <MarkdownContent content={post.contentEn} />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="related-articles-wrapper pt-16 lg:pt-24">
            <RelatedArticles posts={related} />
          </div>
          <div className="back-to-top-wrapper">
            <BackToTop />
          </div>
        </div>
        <ProgressBar />
      </div>
    </article>
  );
}
