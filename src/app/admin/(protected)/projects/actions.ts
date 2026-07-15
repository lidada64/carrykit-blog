"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export interface ProjectFormState {
  error: "" | "invalid" | "slugTaken";
}

/** 公开页即时重验证:改动后不等 ISR 60s 窗口 */
function revalidatePublicPages(slug: string): void {
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath(`/work/${slug}`);
}

/** 新建/更新作品(US-M3):id 为空则创建;含 order 排序与 published 开关 */
export async function saveProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const summaryEn = String(formData.get("summaryEn") ?? "").trim();
  const coverImage = String(formData.get("coverImage") ?? "").trim();
  const tags = String(formData.get("tags") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  const contentEn = String(formData.get("contentEn") ?? "");
  const orderRaw = Number(formData.get("order"));
  const order = Number.isFinite(orderRaw) ? Math.trunc(orderRaw) : 0;
  const published = formData.get("published") === "on";

  if (!title || !slug || !content.trim()) return { error: "invalid" };

  const existing = await db.project.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing && existing.id !== id) return { error: "slugTaken" };

  const data = {
    title,
    titleEn,
    slug,
    summary,
    summaryEn,
    coverImage,
    tags,
    link,
    content,
    contentEn,
    order,
    published,
  };
  if (id) {
    // 先取旧 slug:若本次修改了 slug,旧详情路径也需要重验证
    const before = await db.project.findUnique({
      where: { id },
      select: { slug: true },
    });
    await db.project.update({ where: { id }, data });
    if (before && before.slug !== slug) revalidatePublicPages(before.slug);
  } else {
    await db.project.create({ data });
  }
  revalidatePublicPages(slug);
  redirect("/admin/projects");
}

/** 删除作品(US-M3):确认交互在客户端 ProjectsTable */
export async function deleteProject(id: string): Promise<void> {
  await requireAdmin();
  const project = await db.project.delete({ where: { id } });
  revalidatePublicPages(project.slug);
  revalidatePath("/admin/projects");
}
