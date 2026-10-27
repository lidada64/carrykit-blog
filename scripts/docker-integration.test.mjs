import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = "carrykit-integration-test-20261026";

function compose(files, projectName = project) {
  const temporary = mkdtempSync(join(tmpdir(), "carrykit-compose-config-"));
  const envFile = join(temporary, "synthetic.env");
  writeFileSync(envFile, [
    "SESSION_SECRET=synthetic-session-value-for-compose-validation-only",
    "BLOG_DATA_VOLUME=existing-blog-data-fixture",
    "CADDY_DATA_VOLUME=existing-caddy-data-fixture",
    "CADDY_CONFIG_VOLUME=existing-caddy-config-fixture",
    "ASSISTANT_ENABLED=false",
    "AGENT_WEB_ENABLED=false",
  ].join("\n"));
  try {
    const args = ["compose", "--project-name", projectName, "--env-file", envFile,
      ...files.flatMap(file => ["-f", file]), "config", "--format", "json"];
    const result = spawnSync("docker", args, { cwd: root, encoding: "utf8", timeout: 20000, windowsHide: true });
    assert.equal(result.status, 0, "Docker Compose configuration must parse; no daemon is needed");
    return JSON.parse(result.stdout);
  } finally {
    rmSync(envFile);
    rmdirSync(temporary);
  }
}

test("isolated Compose uses new volumes, loopback TLS and no host Agent port", () => {
  const config = compose(["docker-compose.integration-test.yml"]);
  assert.equal(config.name, project);
  assert.equal(config.services.app.environment.ASSISTANT_ENABLED, "false");
  assert.equal(config.services.agent.environment.AGENT_WEB_ENABLED, "false");
  assert.deepEqual(config.services.agent.ports ?? [], []);
  assert.equal(config.services.caddy.ports.length, 1);
  assert.equal(config.services.caddy.ports[0].host_ip, "127.0.0.1");
  assert.equal(config.services.caddy.ports[0].target, 443);
  assert.equal(config.services.app.environment.SITE_URL, "https://localhost:3443");
  for (const volume of Object.values(config.volumes)) {
    assert.equal(volume.external ?? false, false);
    assert.ok(volume.name.startsWith(`${project}_`));
    assert.ok(!volume.name.startsWith("carrykit-blog_"));
  }
  assert.deepEqual(config.services.agent.volumes.map(volume => volume.target).sort(), ["/data/index", "/data/runtime"]);
  assert.equal(config.services.agent.read_only, true);
  assert.ok(config.services.agent.cap_drop.includes("ALL"));
});

test("production overlay preserves explicit Blog volumes and separates Agent storage", () => {
  const config = compose(["docker-compose.yml", "docker-compose.preflight.yml", "docker-compose.agent.yml"], "production-config-fixture");
  assert.equal(config.volumes["db-data"].name, "existing-blog-data-fixture");
  assert.equal(config.volumes["db-data"].external, true);
  assert.equal(config.services.app.environment.ASSISTANT_ENABLED, "false");
  assert.equal(config.services.app.environment.ASSISTANT_PREVIEW_ENABLED, "false");
  assert.equal(config.services.agent.environment.AGENT_WEB_ENABLED, "false");
  assert.deepEqual(config.services.agent.ports ?? [], []);
  assert.deepEqual(config.services.agent.volumes.map(volume => volume.source).sort(), ["agent-index", "agent-runtime"]);
  assert.ok(!config.services.agent.volumes.some(volume => volume.source === "db-data"));
});

test("local proxy uses its own CA and the Agent image has a nonroot single worker", () => {
  const caddy = readFileSync(join(root, "scripts/caddy-integration-test.conf"), "utf8");
  assert.match(caddy, /https:\/\/localhost/u);
  assert.match(caddy, /tls internal/u);
  assert.doesNotMatch(caddy, /tls_insecure_skip_verify/u);
  const dockerfile = readFileSync(join(root, "../Agent/Dockerfile"), "utf8");
  assert.match(dockerfile, /USER agent/u);
  assert.match(dockerfile, /"--workers", "1"/u);
  assert.match(dockerfile, /pip install --no-cache-dir -r requirements-web\.lock/u);
  assert.doesNotMatch(dockerfile, /COPY \. \./u);
});
