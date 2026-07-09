import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

/** sitemap(M3-8):静态公开页 + 已发布文章/作品;绝对 URL 用 SITE_URL */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3000";

  const [posts, projects] = await Promise.all([
    db.post.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
    }),
    db.project.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/work`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...posts.map(({ slug, updatedAt }) => ({
      url: `${base}/blog/${slug}`,
      lastModified: updatedAt,
      priority: 0.7,
    })),
    ...projects.map(({ slug, updatedAt }) => ({
      url: `${base}/work/${slug}`,
      lastModified: updatedAt,
      priority: 0.7,
    })),
  ];
}
