import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { getSession } from "@/lib/auth";

/** 鉴权守卫(ARCHITECTURE §4):本路由组内所有页面每次请求校验 session,未登录重定向登录页 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  if (!session.userId) redirect("/admin/login");

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 py-8">
      <AdminHeader />
      <main className="mt-8">{children}</main>
    </div>
  );
}
