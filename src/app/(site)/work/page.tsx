import type { Metadata } from "next";
import { ProgressBar } from "@/components/motion/progress-bar";
import { WorkGallery } from "@/components/work/work-gallery";
import { en } from "@/i18n/en";
import { db } from "@/lib/db";
import { parseTags } from "@/lib/utils";

export const metadata: Metadata = {
  title: en.nav.work,
  description: en.work.description,
};

/** ISR(ARCHITECTURE §4):作品增改后最多 60s 生效 */
export const revalidate = 60;

export default async function WorkPage() {
  const projects = await db.project.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    select: {
      slug: true,
      title: true,
      summary: true,
      coverImage: true,
      tags: true,
    },
  });

  return (
    <>
      <WorkGallery
        projects={projects.map((project) => ({
          ...project,
          tags: parseTags(project.tags),
        }))}
      />
      <ProgressBar />
    </>
  );
}
