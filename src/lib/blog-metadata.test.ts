import assert from "node:assert/strict";
import { test } from "node:test";
import { blogMetadata, parseTitle, readingLength } from "./blog-metadata";

test("only leading labels are removed and multiple labels remain available", () => {
  assert.deepEqual(parseTitle(" [ Book ][Notes] A [literal]"), { tags: ["Book", "Notes"], title: "A [literal]" });
  assert.equal(parseTitle("A [Book]").title, "A [Book]");
});

test("category comes from original title and length thresholds are stable", () => {
  const short = blogMetadata("[aGeNt] 中文", "[Other] English", "x".repeat(1499));
  assert.equal(short.color, "agent");
  assert.equal(short.cleanTitleEn, "English");
  assert.equal(short.depth, 1);
  for (const [length, depth] of [[0, 0], [499, 0], [500, 1], [1500, 2], [3000, 3], [5000, 4], [8000, 5], [12000, 6]]) {
    assert.equal(blogMetadata("[Agent] A", null, "x".repeat(length)).depth, depth);
  }
  assert.equal(blogMetadata("[Unknown] A", null, "").color, "unknown");
});

test("link destinations and formatting do not count as reading text", () => {
  assert.equal(readingLength("# [Hello](https://example.com/path) **world**"), 10);
});

test("Chinese and English book labels use the book color", () => {
  assert.equal(blogMetadata("[书] 标题", null, "").color, "book");
  assert.equal(blogMetadata("[Book] Title", null, "").color, "book");
  assert.equal(blogMetadata("无分类", null, "").color, "unknown");
});
