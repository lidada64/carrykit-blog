"use client";

import { useActionState } from "react";
import {
  savePost,
  type PostFormState,
} from "@/app/admin/(protected)/posts/actions";
import { useT } from "@/i18n";

export interface PostFormValues {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  tags: string;
  content: string;
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-heading font-display">
        {post ? t("admin.editPost") : t("admin.newPost")}
      </h1>
      <form action={formAction} className="mt-8 flex flex-col gap-4">
        {post && <input type="hidden" name="id" value={post.id} />}
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
          {t("admin.slugLabel")}
          <input
            name="slug"
            required
            defaultValue={post?.slug}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("admin.excerptLabel")}
          <input
            name="excerpt"
            defaultValue={post?.excerpt}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("admin.coverImageLabel")}
          <input
            name="coverImage"
            type="url"
            defaultValue={post?.coverImage}
            className={inputClass}
          />
        </label>
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
        <label className={labelClass}>
          {t("admin.contentLabel")}
          <textarea
            name="content"
            required
            rows={16}
            defaultValue={post?.content}
            className={inputClass}
          />
        </label>
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
