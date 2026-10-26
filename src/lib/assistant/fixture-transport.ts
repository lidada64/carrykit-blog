import { emptySnapshot, type AssistantTransport, type PublicEvent, type Scenario, type Snapshot } from "./contracts";
import { sessionReducer } from "./reducer";

/** Entirely in memory: never contacts an Agent, provider, content API or MCP. */
export function createFixtureTransport(answer: string, fallback: string, sourceTitle: string, budget: Snapshot["budget"] = "normal"): AssistantTransport {
  let state = { ...emptySnapshot(crypto.randomUUID()), budget };
  let seq = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const listeners = new Set<(snapshot: Snapshot) => void>();
  const notify = () => listeners.forEach((listener) => listener(state));
  const requests = new Set<string>();
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const emit = (payload: Pick<PublicEvent, "type" | "data">) => {
    // The discriminated payload is only constructed by this adapter's fixed fixtures.
    const event = { ...payload, contractVersion: 1, conversationId: state.conversationId, runId: state.runId, seq: ++seq, occurredAt: new Date().toISOString() } as PublicEvent;
    state = sessionReducer(state, { type: "event", event });
    notify();
  };
  return {
    snapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    submit: (text, requestId, scenario: Scenario) => {
      if (requests.has(requestId) || state.conversation !== "active" || state.budget === "blocked" || ["queued", "running", "cancelling", "reconnecting"].includes(state.state)) return;
      requests.add(requestId);
      clear();
      const runId = crypto.randomUUID();
      state = { ...state, runId, state: "idle" };
      seq = 0;
      state = { ...state, cursor: 0 };
      emit({ type: "run.accepted", data: { message: { id: requestId, role: "user", text, sources: [] } } });
      if (scenario === "expired") { state = { ...state, conversation: "expired", state: "idle" }; notify(); return; }
      if (scenario === "unavailable") { emit({ type: "run.terminal", data: { state: "failed" } }); return; }
      if (["warned", "fallback", "blocked"].includes(scenario) && (state.budget !== "fallback" || scenario === "blocked")) emit({ type: "budget.changed", data: { budget: scenario as Snapshot["budget"] } });
      if (scenario === "blocked") { emit({ type: "run.terminal", data: { state: "failed" } }); return; }
      const schedule = (delay: number, fn: () => void) => { timers.push(setTimeout(fn, delay)); };
      schedule(500, () => emit({ type: "phase.changed", data: { phase: "generating" } }));
      if (scenario === "queued") { clear(); return; }
      if (scenario === "reconnecting") { schedule(650, () => { state = { ...state, state: "reconnecting" }; notify(); }); }
      schedule(1400, () => {
        if (scenario === "failed" || scenario === "timed_out") { emit({ type: "run.terminal", data: { state: scenario } }); return; }
        const id = crypto.randomUUID();
        emit({ type: "answer.committed", data: { message: { id, role: "assistant", text: state.budget === "fallback" ? fallback : answer, sources: state.budget === "fallback" ? [] : [{ type: "post", postId: "fixture", locale: "en", revision: "fixture-v1", title: sourceTitle, url: "/blog" }] } } });
        emit({ type: "run.terminal", data: { state: scenario === "partial" ? "partial" : "completed" } });
        if (scenario === "invalidated") schedule(1200, () => emit({ type: "answer.invalidated", data: { messageId: id } }));
      });
    },
    cancel: () => { clear(); if (state.runId) emit({ type: "run.terminal", data: { state: "cancelled" } }); },
    close: () => { clear(); state = sessionReducer(state, { type: "close" }); if (state.runId) emit({ type: "run.terminal", data: { state: "cancelled" } }); notify(); },
    dispose: () => { clear(); listeners.clear(); },
  };
}
