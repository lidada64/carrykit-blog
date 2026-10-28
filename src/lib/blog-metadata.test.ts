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
  assert.equal(short.depth, 0);
  assert.equal(blogMetadata("[Agent] A", null, "x".repeat(1500)).depth, 1);
  assert.equal(blogMetadata("[Agent] A", null, "x".repeat(5000)).depth, 2);
  assert.equal(blogMetadata("[Unknown] A", null, "").color, "unknown");
});

test("link destinations and formatting do not count as reading text", () => {
  assert.equal(readingLength("# [Hello](https://example.com/path) **world**"), 10);
});
