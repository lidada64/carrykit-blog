import { notFound } from "next/navigation";
import { PostForm } from "@/components/admin/post-form";
import { db } from "@/lib/db";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await db.post.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <PostForm
      post={{
        id: post.id,
        title: post.title,
        titleEn: post.titleEn,
        slug: post.slug,
        excerpt: post.excerpt,
        excerptEn: post.excerptEn,
        coverImage: post.coverImage,
        tags: post.tags,
        content: post.content,
        contentEn: post.contentEn,
        status: post.status,
        publishedAt: post.publishedAt
          ? post.publishedAt.toISOString().slice(0, 10)
          : "",
      }}
    />
  );
}
