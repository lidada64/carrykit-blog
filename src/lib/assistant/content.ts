import { createHash } from "node:crypto";

export type ContentLocale = "en" | "zh";
export interface PublishedPost {
  id: string; slug: string; status: string; title: string; titleEn: string;
  excerpt: string; excerptEn: string; content: string; contentEn: string;
  tags: string; publishedAt: Date | null; updatedAt: Date;
}

export function revision(post: PublishedPost) {
  return createHash("sha256").update(JSON.stringify({ version: 1, ...post, publishedAt: post.publishedAt?.toISOString(), updatedAt: post.updatedAt.toISOString() })).digest("hex");
}

export function publicPost(post: PublishedPost, locale: ContentLocale, origin: string) {
  if (post.status !== "PUBLISHED") return null;
  const translated = locale === "en" && Boolean(post.titleEn.trim() && post.contentEn.trim());
  const contentLocale = translated ? "en" : "zh";
  return {
    postId: post.id, slug: post.slug, canonicalUrl: `${origin}/blog/${encodeURIComponent(post.slug)}`,
    requestedLocale: locale, contentLocale, fallback: locale !== contentLocale,
    title: translated ? post.titleEn : post.title,
    excerpt: translated ? post.excerptEn : post.excerpt,
    contentMarkdown: translated ? post.contentEn : post.content,
    tags: post.tags.split(",").map(tag => tag.trim()).filter(Boolean),
    publishedAt: post.publishedAt?.toISOString() ?? null, updatedAt: post.updatedAt.toISOString(), revision: revision(post),
  };
}

export function manifestPage(posts: PublishedPost[], locale: ContentLocale, cursor: string | null) {
  const snapshotId = createHash("sha256").update(JSON.stringify(posts.map(post => [post.id, revision(post)]))).digest("hex");
  let offset = 0;
  if (cursor) {
    const [snapshot, position] = cursor.split(":");
    if (snapshot !== snapshotId || !/^\d+$/.test(position ?? "")) throw new Error("CURSOR_INVALIDATED");
    offset = Number(position);
    if (!Number.isSafeInteger(offset) || offset > posts.length) throw new Error("CURSOR_INVALIDATED");
  }
  return { snapshotId, items: posts.slice(offset, offset + 50).map(post => ({ postId: post.id, locale, revision: revision(post) })), nextCursor: offset + 50 < posts.length ? `${snapshotId}:${offset + 50}` : null };
}
