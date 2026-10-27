import { contentRequest } from "@/lib/assistant/content-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return contentRequest(request, "validate"); }
