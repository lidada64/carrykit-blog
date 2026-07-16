import Image from "next/image";
import Link from "next/link";
import { ScrollGallery } from "@/components/motion/scroll-gallery";
import { Bilingual } from "@/components/ui/bilingual";

export interface WorkGalleryProject {
  slug: string;
  title: string;
  titleEn?: string | null;
  summary: string;
  summaryEn?: string | null;
  coverImage: string;
  tags: string[];
}

/**
 * Work 页(PRD US-W1):
 * md+ 且未减弱动态 → 滚动驱动画廊(A5,components/motion/scroll-gallery);
 * < md 或 prefers-reduced-motion → 纵向作品卡片静态列表(CSS 变体切换)。
 */
export function WorkGallery({ projects }: { projects: WorkGalleryProject[] }) {
  if (projects.length === 0) return null;

  return (
    <>
      <ScrollGallery
        projects={projects.map(({ slug, title, titleEn, summary, summaryEn, coverImage }) => ({
          slug,
          title,
          titleEn,
          summary,
          summaryEn,
          coverImage,
        }))}
      />

      {/* 静态降级:< md 或 reduced-motion 时展示 */}
      <section className="py-16 motion-safe:md:hidden">
        <ul className="flex flex-col gap-12">
          {projects.map((project) => (
            <li key={project.slug}>
              <Link
                href={`/work/${project.slug}`}
                className="flex flex-col gap-3"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-border/40">
                  {project.coverImage && (
                    <Image
                      src={project.coverImage}
                      alt={project.title}
                      fill
                      sizes="100vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <h2 className="text-subheading">
                  <Bilingual zh={project.title} en={project.titleEn} asBlock />
                </h2>
                {project.summary && (
                  <p className="text-body text-muted">
                    <Bilingual zh={project.summary} en={project.summaryEn} asBlock />
                  </p>
                )}
                {project.tags.length > 0 && (
                  <p className="text-caption font-mono uppercase text-muted">
                    {project.tags.join(", ")}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
