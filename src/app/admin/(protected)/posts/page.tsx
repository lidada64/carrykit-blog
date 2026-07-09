import { PostsTable } from "@/components/admin/posts-table";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

/** 后台文章列表(US-M2) */
export default async function AdminPostsPage() {
  const posts = await db.post.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
    },
  });

  return (
    <PostsTable
      posts={posts.map(({ id, title, slug, status, publishedAt }) => ({
        id,
        title,
        slug,
        status,
        date: publishedAt ? formatDate(publishedAt) : "",
      }))}
    />
  );
}
