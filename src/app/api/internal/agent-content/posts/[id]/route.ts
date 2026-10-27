import { contentRequest } from "@/lib/assistant/content-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return contentRequest(request, "read", (await context.params).id); }
