"use client";

import { useActionState } from "react";
import {
  saveProject,
  type ProjectFormState,
} from "@/app/admin/(protected)/projects/actions";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { useT } from "@/i18n";

export interface ProjectFormValues {
  id: string;
  title: string;
  slug: string;
  summary: string;
  coverImage: string;
  tags: string;
  link: string;
  content: string;
  order: number;
  published: boolean;
}

const initialState: ProjectFormState = { error: "" };

const labelClass =
  "flex flex-col gap-1 text-caption font-mono uppercase text-muted";
const inputClass =
  "border border-border bg-background px-3 py-2 font-body text-body normal-case tracking-normal text-foreground";

/** 作品新建/编辑共用表单(US-M3):含 order 排序与 published 开关 */
export function ProjectForm({ project }: { project?: ProjectFormValues }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(
    saveProject,
    initialState,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-heading font-display">
        {project ? t("admin.editProject") : t("admin.newProject")}
      </h1>
      <form action={formAction} className="mt-8 flex flex-col gap-4">
        {project && <input type="hidden" name="id" value={project.id} />}
        <label className={labelClass}>
          {t("admin.titleLabel")}
          <input
            name="title"
            required
            defaultValue={project?.title}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("admin.slugLabel")}
          <input
            name="slug"
            required
            defaultValue={project?.slug}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("admin.summaryLabel")}
          <input
            name="summary"
            defaultValue={project?.summary}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("admin.coverImageLabel")}
          <input
            name="coverImage"
            type="url"
            defaultValue={project?.coverImage}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("admin.tagsFieldLabel")}
          <input
            name="tags"
            defaultValue={project?.tags}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("admin.linkFieldLabel")}
          <input
            name="link"
            type="url"
            defaultValue={project?.link}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 items-end gap-4">
          <label className={labelClass}>
            {t("admin.orderLabel")}
            <input
              name="order"
              type="number"
              defaultValue={project?.order ?? 0}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 py-2 text-caption font-mono uppercase text-muted">
            <input
              type="checkbox"
              name="published"
              defaultChecked={project?.published ?? true}
            />
            {t("admin.publishedLabel")}
          </label>
        </div>
        <div className={labelClass}>
          {t("admin.contentLabel")}
          <MarkdownEditor
            name="content"
            rows={12}
            defaultValue={project?.content}
            className={inputClass}
          />
        </div>
        {state.error && (
          <p role="alert" className="text-caption text-accent">
            {state.error === "slugTaken"
              ? t("admin.slugTakenError")
              : t("admin.invalidError")}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer self-start border border-foreground px-4 py-2 text-caption font-mono uppercase disabled:opacity-50"
        >
          {t("admin.saveButton")}
        </button>
      </form>
    </div>
  );
}
