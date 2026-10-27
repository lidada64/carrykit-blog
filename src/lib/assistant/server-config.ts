import "server-only";

export class AssistantError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}

export function assistantConfig() {
  if (process.env.ASSISTANT_ENABLED !== "true") throw new AssistantError("AGENT_UNAVAILABLE");
  const secret = process.env.AGENT_REQUEST_SECRET ?? "";
  const contentSecret = process.env.AGENT_CONTENT_SECRET ?? "";
  const visitorSecret = process.env.VISITOR_SESSION_SECRET ?? "";
  if ([secret, contentSecret, visitorSecret].some(value => Buffer.byteLength(value) < 32)
    || new Set([secret, contentSecret, visitorSecret, process.env.SESSION_SECRET]).size < 4) {
    throw new AssistantError("AGENT_UNAVAILABLE");
  }
  try {
    const base = new URL(process.env.AGENT_BASE_URL ?? "");
    const origin = new URL(process.env.SITE_URL ?? "http://localhost:3000");
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/"
      || !["http:", "https:"].includes(origin.protocol) || origin.username || origin.password
      || (process.env.NODE_ENV === "production" && origin.protocol !== "https:")) throw new Error();
    return { secret, contentSecret, visitorSecret, base: base.origin, origin: origin.origin };
  } catch { throw new AssistantError("AGENT_UNAVAILABLE"); }
}

export function assistantConfigured() {
  try { assistantConfig(); return true; } catch { return false; }
}

export function errorResponse(error: unknown) {
  const safe = error instanceof AssistantError ? error : new AssistantError("AGENT_UNAVAILABLE");
  return Response.json({ code: safe.code, retryable: safe.status >= 500, requestId: crypto.randomUUID() }, { status: safe.status, headers: { "Cache-Control": "private, no-store" } });
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
