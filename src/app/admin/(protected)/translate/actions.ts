"use server";
import { requireAdmin } from "@/lib/auth";

export async function translateContent(data: { title: string; excerpt: string; content: string }) {
  await requireAdmin();
  
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const prompt = `You are a professional translator for a technology and design blog/portfolio.
Translate the following Chinese text into English.
Maintain a professional yet engaging tone, and strictly keep all Markdown formatting (such as bold, links, code blocks, images, and headings) intact.

Return ONLY a valid JSON object. Do not wrap the JSON in Markdown code blocks (i.e. NO \`\`\`json ... \`\`\`), just output the raw JSON string.
The JSON object must have exactly these keys:
- "title": The translated title.
- "excerpt": The translated excerpt or summary.
- "content": The translated markdown content.

Text to translate:
Title: ${data.title}
Excerpt/Summary: ${data.excerpt}
Content:
${data.content}`;

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }),
  });
  
  if (!res.ok) throw new Error("Translation API failed: " + res.statusText);
  const json = await res.json();
  const rawText = json.choices[0].message.content.trim();
  // Safe-guard in case it returns markdown block despite prompt
  const cleanJsonText = rawText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(cleanJsonText);
}
