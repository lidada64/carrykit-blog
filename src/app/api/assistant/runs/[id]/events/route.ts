import { agentRequest } from "@/lib/assistant/agent-client";
import { visitor } from "@/lib/assistant/visitor";
import { AssistantError, errorResponse, validId } from "@/lib/assistant/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new AssistantError("FORBIDDEN", 403);
    const owner = await visitor();
    const { id } = await context.params;
    const queryCursor = new URL(request.url).searchParams.get("after") ?? "0";
    const replayCursor = request.headers.get("last-event-id") ?? "0";
    if (!validId(id) || ![queryCursor, replayCursor].every(cursor => /^\d{1,12}$/.test(cursor))) throw new AssistantError("INVALID_INPUT", 400);
    // EventSource keeps the original URL on reconnect, but advances Last-Event-ID.
    const after = String(Math.max(Number(queryCursor), Number(replayCursor)));
    const upstream = await agentRequest(owner.id, `/v1/runs/${id}/events?after=${after}`, "GET", undefined, request.signal);
    if (!upstream.body || !upstream.headers.get("content-type")?.includes("text/event-stream")) throw new AssistantError("AGENT_UNAVAILABLE");
    return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) { return errorResponse(error); }
}
