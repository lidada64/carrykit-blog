import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function runSeed(env) {
  const writes = [];
  const errors = [];
  let disconnected = false;
  const database = Object.fromEntries(["post", "project", "user"].map(name => [name, {
    upsert: async data => { writes.push({ name, data }); },
    count: async () => 0,
  }]));
  database.$disconnect = async () => { disconnected = true; };
  const process = { env, exitCode: undefined };
  const completion = vm.runInNewContext(compiled, {
    exports: {}, process,
    console: { log() {}, error: error => errors.push(error.message) },
    require(name) {
      if (name === "dotenv/config") return {};
      if (name === "bcryptjs") return { hashSync: value => `hashed:${value}` };
      if (name === "@prisma/adapter-better-sqlite3") return { PrismaBetterSqlite3: class {} };
      if (name === "../src/generated/prisma/client") return { PrismaClient: class { constructor() { return database; } } };
      throw new Error(`Unexpected seed dependency: ${name}`);
    },
  });
  await completion;
  return { writes, errors, exitCode: process.exitCode, disconnected };
}

test("seed without an explicit nonblank admin password fails before all writes", async () => {
  for (const value of [undefined, "", " \t "]) {
    const result = await runSeed(value === undefined ? {} : { ADMIN_PASSWORD: value });
    assert.equal(result.exitCode, 1);
    assert.equal(result.writes.length, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /ADMIN_PASSWORD/);
    assert.equal(result.disconnected, true);
  }
});

test("seed hashes the supplied password and preserves existing admin credentials", async () => {
  const supplied = " synthetic-admin-fixture ";
  const result = await runSeed({ ADMIN_EMAIL: "seed@example.test", ADMIN_PASSWORD: supplied });
  assert.equal(result.exitCode, undefined);
  assert.equal(result.errors.length, 0);
  const user = result.writes.find(write => write.name === "user");
  assert.equal(user.data.create.email, "seed@example.test");
  assert.equal(user.data.create.passwordHash, `hashed:${supplied}`);
  assert.equal(Object.keys(user.data.update).length, 0);
  assert.ok(result.writes.some(write => write.name === "post"));
  assert.ok(result.writes.some(write => write.name === "project"));
  assert.equal(result.disconnected, true);
});
