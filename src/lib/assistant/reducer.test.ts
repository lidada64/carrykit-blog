import assert from "node:assert/strict";
import { test } from "node:test";
import { emptySnapshot, type PublicEvent, type Snapshot } from "./contracts";
import { sessionReducer } from "./reducer";

const initial = emptySnapshot("conversation");
const envelope = { contractVersion: 1 as const, conversationId: "conversation", runId: "run", occurredAt: "2026-10-26T00:00:00Z" };
function apply(state: Snapshot, event: PublicEvent) { return sessionReducer(state, { type: "event", event }); }
const accepted: PublicEvent = { ...envelope, seq: 1, type: "run.accepted", data: { message: { id: "question", role: "user", text: "question", sources: [] } } };
const answer: PublicEvent = { ...envelope, seq: 2, type: "answer.committed", data: { message: { id: "answer", role: "assistant", text: "withdrawable content", sources: [{ type: "post", postId: "post", locale: "en", revision: "1", title: "source", url: "/blog" }] } } };

test("duplicate acceptance does not duplicate a question", () => {
  const state = apply(initial, accepted);
  assert.equal(apply(state, accepted), state);
  assert.equal(state.messages.length, 1);
});
test("foreign conversation and run events cannot modify a session", () => {
  const state = apply(initial, accepted);
  assert.equal(apply(state, { ...answer, conversationId: "foreign" }), state);
  assert.equal(apply(state, { ...answer, runId: "foreign" }), state);
});
test("cancelled run rejects late answers", () => {
  const state = apply(apply(initial, accepted), { ...envelope, seq: 2, type: "run.terminal", data: { state: "cancelled" } });
  assert.equal(apply(state, { ...answer, seq: 3 }), state);
});
test("closing a conversation fences late acceptance and answer", () => {
  const state = sessionReducer(apply(initial, accepted), { type: "close" });
  assert.equal(apply(state, answer), state);
  assert.equal(apply(state, { ...accepted, runId: "new", seq: 3 }), state);
});
test("source withdrawal removes answer text and sources after completion", () => {
  let state = apply(apply(initial, accepted), answer);
  state = apply(state, { ...envelope, seq: 3, type: "run.terminal", data: { state: "completed" } });
  state = apply(state, { ...envelope, seq: 4, type: "answer.invalidated", data: { messageId: "answer" } });
  assert.deepEqual(state.messages[1], { id: "answer", role: "assistant", text: "", sources: [], invalidated: true });
});
test("a new conversation snapshot cannot inherit previous messages", () => {
  const state = sessionReducer(apply(initial, accepted), { type: "snapshot", snapshot: emptySnapshot("next") });
  assert.equal(state.messages.length, 0);
  assert.equal(apply(state, answer), state);
});
test("a subsequent run starts its own sequence at one", () => {
  let state = apply(initial, accepted);
  state = apply(state, { ...envelope, seq: 20, type: "run.terminal", data: { state: "completed" } });
  state = apply(state, { ...accepted, runId: "next-run", seq: 1, data: { message: { id: "next-question", role: "user", text: "next", sources: [] } } });
  assert.equal(state.cursor, 1);
  assert.equal(state.runId, "next-run");
  assert.equal(state.messages.length, 2);
});
test("an active run cannot be replaced by another acceptance", () => {
  const state = apply(initial, accepted);
  assert.equal(apply(state, { ...accepted, runId: "new", seq: 1 }), state);
});
test("cancelling fences late answer before terminal acknowledgement", () => {
  const state = sessionReducer(apply(initial, accepted), { type: "cancel" });
  assert.equal(apply(state, answer), state);
});
test("an old run withdrawal clears its answer while preserving active run cursor", () => {
  let state = apply(apply(initial, accepted), answer);
  state = apply(state, { ...envelope, seq: 3, type: "run.terminal", data: { state: "completed" } });
  state = apply(state, { ...accepted, runId: "next", seq: 1, data: { message: { id: "next-question", role: "user", text: "next", sources: [] } } });
  state = apply(state, { ...envelope, seq: 4, type: "answer.invalidated", data: { messageId: "answer" } });
  assert.equal(state.messages[1].text, "");
  assert.equal(state.messages[1].sources.length, 0);
  assert.equal(state.runId, "next");
  assert.equal(state.cursor, 1);
  assert.equal(state.state, "queued");
});
test("old acceptance replay cannot reopen a completed run", () => {
  const state = apply(apply(initial, accepted), { ...envelope, seq: 8, type: "run.terminal", data: { state: "completed" } });
  assert.equal(apply(state, { ...accepted, seq: 9 }), state);
  assert.deepEqual(apply({ ...state, runId: "later" }, { ...accepted, seq: 1 }), { ...state, runId: "later" });
});
