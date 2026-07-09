import { redirect } from "next/navigation";

/** /admin 无独立内容,直接进文章管理 */
export default function AdminIndexPage() {
  redirect("/admin/posts");
}
