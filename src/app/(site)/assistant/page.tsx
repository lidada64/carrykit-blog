import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantSession } from "@/components/assistant/assistant-session";
import { en } from "@/i18n/en";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: en.assistant.title, description: en.assistant.description, robots: { index: false, follow: false } };

export default function AssistantPage() {
  if (process.env.NODE_ENV === "production" && process.env.ASSISTANT_PREVIEW_ENABLED !== "true") notFound();
  return <AssistantSession />;
}
