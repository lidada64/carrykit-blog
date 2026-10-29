/** Derive presentation metadata without sending the Markdown body to the browser. */
export function parseTitle(title: string) {
  const tags: string[] = [];
  const rest = title.replace(/^(?:\s*\[[^\]\n]+\])+/u, prefix => {
    for (const match of prefix.matchAll(/\[([^\]\n]+)\]/gu)) tags.push(match[1].trim());
    return "";
  }).trim();
  return { tags, title: rest || title };
}

export function readingLength(markdown: string) {
  const text = markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+/g, " ")
    .replace(/[`*_#~>|\[\]()!-]/g, " ");
  return Array.from(text.replace(/\s/g, "")).length;
}

export function blogMetadata(title: string, titleEn: string | null, content: string) {
  const parsed = parseTitle(title);
  const category = parsed.tags[0] || "";
  const key = category.toLowerCase();
  const color: "book" | "agent" | "notes" | "unknown" = (key === "book" || key === "书") ? "book" : key === "agent" ? "agent" : key === "notes" ? "notes" : "unknown";
  const length = readingLength(content);
  return { cleanTitle: parsed.title, cleanTitleEn: titleEn ? parseTitle(titleEn).title : null, tags: parsed.tags, category, color, depth: [500, 1500, 3000, 5000, 8000, 12000].filter(threshold => length >= threshold).length };
}
