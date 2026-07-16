import type { Metadata } from "next";
import { BlogList } from "@/components/blog/blog-list";
import { en } from "@/i18n/en";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { BackToTop } from "@/components/blog/back-to-top";

export const metadata: Metadata = {
  title: en.nav.blog,
  description: en.blog.description,
};

/** ISR(ARCHITECTURE §4):发布/修改文章后最多 60s 生效 */
export const revalidate = 60;

export default async function BlogPage() {
  const posts = await db.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, titleEn: true, publishedAt: true, createdAt: true },
  });

  return (
    <div className="flex flex-col min-h-full">
      <BlogList
        posts={posts.map(({ slug, title, titleEn, publishedAt, createdAt }) => ({
          slug,
          title,
          titleEn,
          date: formatDate(publishedAt ?? createdAt),
        }))}
      />
      <div className="mt-16">
        <BackToTop />
      </div>
    </div>
  );
}
