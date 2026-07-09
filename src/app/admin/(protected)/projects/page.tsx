import { ProjectsTable } from "@/components/admin/projects-table";
import { db } from "@/lib/db";

/** 后台作品列表(US-M3):按 order 升序 */
export default async function AdminProjectsPage() {
  const projects = await db.project.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      order: true,
      published: true,
    },
  });

  return <ProjectsTable projects={projects} />;
}
