import { BlogList } from "@/components/blog/blog-list";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

/** ISR(ARCHITECTURE §4):发布/修改文章后最多 60s 生效 */
export const revalidate = 60;

export default async function BlogPage() {
  const posts = await db.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, publishedAt: true, createdAt: true },
  });

  return (
    <BlogList
      posts={posts.map(({ slug, title, publishedAt, createdAt }) => ({
        slug,
        title,
        date: formatDate(publishedAt ?? createdAt),
      }))}
    />
  );
}
