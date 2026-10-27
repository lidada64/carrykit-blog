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
    if (!validId(id)) throw new AssistantError("NOT_FOUND", 404);
    const upstream = await agentRequest(owner.id, `/v1/conversations/${id}`);
    return Response.json(await upstream.json(), { headers: { "Cache-Control": "private, no-store, no-transform" } });
  } catch (error) { return errorResponse(error); }
}
