"use server";

import type { Snapshot } from "@/lib/assistant/contracts";
import { agentCommand } from "@/lib/assistant/agent-client";
import { admission, assertOrigin, ipAdmission, visitor } from "@/lib/assistant/visitor";
import type { IpOperation } from "@/lib/assistant/ip-rate";
import { AssistantError, validId } from "@/lib/assistant/server-config";

type Result = { ok: true; snapshot: Snapshot } | { ok: false; code: string; retryable: boolean; requestId: string };
type Command = (owner: string) => Promise<Snapshot>;

async function execute(command: Command, operation: IpOperation = "control", create = false): Promise<Result> {
  try {
    await assertOrigin();
    // Consume the network bucket before a new cookie/visitor can be created.
    await ipAdmission(operation);
    const owner = await visitor(create);
    await admission(owner.id);
    return { ok: true, snapshot: await command(owner.id) };
  } catch (error) {
    const safe = error instanceof AssistantError ? error : new AssistantError("AGENT_UNAVAILABLE");
    return { ok: false, code: safe.code, retryable: safe.status >= 500, requestId: crypto.randomUUID() };
  }
}

function checkedId(value: unknown) {
  if (!validId(value)) throw new AssistantError("INVALID_INPUT", 400);
  return value;
}

export async function createConversation(locale: "en" | "zh"): Promise<Result> {
  return execute(owner => {
    if (locale !== "en" && locale !== "zh") throw new AssistantError("INVALID_INPUT", 400);
    return agentCommand(owner, "/v1/conversations", { contractVersion: 1, locale });
  }, "create", true);
}

export async function submitMessage(input: { conversationId: string; clientRequestId: string; text: string; locale: "en" | "zh"; contextPostId?: string }): Promise<Result> {
  return execute(owner => {
    const conversationId = checkedId(input.conversationId);
    checkedId(input.clientRequestId);
    if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 8000
      || Buffer.byteLength(input.text) > 30 * 1024 || !["en", "zh"].includes(input.locale)
      || (input.contextPostId !== undefined && !validId(input.contextPostId))) throw new AssistantError("INVALID_INPUT", 400);
    return agentCommand(owner, `/v1/conversations/${conversationId}/runs`, { contractVersion: 1, ...input });
  }, "submit");
}

export async function cancelRun(conversationId: string, runId: string): Promise<Result> {
  return execute(owner => agentCommand(owner, `/v1/runs/${checkedId(runId)}/cancel`, { contractVersion: 1, conversationId: checkedId(conversationId) }));
}

export async function closeConversation(conversationId: string): Promise<Result> {
  return execute(owner => agentCommand(owner, `/v1/conversations/${checkedId(conversationId)}/close`, { contractVersion: 1 }));
}

export async function restartConversation(conversationId: string, locale: "en" | "zh"): Promise<Result> {
  return execute(async owner => {
    if (!validId(conversationId) || !["en", "zh"].includes(locale)) throw new AssistantError("INVALID_INPUT", 400);
    await agentCommand(owner, `/v1/conversations/${conversationId}/close`, { contractVersion: 1 });
    return agentCommand(owner, "/v1/conversations", { contractVersion: 1, locale });
  }, "create");
}
