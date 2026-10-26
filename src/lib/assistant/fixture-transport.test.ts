import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureTransport } from "./fixture-transport";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("queued double submission accepts one question and cancellation prevents later completion", async () => {
  const transport = createFixtureTransport("answer", "preset", "source");
  transport.submit("question", "request", "queued");
  transport.submit("question", "request", "queued");
  transport.submit("another question", "another", "completed");
  assert.equal(transport.snapshot().messages.length, 1);
  transport.cancel();
  await wait(1500);
  assert.equal(transport.snapshot().state, "cancelled");
  assert.equal(transport.snapshot().messages.length, 1);
  transport.dispose();
});

test("a fallback conversation cannot use another scenario to produce a model-style answer", async () => {
  const transport = createFixtureTransport("answer", "preset", "source", "fallback");
  transport.submit("question", "request", "completed");
  await wait(1500);
  assert.equal(transport.snapshot().messages[1].text, "preset");
  assert.equal(transport.snapshot().messages[1].sources.length, 0);
  assert.equal(transport.snapshot().budget, "fallback");
  transport.dispose();
});

test("blocked quota survives explicitly recreated preview transport", () => {
  const first = createFixtureTransport("answer", "preset", "source", "blocked");
  first.close();
  const next = createFixtureTransport("answer", "preset", "source", first.snapshot().budget);
  next.submit("question", "request", "completed");
  assert.equal(next.snapshot().budget, "blocked");
  assert.equal(next.snapshot().messages.length, 0);
  first.dispose();
  next.dispose();
});

test("subscribers receive expiry without polling or a fabricated event", () => {
  const transport = createFixtureTransport("answer", "preset", "source");
  let expired = false;
  transport.subscribe((snapshot) => { expired = snapshot.conversation === "expired"; });
  transport.submit("question", "request", "expired");
  assert.equal(expired, true);
  transport.dispose();
});
