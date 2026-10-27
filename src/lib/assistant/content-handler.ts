import "server-only";
import { db } from "@/lib/db";
import { verifyInternalRequest } from "./signing";
import { AssistantError, assistantConfig, errorResponse, validId } from "./server-config";
import { manifestPage, publicPost, revision, type ContentLocale } from "./content";
import { boundedBody } from "./http-input";

export async function contentRequest(request: Request, operation: "manifest" | "search" | "read" | "validate", id?: string) {
  try {
    const config = assistantConfig();
    let body = "";
    try { body = operation === "validate" ? await boundedBody(request) : ""; }
    catch { throw new AssistantError("INVALID_INPUT", 400); }
    const url = new URL(request.url);
    let identity;
    try {
      identity = verifyInternalRequest({ secret: config.contentSecret, method: request.method, target: url.pathname + url.search, body, headers: request.headers, scope: "content:published", audience: "blog-content" });
    } catch { throw new AssistantError("FORBIDDEN", 403); }
    if (identity.subject !== "agent-service") throw new AssistantError("FORBIDDEN", 403);
    try {
      await db.serviceNonce.create({ data: { nonce: identity.nonce, expiresAt: new Date(identity.expiresAt * 1000) } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AssistantError("FORBIDDEN", 403);
      throw new AssistantError("AGENT_UNAVAILABLE");
    }
    const requested = url.searchParams.get("locale") ?? "en";
    if (requested !== "en" && requested !== "zh") throw new AssistantError("INVALID_INPUT", 400);
    const locale: ContentLocale = requested;
    let result: unknown;
    if (operation === "read") {
      if (!validId(id)) throw new AssistantError("NOT_FOUND", 404);
      const post = await db.post.findFirst({ where: { id, status: "PUBLISHED" } });
      if (!post) throw new AssistantError("NOT_FOUND", 404);
      result = publicPost(post, locale, config.origin);
    } else if (operation === "manifest") {
      const posts = await db.post.findMany({ where: { status: "PUBLISHED" }, orderBy: { id: "asc" }, take: 5001 });
      if (posts.length > 5000) throw new AssistantError("CONTENT_UNAVAILABLE");
      try { result = manifestPage(posts, locale, url.searchParams.get("cursor")); }
      catch { throw new AssistantError("CURSOR_INVALIDATED", 409); }
    } else if (operation === "search") {
      const q = url.searchParams.get("q") ?? "";
      if (!q.trim() || q.length > 256) throw new AssistantError("INVALID_INPUT", 400);
      const terms = q.trim().split(/\s+/).slice(0, 8);
      const posts = await db.post.findMany({
        where: { status: "PUBLISHED", OR: terms.flatMap(term => [{ title: { contains: term } }, { titleEn: { contains: term } }, { content: { contains: term } }, { contentEn: { contains: term } }]) },
        orderBy: { id: "asc" }, take: 5,
      });
      result = { posts: posts.map(post => {
        const item = publicPost(post, locale, config.origin)!;
        return { postId: item.postId, title: item.title, excerpt: item.excerpt, url: item.canonicalUrl, locale, revision: item.revision };
      }) };
    } else {
      let decoded: unknown;
      try { decoded = JSON.parse(body); } catch { throw new AssistantError("INVALID_INPUT", 400); }
      const items = Array.isArray(decoded) ? decoded : decoded && typeof decoded === "object" && "sources" in decoded ? decoded.sources : null;
      if (!Array.isArray(items) || items.length > 50 || items.some(item => !item || typeof item !== "object" || !validId(item.postId) || !["en", "zh"].includes(item.locale) || typeof item.revision !== "string" || !/^[a-f0-9]{64}$/.test(item.revision))) throw new AssistantError("INVALID_INPUT", 400);
      const posts = await db.post.findMany({ where: { id: { in: items.map(item => item.postId as string) }, status: "PUBLISHED" } });
      result = { results: items.map(item => {
        const post = posts.find(post => post.id === item.postId);
        return { postId: item.postId, locale: item.locale, revision: item.revision, status: !post ? "unavailable" : revision(post) === item.revision ? "valid" : "changed" };
      }) };
    }
    return Response.json(result, { headers: { "Cache-Control": "private, no-store, no-transform" } });
  } catch (error) { return errorResponse(error); }
}
