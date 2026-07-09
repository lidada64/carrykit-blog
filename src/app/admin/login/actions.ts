"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export interface LoginState {
  error: boolean;
}

/** 登录(US-M1):email + bcrypt 比对,成功签发 session 并进后台;失败返回错误态 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: true };
  }

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  redirect("/admin");
}

/** 登出:销毁 session 回登录页 */
export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/admin/login");
}
