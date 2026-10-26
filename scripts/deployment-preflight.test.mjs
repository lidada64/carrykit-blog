import test from "node:test";
import assert from "node:assert/strict";
import { inspectDocker, parseEnvironment, validateEnvironment } from "./deployment-preflight.mjs";

const config = {
  SESSION_SECRET: "synthetic-test-value-01234567890123456789",
  SITE_URL: "https://portfolio.example.org",
  SITE_DOMAIN: "portfolio.example.org",
  ASSISTANT_PREVIEW_ENABLED: "false",
  COMPOSE_PROJECT_NAME: "existing-blog",
  BLOG_DATA_VOLUME: "existing-blog_db-data",
  CADDY_DATA_VOLUME: "existing-blog_caddy-data",
  CADDY_CONFIG_VOLUME: "existing-blog_caddy-config",
};

test("explicit production config passes without exposing values", () => {
  const checks = validateEnvironment(config);
  assert.ok(checks.every(check => check.ok));
  assert.ok(!JSON.stringify(checks).includes(config.SESSION_SECRET));
});
test("reject unsafe or missing production choices", () => {
  for (const update of [{ SITE_URL: "http://localhost" }, { ASSISTANT_PREVIEW_ENABLED: "true" }, { BLOG_DATA_VOLUME: "" }, { CADDY_DATA_VOLUME: config.BLOG_DATA_VOLUME }, { SITE_DOMAIN: "different.example.org" }, { NEXT_PUBLIC_AGENT_KEY: "synthetic" }, { COMPOSE_PROJECT_NAME: "" }]) {
    assert.ok(validateEnvironment({ ...config, ...update }).some(check => !check.ok));
  }
});
test("parser handles quotes and refuses expansion, duplicate and malformed data", () => {
  assert.deepEqual(parseEnvironment('# test\r\nSITE_URL="https://example.org"\nEMPTY=\n'), { SITE_URL: "https://example.org", EMPTY: "" });
  for (const text of ["KEY=$(command)", "KEY=`command`", "KEY=one\nKEY=two", 'KEY="unfinished', "export KEY=x", "KEY=two words"]) assert.throws(() => parseEnvironment(text));
});
test("Docker inspection verifies actual container mount, never creates a volume", () => {
  const commands = [];
  const execute = (binary, args) => {
    commands.push([binary, ...args]);
    if (args[0] === "ps") return { status: 0, stdout: "abc123\n" };
    if (args[0] === "inspect") return { status: 0, stdout: JSON.stringify([{ Mounts: [
      { Type: "volume", Destination: "/data", Name: config.BLOG_DATA_VOLUME },
      { Type: "volume", Destination: "/data", Name: config.CADDY_DATA_VOLUME },
      { Type: "volume", Destination: "/config", Name: config.CADDY_CONFIG_VOLUME },
    ] }]) };
    return { status: 0, stdout: "local\n" };
  };
  assert.ok(inspectDocker(config, execute).every(check => check.ok));
  assert.ok(commands.every(command => !command.includes("create")));
  assert.equal(inspectDocker(config, () => ({ status: 1, stdout: "" }))[0].ok, false);
  assert.equal(inspectDocker(config, (_binary, args) => args[0] === "ps" ? { status: 0, stdout: "abc123" } : { status: 0, stdout: "[]" })[0].ok, false);
});
