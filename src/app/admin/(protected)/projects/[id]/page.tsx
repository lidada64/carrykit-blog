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
        slug: project.slug,
        summary: project.summary,
        coverImage: project.coverImage,
        tags: project.tags,
        link: project.link,
        content: project.content,
        order: project.order,
        published: project.published,
      }}
    />
  );
}
