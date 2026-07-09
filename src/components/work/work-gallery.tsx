import Image from "next/image";
import Link from "next/link";

export interface WorkGalleryProject {
  slug: string;
  title: string;
  summary: string;
  coverImage: string;
  tags: string[];
}

/**
 * Work 画廊静态布局(TASKS M1-4 / PRD US-W1 布局与移动端降级部分):
 * 桌面端为画廊版式的静态帧(大图 + 序号 + 一句话描述 + 右侧作品名列表,
 * 首个作品为当前态),滚动驱动切换与数字翻转(A5)在 M3-6 接入;
 * 移动端(< md)为纵向作品卡片列表(封面 + 标题 + summary + 标签)。
 */
export function WorkGallery({ projects }: { projects: WorkGalleryProject[] }) {
  const current = projects[0];
  if (!current) return null;

  return (
    <>
      {/* 桌面画廊静态帧 */}
      <section className="hidden py-24 md:grid md:min-h-[70vh] md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] md:items-center md:gap-16">
        <div className="flex flex-col gap-6">
          <Link
            href={`/work/${current.slug}`}
            className="relative block aspect-[16/10] w-full overflow-hidden bg-border/40"
          >
            {current.coverImage && (
              <Image
                src={current.coverImage}
                alt={current.title}
                fill
                priority
                sizes="(min-width: 768px) 70vw, 100vw"
                className="object-cover"
              />
            )}
          </Link>
          <div className="flex items-baseline gap-6">
            <span className="text-heading font-mono">01</span>
            <p className="max-w-[48ch] text-body text-muted">
              {current.summary}
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {projects.map((project, index) => (
            <li key={project.slug}>
              <Link
                href={`/work/${project.slug}`}
                className={
                  index === 0
                    ? "text-subheading"
                    : "text-subheading text-muted hover:text-foreground"
                }
              >
                {index === 0 && <span aria-hidden>— </span>}
                {project.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 移动端降级:纵向作品卡片列表 */}
      <section className="py-16 md:hidden">
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
                <h2 className="text-subheading">{project.title}</h2>
                {project.summary && (
                  <p className="text-body text-muted">{project.summary}</p>
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
