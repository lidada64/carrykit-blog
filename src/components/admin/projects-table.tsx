"use client";

import Link from "next/link";
import { deleteProject } from "@/app/admin/(protected)/projects/actions";
import { useT } from "@/i18n";

export interface ProjectRow {
  id: string;
  title: string;
  slug: string;
  order: number;
  published: boolean;
}

const headerClass =
  "border-b border-border pb-2 text-left text-caption font-mono uppercase text-muted";
const cellClass = "border-b border-border py-3 pr-4 text-body";

/** 后台作品列表(US-M3):order/published + 编辑/删除(删除带 confirm) */
export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const t = useT();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-display">{t("admin.projectsLink")}</h1>
        <Link
          href="/admin/projects/new"
          className="border border-foreground px-4 py-2 text-caption font-mono uppercase"
        >
          {t("admin.newProject")}
        </Link>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={headerClass}>{t("admin.orderLabel")}</th>
            <th className={headerClass}>{t("admin.titleLabel")}</th>
            <th className={headerClass}>{t("admin.slugLabel")}</th>
            <th className={headerClass}>{t("admin.statusLabel")}</th>
            <th className={headerClass}></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td className={`${cellClass} font-mono text-caption`}>
                {project.order}
              </td>
              <td className={cellClass}>{project.title}</td>
              <td className={`${cellClass} font-mono text-caption`}>
                {project.slug}
              </td>
              <td className={`${cellClass} font-mono text-caption uppercase`}>
                {project.published
                  ? t("admin.statusPublished")
                  : t("admin.statusDraft")}
              </td>
              <td className={`${cellClass} text-right`}>
                <span className="flex justify-end gap-4">
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="text-caption font-mono uppercase text-muted hover:text-foreground"
                  >
                    {t("admin.editLink")}
                  </Link>
                  <form
                    action={deleteProject.bind(null, project.id)}
                    onSubmit={(event) => {
                      if (!window.confirm(t("admin.confirmDelete"))) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <button
                      type="submit"
                      className="cursor-pointer text-caption font-mono uppercase text-muted hover:text-accent"
                    >
                      {t("admin.deleteButton")}
                    </button>
                  </form>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
