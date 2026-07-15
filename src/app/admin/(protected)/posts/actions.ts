"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export interface PostFormState {
  error: "" | "invalid" | "slugTaken";
}

/** 公开页即时重验证:发布/修改/删除后不等 ISR 60s 窗口 */
function revalidatePublicPages(slug: string): void {
  revalidatePath("/");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
}

/** 新建/更新文章(US-M2):id 为空则创建;slug 唯一校验,冲突返回错误态 */
export async function savePost(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const excerptEn = String(formData.get("excerptEn") ?? "").trim();
  const coverImage = String(formData.get("coverImage") ?? "").trim();
  const tags = String(formData.get("tags") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  const contentEn = String(formData.get("contentEn") ?? "");
  const status =
    formData.get("status") === "PUBLISHED"
      ? ("PUBLISHED" as const)
      : ("DRAFT" as const);
  const publishedAtRaw = String(formData.get("publishedAt") ?? "").trim();

  if (!title || !slug || !content.trim()) return { error: "invalid" };

  const existing = await db.post.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing && existing.id !== id) return { error: "slugTaken" };

  // 发布时间:表单值优先;发布状态下留空则取当前时间;草稿留空则清空
  const publishedAt = publishedAtRaw
    ? new Date(publishedAtRaw)
    : status === "PUBLISHED"
      ? new Date()
      : null;

  const data = { title, titleEn, slug, excerpt, excerptEn, coverImage, tags, content, contentEn, status, publishedAt };
  if (id) {
    // 先取旧 slug:若本次修改了 slug,旧详情路径也需要重验证
    const before = await db.post.findUnique({
      where: { id },
      select: { slug: true },
    });
    await db.post.update({ where: { id }, data });
    if (before && before.slug !== slug) revalidatePublicPages(before.slug);
  } else {
    await db.post.create({ data });
  }
  revalidatePublicPages(slug);
  redirect("/admin/posts");
}

/** 删除文章(US-M2):确认交互在客户端 PostsTable */
export async function deletePost(id: string): Promise<void> {
  await requireAdmin();
  const post = await db.post.delete({ where: { id } });
  revalidatePublicPages(post.slug);
  revalidatePath("/admin/posts");
}
