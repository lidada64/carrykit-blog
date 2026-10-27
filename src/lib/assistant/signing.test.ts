import assert from "node:assert/strict";
import { test } from "node:test";
import { InternalAuthError, signInternalRequest, verifyInternalRequest } from "./signing";

const secret = "synthetic-fixture-secret-32-bytes-only";
const headers = { "x-agent-subject": "visitor-fixture", "x-agent-scope": "qa:published",
  "x-agent-audience": "agent-api", "x-agent-request-id": "11111111-1111-4111-8111-111111111111",
  "x-agent-nonce": "22222222-2222-4222-8222-222222222222", "x-agent-issued-at": "1800000000",
  "x-agent-expires-at": "1800000060", "x-agent-signature": "dd1c9bc8d62a242f3528257a646612a9c06baf750718821acf13fc7b05a4ab6f" };
const request = { secret, method: "POST", target: "/v1/conversations?locale=zh", body: '{"text":"你好"}',
  headers, scope: "qa:published", audience: "agent-api", nowSeconds: 1800000001 };

test("Python-generated UTF8 vector verifies in Node with request target intact", () => {
  assert.equal(verifyInternalRequest(request).subject, "visitor-fixture");
});
test("tampered body, method, query, subject, audience and signature fail closed", () => {
  for (const change of [{ body: '{"text":"other"}' }, { method: "GET" }, { target: "/v1/conversations" },
    { headers: { ...headers, "x-agent-subject": "another-visitor" } },
    { audience: "blog-content" }, { headers: { ...headers, "x-agent-signature": "00".repeat(32) } }]) {
    assert.throws(() => verifyInternalRequest({ ...request, ...change }), InternalAuthError);
  }
});
test("expiry, future issue time, missing headers and duplicate names are rejected", () => {
  assert.throws(() => verifyInternalRequest({ ...request, nowSeconds: 1800000060 }), InternalAuthError);
  assert.throws(() => verifyInternalRequest({ ...request, nowSeconds: 1799999994 }), InternalAuthError);
  assert.throws(() => verifyInternalRequest({ ...request, headers: {} }), InternalAuthError);
  assert.throws(() => verifyInternalRequest({ ...request, headers: { ...headers, "X-Agent-Subject": "visitor-fixture" } }), InternalAuthError);
});
test("new signatures use independent request ids and nonces; raw errors hide secrets", () => {
  const data = { secret, method: "GET", target: "/v1/conversations/fixture", subject: "owner",
    scope: "qa:published", audience: "agent-api", nowSeconds: 1800000000 };
  const first = signInternalRequest(data), second = signInternalRequest(data);
  assert.notEqual(first["x-agent-nonce"], second["x-agent-nonce"]);
  assert.equal(verifyInternalRequest({ ...data, headers: first }).subject, "owner");
  assert.throws(() => signInternalRequest({ ...data, target: "//untrusted/path" }), InternalAuthError);
  assert.throws(() => signInternalRequest({ ...data, secret: "short" }), (error: unknown) =>
    error instanceof InternalAuthError && !error.message.includes("short"));
});
