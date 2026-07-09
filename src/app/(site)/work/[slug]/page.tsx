import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ProjectLinkButton } from "@/components/work/project-link-button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { db } from "@/lib/db";
import { parseTags } from "@/lib/utils";

/** ISR(ARCHITECTURE §4):generateStaticParams 预渲染已发布作品,未发布与未知 slug 404 */
export const revalidate = 60;

export async function generateStaticParams() {
  const projects = await db.project.findMany({
    where: { published: true },
    select: { slug: true },
  });
  return projects.map(({ slug }) => ({ slug }));
}

/** 作品 SEO(M3-8):独立 title/description + OG 标签 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project || !project.published) return {};

  return {
    title: project.title,
    description: project.summary || undefined,
    openGraph: {
      title: project.title,
      description: project.summary || undefined,
      type: "website",
      url: `/work/${project.slug}`,
      images: project.coverImage ? [project.coverImage] : undefined,
    },
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project || !project.published) notFound();

  const tags = parseTags(project.tags);

  return (
    <article className="py-16 lg:py-24">
      {project.coverImage && (
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          <Image
            src={project.coverImage}
            alt={project.title}
            fill
            priority
            sizes="(min-width: 1120px) 1024px, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <h1 className="mt-10 max-w-[20ch] text-display font-display">
        {project.title}
      </h1>
      <div className="mt-6 flex flex-wrap items-center gap-6">
        {tags.length > 0 && (
          <p className="text-caption font-mono uppercase text-muted">
            {tags.join(", ")}
          </p>
        )}
        {project.link && <ProjectLinkButton href={project.link} />}
      </div>
      <div className="mt-12">
        <MarkdownContent content={project.content} />
      </div>
    </article>
  );
}
