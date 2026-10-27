import "server-only";
import { assistantConfig, AssistantError } from "./server-config";
import { signInternalRequest } from "./signing";
import type { Snapshot } from "./contracts";

export async function agentRequest(subject: string, target: string, method = "GET", payload?: unknown, signal?: AbortSignal) {
  const config = assistantConfig();
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const scope = subject.startsWith("admin:") ? "qa:published:admin" : "qa:published";
  const signed = signInternalRequest({ secret: config.secret, method, target, body, subject, scope, audience: "agent-api" });
  try {
    const response = await fetch(`${config.base}${target}`, {
      method, headers: { ...signed, "Content-Type": "application/json" }, body: body || undefined,
      cache: "no-store", signal: signal ?? AbortSignal.timeout(15_000), redirect: "error",
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const candidate = data && typeof data === "object" && "code" in data ? String(data.code) : "AGENT_UNAVAILABLE";
      const allowed = new Set(["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "EXPIRED", "INVALID_INPUT", "RUN_ACTIVE", "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUDGET_EXHAUSTED", "RESET_REQUIRED", "CONTENT_UNAVAILABLE"]);
      throw new AssistantError(allowed.has(candidate) ? candidate : "AGENT_UNAVAILABLE", response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    throw new AssistantError("AGENT_UNAVAILABLE");
  }
}

export async function agentCommand(subject: string, target: string, payload: unknown): Promise<Snapshot> {
  const response = await agentRequest(subject, target, "POST", payload);
  const data = await response.json();
  const snapshot: Snapshot = data.snapshot ?? data;
  if (snapshot.contractVersion !== 1 || typeof snapshot.conversationId !== "string" || !Array.isArray(snapshot.messages)) throw new AssistantError("AGENT_UNAVAILABLE");
  return snapshot;
}
