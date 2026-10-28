"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n";
import { AssistantNewConversation } from "@/components/motion/assistant-new-conversation";

/** Local visual sample; this never sends a request or presents simulated text as a live answer. */
export function PreviewAssistantSession({ outputTarget, actionsTarget, curtainTarget, open }: { outputTarget: HTMLElement | null; actionsTarget: HTMLElement | null; curtainTarget: HTMLElement | null; open: boolean }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const output = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  useEffect(() => { if (output.current) output.current.scrollTop = output.current.scrollHeight; }, [questions]);
  function send() {
    if (!draft.trim()) return;
    setQuestions(current => [...current, draft.trim()]);
    setDraft("");
  }
  return <section className="min-w-0">
    {actionsTarget && createPortal(<AssistantNewConversation target={curtainTarget} open={open} action={async () => { setQuestions([]); setDraft(""); }} />, actionsTarget)}
    {outputTarget && createPortal(<div ref={output} role="region" aria-label={t("assistant.messages")} tabIndex={0} className="h-full min-w-0 space-y-5 overflow-y-auto overscroll-contain px-2 py-4 text-caption text-assistant-entry-label [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <p className="font-mono text-caption opacity-70">{t("assistant.assistant")}</p>
      <p>{t("blog.previewAnswer")}</p>
      {questions.map((question, index) => <div key={index} className="space-y-5">
        <article className="min-w-0 space-y-3 break-words"><p className="font-mono text-caption opacity-70">{t("assistant.you")}</p><p className="whitespace-pre-wrap">{question}</p></article>
        <article className="min-w-0 space-y-3 break-words"><p className="font-mono text-caption opacity-70">{t("assistant.assistant")}</p><p>{t("blog.previewReply")}</p><p>{t("blog.previewAnswer")}</p><p>{t("blog.previewReply")}</p></article>
      </div>)}
    </div>, outputTarget)}
    <form className="space-y-2 py-4" onSubmit={event => { event.preventDefault(); send(); }}>
      <label htmlFor="preview-assistant-input" className="block text-caption">{t("assistant.input")}</label>
      <textarea id="preview-assistant-input" rows={2} value={draft} onChange={event => setDraft(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); send(); } }} className="block w-full resize-none border border-border bg-background p-3 text-body text-foreground focus:outline-2 focus:outline-assistant-entry-ink focus:outline-offset-0" />
      <button type="submit" disabled={!draft.trim()} className="border border-border px-4 py-2 font-mono text-caption disabled:opacity-40">{t("assistant.send")}</button>
    </form>
    <p className="text-caption text-muted">{t("blog.previewLabel")}</p>

  </section>;
}
