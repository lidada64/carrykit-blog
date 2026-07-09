import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * session 读写(ARCHITECTURE §4):iron-session 加密 cookie,httpOnly、7 天。
 * 密钥来自 SESSION_SECRET 环境变量(.env.example),缺失时直接抛错,禁止内置默认密钥。
 */

export interface SessionData {
  userId?: string;
}

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password) {
    throw new Error("SESSION_SECRET is not set — see .env.example");
  }
  return {
    cookieName: "carrykit_session",
    password,
    ttl: 60 * 60 * 24 * 7, // 7 天
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/** 写操作 Server Action 统一入口校验(AGENTS 代码规范):未登录直接重定向登录页 */
export async function requireAdmin(): Promise<void> {
  const session = await getSession();
  if (!session.userId) redirect("/admin/login");
}
