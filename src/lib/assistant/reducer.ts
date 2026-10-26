import type { SessionAction, Snapshot } from "./contracts";

const terminal = new Set(["completed", "partial", "timed_out", "failed", "cancelled", "interrupted"]);

/** A snapshot is authoritative; subscriptions can only advance its matching run. */
export function sessionReducer(state: Snapshot, action: SessionAction): Snapshot {
  if (action.type === "snapshot") return action.snapshot;
  if (action.type === "close") return { ...state, conversation: "closed", state: state.runId && !terminal.has(state.state) ? "cancelling" : state.state };
  if (action.type === "cancel") return terminal.has(state.state) ? state : { ...state, state: "cancelling" };
  const event = action.event;
  if (event.contractVersion !== 1 || event.conversationId !== state.conversationId) return state;
  const newRun = event.runId !== state.runId;
  if (newRun && event.type === "answer.invalidated") {
    return { ...state, messages: state.messages.map((message) => message.id === event.data.messageId ? { ...message, text: "", sources: [], invalidated: true } : message) };
  }
  if (event.type === "run.accepted" && state.messages.some((message) => message.id === event.data.message.id)) return state;
  if (newRun && (event.type !== "run.accepted" || ["queued", "running", "reconnecting", "cancelling"].includes(state.state))) return state;
  if (!newRun && event.seq <= state.cursor) return state;
  if (state.conversation !== "active" && event.type !== "run.terminal" && event.type !== "answer.invalidated") return state;
  if (event.runId === state.runId && terminal.has(state.state) && event.type !== "answer.invalidated") return state;
  if (state.state === "cancelling" && event.type !== "run.terminal" && event.type !== "answer.invalidated") return state;
  const next = { ...state, cursor: event.seq, runId: event.runId };
  switch (event.type) {
    case "run.accepted": return { ...next, state: "queued", phase: "queued", messages: [...state.messages, event.data.message] };
    case "phase.changed": return { ...next, state: "running", phase: event.data.phase };
    case "budget.changed": return { ...next, budget: event.data.budget };
    case "answer.committed": return { ...next, messages: [...state.messages.filter((message) => message.id !== event.data.message.id), event.data.message] };
    case "answer.invalidated": return { ...next, messages: state.messages.map((message) => message.id === event.data.messageId ? { ...message, text: "", sources: [], invalidated: true } : message) };
    case "run.terminal": return { ...next, state: event.data.state, phase: null };
  }
}
