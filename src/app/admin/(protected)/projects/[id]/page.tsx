import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/admin/project-form";
import { db } from "@/lib/db";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <ProjectForm
      project={{
        id: project.id,
        title: project.title,
        titleEn: project.titleEn,
        slug: project.slug,
        summary: project.summary,
        summaryEn: project.summaryEn,
        coverImage: project.coverImage,
        tags: project.tags,
        link: project.link,
        content: project.content,
        contentEn: project.contentEn,
        order: project.order,
        published: project.published,
      }}
    />
  );
}
