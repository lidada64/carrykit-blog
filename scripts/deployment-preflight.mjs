import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Strict data parser: no shell sourcing, expansion, command execution or values in errors.
export function parseEnvironment(text) {
  const result = {};
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(trimmed);
    if (!match || Object.hasOwn(result, match[1])) throw new Error("Invalid or duplicate environment entry");
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      if (value.length < 2 || value.at(-1) !== value[0]) throw new Error("Invalid quoted entry");
      value = value.slice(1, -1);
    } else if (/\s/u.test(value)) throw new Error("Quote environment values containing spaces");
    if (/[\r\n\0]/u.test(value) || /\$|`/u.test(value)) throw new Error("Environment expansion is unsupported");
    result[match[1]] = value;
  }
  return result;
}

const volumeKeys = ["BLOG_DATA_VOLUME", "CADDY_DATA_VOLUME", "CADDY_CONFIG_VOLUME"];

export function validateEnvironment(env) {
  const checks = [];
  const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
  check("SESSION_SECRET: at least 32 characters", env.SESSION_SECRET?.length >= 32);
  let url;
  try { url = new URL(env.SITE_URL); } catch { /* invalid config */ }
  check("SITE_URL: production HTTPS origin", url && url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  check("SITE_DOMAIN: matches SITE_URL host", url && env.SITE_DOMAIN === url.host);
  check("ASSISTANT_PREVIEW_ENABLED: explicitly false", env.ASSISTANT_PREVIEW_ENABLED === "false");
  check("COMPOSE_PROJECT_NAME: explicit production project", /^[a-z0-9][a-z0-9_-]*$/u.test(env.COMPOSE_PROJECT_NAME ?? ""));
  for (const key of volumeKeys) check(`${key}: explicit existing volume name`, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(env[key] ?? ""));
  check("Volume roles use distinct names", new Set(volumeKeys.map(key => env[key])).size === 3);
  check("No public Agent/provider secret variables", !Object.keys(env).some(key => /^NEXT_PUBLIC_.*(?:SECRET|KEY|TOKEN|PASSWORD)/u.test(key)));
  return checks;
}

export function inspectDocker(env, execute = spawnSync) {
  const checks = [];
  // Docker output is consumed, never echoed: inspect can contain environment secrets.
  const run = args => execute("docker", args, { encoding: "utf8", timeout: 15000, windowsHide: true });
  const inventory = run(["ps", "-a", "--filter", `label=com.docker.compose.project=${env.COMPOSE_PROJECT_NAME}`, "--filter", "label=com.docker.compose.service=app", "--format", "{{.ID}}"]);
  const ids = (inventory.stdout ?? "").trim().split(/\s+/u).filter(Boolean);
  if (inventory.status !== 0 || ids.length !== 1) return [{ name: "Docker: exactly one existing app container for project", ok: false }];
  const inspected = run(["inspect", ids[0]]);
  let container;
  try { container = JSON.parse(inspected.stdout)[0]; } catch { /* sanitized failure */ }
  checks.push({ name: "Docker: app /data matches BLOG_DATA_VOLUME", ok: inspected.status === 0 && Boolean(container?.Mounts?.some(mount => mount.Type === "volume" && mount.Destination === "/data" && mount.Name === env.BLOG_DATA_VOLUME)) });
  const caddyInventory = run(["ps", "-a", "--filter", `label=com.docker.compose.project=${env.COMPOSE_PROJECT_NAME}`, "--filter", "label=com.docker.compose.service=caddy", "--format", "{{.ID}}"]);
  const caddyIds = (caddyInventory.stdout ?? "").trim().split(/\s+/u).filter(Boolean);
  let caddy;
  if (caddyInventory.status === 0 && caddyIds.length === 1) {
    const caddyInspection = run(["inspect", caddyIds[0]]);
    if (caddyInspection.status === 0) {
      try { caddy = JSON.parse(caddyInspection.stdout)[0]; } catch { /* sanitized failure */ }
    }
  }
  for (const [destination, key] of [["/data", "CADDY_DATA_VOLUME"], ["/config", "CADDY_CONFIG_VOLUME"]]) {
    checks.push({ name: `Docker: caddy ${destination} matches ${key}`, ok: Boolean(caddy?.Mounts?.some(mount => mount.Type === "volume" && mount.Destination === destination && mount.Name === env[key])) });
  }
  for (const key of volumeKeys) {
    const volume = run(["volume", "inspect", env[key], "--format", "{{.Driver}}"]);
    checks.push({ name: `Docker: ${key} exists with local driver`, ok: volume.status === 0 && volume.stdout?.trim() === "local" });
  }
  return checks;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] !== "--env-file" || args.slice(2).some(arg => arg !== "--inspect-docker") || args.length > 3) {
    console.error("Usage: node scripts/deployment-preflight.mjs --env-file <file> [--inspect-docker]");
    process.exitCode = 2;
    return;
  }
  let env;
  try { env = parseEnvironment(readFileSync(args[1], "utf8")); }
  catch { console.error("FAIL Environment file could not be read or parsed; values are hidden."); process.exitCode = 1; return; }
  const checks = validateEnvironment(env);
  if (args.includes("--inspect-docker") && checks.every(check => check.ok)) checks.push(...inspectDocker(env));
  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  console.log("Scope: Blog configuration checks only. Agent service, TLS, restore and public release acceptance remain separate.");
  if (!args.includes("--inspect-docker")) console.log("Docker inventory NOT checked; use --inspect-docker on the existing VPS.");
  process.exitCode = checks.every(check => check.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
