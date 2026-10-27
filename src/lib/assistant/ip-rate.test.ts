import assert from "node:assert/strict";
import test from "node:test";
import { consumeIpBucket, IpAdmissionError, ipRateBucket, type IpBucket } from "./ip-rate";

const secret = "synthetic-ip-rate-secret-with-at-least-32-bytes";
const now = 1_800_000;

function bucket(ip = "203.0.113.8", operation: "create" | "submit" = "create", time = now): IpBucket {
  const result = ipRateBucket(ip, secret, true, operation, time);
  assert.ok(result);
  return result;
}

test("untrusted proxy, missing or malformed IP and local addresses fail closed without echoing the address", () => {
  assert.throws(() => ipRateBucket("203.0.113.8", secret, false, "create"), IpAdmissionError);
  assert.throws(() => ipRateBucket("203.0.113.8", "short", true, "submit"), IpAdmissionError);
  for (const address of [null, "", "unknown", "203.0.113.8, 198.51.100.8", " 203.0.113.8", "203.0.113.8:80", "127.1", "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "169.254.1.2", "0.0.0.0", "255.255.255.255", "::", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "fe80::1%eth0", "ff02::1"]) {
    assert.throws(() => ipRateBucket(address, secret, true, "submit"), error =>
      error instanceof IpAdmissionError && error.message === "AGENT_UNAVAILABLE");
  }
});

test("equivalent IPv4-mapped addresses and equivalent IPv6 /64 addresses cannot obtain new buckets", () => {
  assert.equal(bucket("203.0.113.8").key, bucket("::ffff:203.0.113.8").key);
  assert.equal(bucket("::ffff:cb00:7108").key, bucket("203.0.113.8").key);
  assert.equal(bucket("2001:db8:abcd:1::1").key, bucket("2001:0DB8:ABCD:0001:ffff:ffff:ffff:ffff").key);
  assert.notEqual(bucket("2001:db8:abcd:1::1").key, bucket("2001:db8:abcd:2::1").key);
  assert.notEqual(bucket("203.0.113.8").key, bucket("203.0.113.9").key);
});

test("operation, fixed window and secret separate opaque bucket keys and finite expiry", () => {
  const create = bucket(), submit = bucket("203.0.113.8", "submit");
  assert.equal(create.maximum, 5);
  assert.equal(submit.maximum, 30);
  assert.equal(create.expiresAt.getTime(), now + 660_000);
  assert.equal(submit.expiresAt.getTime(), now + 120_000);
  assert.match(create.key, /^assistant-ip:create:\d+:[0-9a-f]{64}$/u);
  assert.ok(!create.key.includes("203.0.113.8"));
  assert.notEqual(create.key, submit.key);
  assert.notEqual(create.key, bucket("203.0.113.8", "create", now + 600_000).key);
  assert.notEqual(create.key, ipRateBucket("203.0.113.8", secret + "other", true, "create", now)?.key);
});

test("clearing visitor cookies cannot reset the shared create bucket", async () => {
  const stored = new Map<string, number>();
  const increment = async (candidate: IpBucket) => {
    const next = (stored.get(candidate.key) ?? 0) + 1;
    stored.set(candidate.key, next);
    return next;
  };
  // Each attempt has a fresh visitor identity; only the trusted network enters the key.
  for (let attempt = 0; attempt < 5; attempt++) await consumeIpBucket(bucket(), increment);
  await assert.rejects(() => consumeIpBucket(bucket(), increment), error =>
    error instanceof IpAdmissionError && error.code === "RATE_LIMITED");
  await consumeIpBucket(bucket("198.51.100.8"), increment);
  await consumeIpBucket(bucket("203.0.113.8", "create", now + 600_000), increment);
});

test("concurrent admission decisions retain the limit with an atomic increment result", async () => {
  let count = 0;
  const outcomes = await Promise.allSettled(Array.from({ length: 40 }, () =>
    consumeIpBucket(bucket("203.0.113.8", "submit"), async () => ++count)));
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 30);
  assert.equal(outcomes.filter(result => result.status === "rejected").length, 10);
  assert.equal(count, 40);
});

test("cancel/close remain available after network rate exhaustion but still require trusted identity", async () => {
  const control = ipRateBucket("203.0.113.8", secret, true, "control", now);
  assert.equal(control, null);
  await consumeIpBucket(control, async () => { throw new Error("control must not increment a network bucket"); });
  assert.throws(() => ipRateBucket(null, secret, true, "control", now), IpAdmissionError);
  assert.throws(() => ipRateBucket("203.0.113.8", secret, false, "control", now), IpAdmissionError);
});

test("invalid clocks, corrupt counters and storage failures do not grant admission", async () => {
  for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5]) {
    assert.throws(() => ipRateBucket("203.0.113.8", secret, true, "submit", time), IpAdmissionError);
  }
  for (const count of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    await assert.rejects(() => consumeIpBucket(bucket(), async () => count), IpAdmissionError);
  }
  await assert.rejects(() => consumeIpBucket(bucket(), async () => { throw new Error("synthetic storage unavailable"); }), /synthetic storage unavailable/u);
});
