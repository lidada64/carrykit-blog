export const CONTRACT_VERSION = 1;
export const INPUT_LIMIT = 8_000;
export type RunState = "idle" | "queued" | "running" | "reconnecting" | "completed" | "partial" | "timed_out" | "failed" | "cancelling" | "cancelled" | "interrupted";
export type Scenario = "completed" | "queued" | "partial" | "failed" | "timed_out" | "reconnecting" | "expired" | "warned" | "fallback" | "blocked" | "invalidated" | "unavailable";
export const scenarios: Scenario[] = ["completed", "queued", "partial", "failed", "timed_out", "reconnecting", "expired", "warned", "fallback", "blocked", "invalidated", "unavailable"];
export type Source = { type: "post"; postId: string; locale: "en" | "zh"; revision: string; title: string; url: string };
export type Message = { id: string; role: "user" | "assistant"; text: string; sources: Source[]; invalidated?: boolean };
export type Snapshot = {
  contractVersion: 1;
  conversationId: string;
  runId: string | null;
  cursor: number;
  state: RunState;
  conversation: "active" | "closed" | "expired";
  budget: "normal" | "warned" | "fallback" | "blocked";
  phase: "queued" | "retrieving" | "reading" | "generating" | "validating" | null;
  messages: Message[];
};
type Payload =
  | { type: "run.accepted"; data: { message: Message } }
  | { type: "phase.changed"; data: { phase: NonNullable<Snapshot["phase"]> } }
  | { type: "answer.committed"; data: { message: Message } }
  | { type: "answer.invalidated"; data: { messageId: string } }
  | { type: "budget.changed"; data: { budget: Snapshot["budget"] } }
  | { type: "run.terminal"; data: { state: RunState } };
export type PublicEvent = { contractVersion: 1; conversationId: string; runId: string; seq: number; occurredAt: string } & Payload;
export type SessionAction = { type: "snapshot"; snapshot: Snapshot } | { type: "event"; event: PublicEvent } | { type: "close" } | { type: "cancel" };
export interface AssistantTransport {
  snapshot(): Snapshot;
  submit(text: string, requestId: string, scenario: Scenario): void;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
  cancel(): void;
  close(): void;
  dispose(): void;
}
export function emptySnapshot(conversationId: string): Snapshot {
  return { contractVersion: CONTRACT_VERSION, conversationId, runId: null, cursor: 0, state: "idle", conversation: "active", budget: "normal", phase: null, messages: [] };
}
