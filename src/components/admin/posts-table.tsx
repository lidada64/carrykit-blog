"use client";

import Link from "next/link";
import { deletePost } from "@/app/admin/(protected)/posts/actions";
import { useT } from "@/i18n";

export interface PostRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  /** 已格式化日期(YYYY.MM.DD),未发布为空串 */
  date: string;
}

const headerClass =
  "border-b border-border pb-2 text-left text-caption font-mono uppercase text-muted";
const cellClass = "border-b border-border py-3 pr-4 text-body";

/** 后台文章列表(US-M2):状态/发布时间 + 编辑/删除(删除带 confirm) */
export function PostsTable({ posts }: { posts: PostRow[] }) {
  const t = useT();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-display">{t("admin.postsLink")}</h1>
        <Link
          href="/admin/posts/new"
          className="border border-foreground px-4 py-2 text-caption font-mono uppercase"
        >
          {t("admin.newPost")}
        </Link>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={headerClass}>{t("admin.titleLabel")}</th>
            <th className={headerClass}>{t("admin.slugLabel")}</th>
            <th className={headerClass}>{t("admin.statusLabel")}</th>
            <th className={headerClass}>{t("admin.publishedAtLabel")}</th>
            <th className={headerClass}></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id}>
              <td className={cellClass}>{post.title}</td>
              <td className={`${cellClass} font-mono text-caption`}>
                {post.slug}
              </td>
              <td className={`${cellClass} font-mono text-caption uppercase`}>
                {post.status === "PUBLISHED"
                  ? t("admin.statusPublished")
                  : t("admin.statusDraft")}
              </td>
              <td className={`${cellClass} font-mono text-caption`}>
                {post.date}
              </td>
              <td className={`${cellClass} text-right`}>
                <span className="flex justify-end gap-4">
                  <Link
                    href={`/admin/posts/${post.id}`}
                    className="text-caption font-mono uppercase text-muted hover:text-foreground"
                  >
                    {t("admin.editLink")}
                  </Link>
                  <form
                    action={deletePost.bind(null, post.id)}
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
