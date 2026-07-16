"use client";

import { useActionState, useRef, useState } from "react";
import {
  saveProject,
  type ProjectFormState,
} from "@/app/admin/(protected)/projects/actions";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { ImageUploader } from "@/components/admin/image-uploader";
import { useT } from "@/i18n";
import { translateContent } from "@/app/admin/(protected)/translate/actions";

export interface ProjectFormValues {
  id: string;
  title: string;
  titleEn: string;
  slug: string;
  summary: string;
  summaryEn: string;
  coverImage: string;
  tags: string;
  link: string;
  content: string;
  contentEn: string;
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
  const [isTranslating, setIsTranslating] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleTranslate = async () => {
    if (!formRef.current) return;
    const form = formRef.current;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const excerpt = (form.elements.namedItem("summary") as HTMLInputElement).value;
    const content = (form.elements.namedItem("content") as HTMLTextAreaElement).value;
    if (!title && !content) return;

    try {
      setIsTranslating(true);
      const res = await translateContent({ title, excerpt, content });
      
      if (res.error) {
        alert("Translation failed: " + res.error);
        console.error(res.error);
        return;
      }
      
      const data = res.data;
      
      const setReactValue = (name: string, value: string, isTextarea = false) => {
        const el = form.elements.namedItem(name);
        if (el) {
          const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter?.call(el, value);
          (el as HTMLInputElement | HTMLTextAreaElement).dispatchEvent(new Event("input", { bubbles: true }));
        }
      };

      setReactValue("titleEn", data?.title || "");
      setReactValue("summaryEn", data?.excerpt || "");
      setReactValue("contentEn", data?.content || "", true);
    } catch (e) {
      alert("Translation failed");
      console.error(e);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-display">
          {project ? t("admin.editProject") : t("admin.newProject")}
        </h1>
        <button
          type="button"
          onClick={handleTranslate}
          disabled={isTranslating}
          className="cursor-pointer border border-foreground px-4 py-2 text-caption font-mono uppercase disabled:opacity-50"
        >
          {isTranslating ? t("admin.translatingText") : t("admin.translateButton")}
        </button>
      </div>
      <form ref={formRef} action={formAction} className="mt-8 flex flex-col gap-4">
        {project && <input type="hidden" name="id" value={project.id} />}
        <div className="grid grid-cols-2 gap-4">
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
            {t("admin.titleEnLabel")}
            <input
              name="titleEn"
              defaultValue={project?.titleEn}
              className={inputClass}
            />
          </label>
        </div>
        <label className={labelClass}>
          {t("admin.slugLabel")}
          <input
            name="slug"
            required
            defaultValue={project?.slug}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            {t("admin.summaryLabel")}
            <input
              name="summary"
              defaultValue={project?.summary}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            {t("admin.summaryEnLabel")}
            <input
              name="summaryEn"
              defaultValue={project?.summaryEn}
              className={inputClass}
            />
          </label>
        </div>
        <div className={labelClass}>
          {t("admin.coverImageLabel")}
          <ImageUploader
            name="coverImage"
            defaultValue={project?.coverImage}
          />
        </div>
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
        <div className={labelClass}>
          {t("admin.contentEnLabel")}
          <MarkdownEditor
            name="contentEn"
            rows={12}
            defaultValue={project?.contentEn}
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
