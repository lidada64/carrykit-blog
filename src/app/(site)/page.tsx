import { HomeSections } from "@/components/home/home-sections";
import { Preloader } from "@/components/motion/preloader";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

/** ISR(ARCHITECTURE §4):内容更新后最多 60s 生效 */
export const revalidate = 60;

export default async function HomePage() {
  const [projects, posts] = await Promise.all([
    db.project.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
      take: 3,
      select: { slug: true, title: true, titleEn: true, summary: true, summaryEn: true, coverImage: true },
    }),
    db.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: { slug: true, title: true, titleEn: true, publishedAt: true, createdAt: true },
    }),
  ]);

  return (
    <>
      <Preloader />
      <HomeSections
        projects={projects}
        posts={posts.map(({ slug, title, titleEn, publishedAt, createdAt }) => ({
          slug,
          title,
          titleEn,
          date: formatDate(publishedAt ?? createdAt),
        }))}
      />
    </>
  );
}
