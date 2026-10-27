import "server-only";
import { getIronSession } from "iron-session";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AssistantError, assistantConfig } from "./server-config";
import { CLIENT_IP_HEADER, consumeIpBucket, IpAdmissionError, ipRateBucket, type IpOperation } from "./ip-rate";

const TTL = 86_400;
interface VisitorCookie { visitorId?: string }

export async function assertOrigin() {
  const origin = (await headers()).get("origin");
  if (origin !== assistantConfig().origin) throw new AssistantError("FORBIDDEN", 403);
}

export async function ipAdmission(operation: IpOperation) {
  try {
    const bucket = ipRateBucket((await headers()).get(CLIENT_IP_HEADER), assistantConfig().visitorSecret,
      process.env.ASSISTANT_TRUST_PROXY_HEADER === "true", operation);
    await consumeIpBucket(bucket, async candidate => {
      const record = await db.accessBucket.upsert({
        where: { key: candidate.key },
        create: { key: candidate.key, count: 1, expiresAt: candidate.expiresAt },
        update: { count: { increment: 1 } },
      });
      return record.count;
    });
  } catch (error) {
    if (error instanceof IpAdmissionError) throw new AssistantError(error.code, error.code === "RATE_LIMITED" ? 429 : 503);
    throw error;
  }
}

export async function visitor(create = false) {
  const config = assistantConfig();
  const admin = await getSession();
  if (admin.userId && await db.user.findUnique({ where: { id: admin.userId }, select: { id: true } })) {
    return { id: `admin:${admin.userId}` };
  }
  const session = await getIronSession<VisitorCookie>(await cookies(), {
    cookieName: "carrykit_visitor",
    password: config.visitorSecret,
    ttl: TTL,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
  });
  const now = new Date();
  if (session.visitorId) {
    const existing = await db.visitor.findUnique({ where: { id: session.visitorId } });
    if (existing && existing.expiresAt > now) return existing;
    if (!create) throw new AssistantError("EXPIRED", 410);
  }
  if (!create) throw new AssistantError("UNAUTHENTICATED", 401);
  const created = await db.visitor.create({ data: { expiresAt: new Date(now.getTime() + TTL * 1000) } });
  session.visitorId = created.id;
  await session.save();
  return created;
}

export async function admission(subject: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const bucket = await db.accessBucket.upsert({
    where: { key: `${subject}:${minute}` },
    create: { key: `${subject}:${minute}`, count: 1, expiresAt: new Date((minute + 2) * 60_000) },
    update: { count: { increment: 1 } },
  });
  if (bucket.count > 20) throw new AssistantError("RATE_LIMITED", 429);
}
