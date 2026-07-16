"use server";
import { requireAdmin } from "@/lib/auth";

export async function translateContent(data: { title?: string; excerpt?: string; content?: string }) {
  await requireAdmin();
  
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { error: "DEEPSEEK_API_KEY not configured" };

  const prompt = `You are a professional translator for a technology and design blog/portfolio.
Translate the following Chinese text into English.
Maintain a professional yet engaging tone, and strictly keep all Markdown formatting (such as bold, links, code blocks, images, and headings) intact.

Return ONLY a valid JSON object. Do not wrap the JSON in Markdown code blocks (i.e. NO \`\`\`json ... \`\`\`), just output the raw JSON string.
The JSON object must have exactly these keys:
- "title": The translated title.
- "excerpt": The translated excerpt or summary.
- "content": The translated markdown content.

Text to translate:
Title: ${data.title || ""}
Excerpt/Summary: ${data.excerpt || ""}
Content:
${data.content || ""}`;

  try {
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
    
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { error: `Translation API failed: ${res.statusText} ${errText}` };
    }
    const json = await res.json();
    const rawText = json.choices[0].message.content.trim();
    // Safe-guard in case it returns markdown block despite prompt
    const cleanJsonText = rawText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    
    try {
      const parsed = JSON.parse(cleanJsonText);
      return { data: parsed };
    } catch {
      // Fallback: try to extract JSON from the text
      const match = cleanJsonText.match(/\{[\s\S]*\}/);
      if (match) {
        return { data: JSON.parse(match[0]) };
      }
      return { error: "Failed to parse JSON response from translation API" };
    }
  } catch (err: unknown) {
    return { error: (err as Error).message || "Unknown error occurred during translation" };
  }
}
