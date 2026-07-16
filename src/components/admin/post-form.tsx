"use client";

import { useActionState, useRef, useState } from "react";
import {
  savePost,
  type PostFormState,
} from "@/app/admin/(protected)/posts/actions";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { ImageUploader } from "@/components/admin/image-uploader";
import { useT } from "@/i18n";
import { translateContent } from "@/app/admin/(protected)/translate/actions";

export interface PostFormValues {
  id: string;
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  excerptEn: string;
  coverImage: string;
  tags: string;
  content: string;
  contentEn: string;
  status: string;
  /** yyyy-MM-dd,空串表示未设置 */
  publishedAt: string;
}

const initialState: PostFormState = { error: "" };

const labelClass =
  "flex flex-col gap-1 text-caption font-mono uppercase text-muted";
const inputClass =
  "border border-border bg-background px-3 py-2 font-body text-body normal-case tracking-normal text-foreground";

/** 文章新建/编辑共用表单(US-M2):Markdown 预览在 M2-4 接入 */
export function PostForm({ post }: { post?: PostFormValues }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(savePost, initialState);
  const [isTranslating, setIsTranslating] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleTranslate = async () => {
    if (!formRef.current) return;
    const form = formRef.current;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const excerpt = (form.elements.namedItem("excerpt") as HTMLInputElement).value;
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
      setReactValue("excerptEn", data?.excerpt || "");
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
          {post ? t("admin.editPost") : t("admin.newPost")}
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
        {post && <input type="hidden" name="id" value={post.id} />}
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            {t("admin.titleLabel")}
            <input
              name="title"
              required
              defaultValue={post?.title}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            {t("admin.titleEnLabel")}
            <input
              name="titleEn"
              defaultValue={post?.titleEn}
              className={inputClass}
            />
          </label>
        </div>
        <label className={labelClass}>
          {t("admin.slugLabel")}
          <input
            name="slug"
            required
            defaultValue={post?.slug}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            {t("admin.excerptLabel")}
            <input
              name="excerpt"
              defaultValue={post?.excerpt}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            {t("admin.excerptEnLabel")}
            <input
              name="excerptEn"
              defaultValue={post?.excerptEn}
              className={inputClass}
            />
          </label>
        </div>
        <div className={labelClass}>
          {t("admin.coverImageLabel")}
          <ImageUploader
            name="coverImage"
            defaultValue={post?.coverImage}
          />
        </div>
        <label className={labelClass}>
          {t("admin.tagsFieldLabel")}
          <input name="tags" defaultValue={post?.tags} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            {t("admin.statusLabel")}
            <select
              name="status"
              defaultValue={post?.status ?? "DRAFT"}
              className={inputClass}
            >
              <option value="DRAFT">{t("admin.statusDraft")}</option>
              <option value="PUBLISHED">{t("admin.statusPublished")}</option>
            </select>
          </label>
          <label className={labelClass}>
            {t("admin.publishedAtLabel")}
            <input
              name="publishedAt"
              type="date"
              defaultValue={post?.publishedAt}
              className={inputClass}
            />
          </label>
        </div>
        <div className={labelClass}>
          {t("admin.contentLabel")}
          <MarkdownEditor
            name="content"
            rows={16}
            defaultValue={post?.content}
            className={inputClass}
          />
        </div>
        <div className={labelClass}>
          {t("admin.contentEnLabel")}
          <MarkdownEditor
            name="contentEn"
            rows={16}
            defaultValue={post?.contentEn}
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
