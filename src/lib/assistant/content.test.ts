import assert from "node:assert/strict";
import test from "node:test";
import { manifestPage, publicPost, revision, type PublishedPost } from "./content";
import { boundedBody } from "./http-input";

const post: PublishedPost = {
  id: "post-1", slug: "hello", status: "PUBLISHED", title: "标题", titleEn: "",
  excerpt: "摘要", excerptEn: "", content: "正文", contentEn: "", tags: "one, two",
  publishedAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-02T00:00:00Z"),
};

test("published adapter reports missing translation instead of inventing English", () => {
  const result = publicPost(post, "en", "https://example.org");
  assert.ok(result);
  assert.equal(result.contentLocale, "zh");
  assert.equal(result.fallback, true);
  assert.equal(result.requestedLocale, "en");
  assert.equal(result.contentMarkdown, "正文");
  assert.deepEqual(result.tags, ["one", "two"]);
  assert.equal(result.canonicalUrl, "https://example.org/blog/hello");
  assert.equal(publicPost({ ...post, status: "DRAFT" }, "zh", "https://example.org"), null);
});

test("revision changes for visibility, translation, content and publication fields", () => {
  const base = revision(post);
  for (const patch of [{ status: "DRAFT" }, { titleEn: "Changed" }, { content: "changed" }, { slug: "new" }, { tags: "new" }, { publishedAt: null }]) assert.notEqual(revision({ ...post, ...patch }), base);
  assert.equal(revision({ ...post }), base);
});

test("manifest cursor pins complete published corpus, not just current page", () => {
  const posts = Array.from({ length: 51 }, (_, index) => ({ ...post, id: `post-${index}` }));
  const first = manifestPage(posts, "en", null);
  assert.equal(first.items.length, 50);
  assert.ok(first.nextCursor);
  assert.equal(manifestPage(posts, "en", first.nextCursor).items.length, 1);
  assert.throws(() => manifestPage(posts.slice(0, 50), "en", first.nextCursor), /CURSOR_INVALIDATED/);
  assert.throws(() => manifestPage(posts.map((item, index) => index === 50 ? { ...item, content: "changed" } : item), "en", first.nextCursor), /CURSOR_INVALIDATED/);
  assert.throws(() => manifestPage(posts, "en", `${first.snapshotId}:99999`), /CURSOR_INVALIDATED/);
});

test("signed body reader rejects excessive byte counts and malformed UTF8", async () => {
  const small = new Request("http://localhost/", { method: "POST", body: '{"text":"中文"}' });
  assert.equal(await boundedBody(small), '{"text":"中文"}');
  await assert.rejects(() => boundedBody(new Request("http://localhost/", { method: "POST", body: "a".repeat(33 * 1024) })), /INVALID_INPUT/);
  await assert.rejects(() => boundedBody(new Request("http://localhost/", { method: "POST", body: new Uint8Array([0xff]) })));
});
