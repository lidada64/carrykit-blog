import Image from "next/image";
import { notFound } from "next/navigation";
import { PostMeta } from "@/components/blog/post-meta";
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

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await db.post.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") notFound();

  return (
    <article className="py-16 lg:py-24">
      {post.coverImage && (
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            priority
            sizes="(min-width: 1120px) 1024px, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <h1 className="mt-10 max-w-[20ch] text-display font-display">
        {post.title}
      </h1>
      <div className="mt-12 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <PostMeta
          excerpt={post.excerpt}
          date={formatDate(post.publishedAt ?? post.createdAt)}
          tags={parseTags(post.tags)}
        />
        <div className="mt-10 lg:mt-0">
          <MarkdownContent content={post.content} />
        </div>
      </div>
    </article>
  );
}
