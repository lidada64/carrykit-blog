"use client";

import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import { useT, type TKey } from "@/i18n";
import { remarkPlugins, rehypePlugins } from "@/lib/markdown";
import { emptySnapshot, INPUT_LIMIT, scenarios, type AssistantTransport, type Scenario } from "@/lib/assistant/contracts";
import { createFixtureTransport } from "@/lib/assistant/fixture-transport";
import { sessionReducer } from "@/lib/assistant/reducer";

const button = "border border-border px-4 py-2 text-caption font-mono focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const activeStates = new Set(["queued", "running", "reconnecting", "cancelling"]);
const subscribeHydration = () => () => {};

export function AssistantSession() {
  const t = useT();
  const [state, dispatch] = useReducer(sessionReducer, emptySnapshot("initial"));
  const [draft, setDraft] = useState("");
  const [scenario, setScenario] = useState<Scenario>("completed");
  const [unread, setUnread] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const ready = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const transport = useRef<AssistantTransport | null>(null);
  const messages = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const newConversation = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const atBottom = useRef(true);
  const [initialCopy] = useState(() => ({ answer: t("assistant.fixtureAnswer"), fallback: t("assistant.fallbackAnswer"), source: t("assistant.fixtureSource") }));

  function start() {
    const budget = transport.current?.snapshot().budget ?? "normal";
    transport.current?.dispose();
    const current = createFixtureTransport(t("assistant.fixtureAnswer"), t("assistant.fallbackAnswer"), t("assistant.fixtureSource"), budget);
    transport.current = current;
    current.subscribe((snapshot) => dispatch({ type: "snapshot", snapshot }));
    dispatch({ type: "snapshot", snapshot: current.snapshot() });
    setUnread(false);
    return current;
  }

  useEffect(() => {
    // No identity or chat archive is stored in the browser. Only the unsent draft persists.
    const restoreDraft = requestAnimationFrame(() => {
      try { setDraft(sessionStorage.getItem("carrykit.assistant.draft") ?? ""); } catch { /* Storage can be disabled. */ }
    });
    const current = createFixtureTransport(initialCopy.answer, initialCopy.fallback, initialCopy.source);
    transport.current = current;
    current.subscribe((snapshot) => dispatch({ type: "snapshot", snapshot }));
    dispatch({ type: "snapshot", snapshot: current.snapshot() });
    return () => { cancelAnimationFrame(restoreDraft); transport.current?.dispose(); };
  }, [initialCopy]);

  function updateDraft(value: string) {
    setDraft(value);
    try { sessionStorage.setItem("carrykit.assistant.draft", value); } catch { /* Draft remains usable in memory. */ }
  }

  const latestMessage = state.messages.at(-1);
  useEffect(() => {
    const element = messages.current;
    if (!element) return;
    if (atBottom.current) element.scrollTop = element.scrollHeight;
    else setUnread(true);
  }, [latestMessage]);

  const busy = activeStates.has(state.state);
  const locked = state.conversation !== "active" || state.budget === "blocked";
  const status = state.conversation !== "active" ? state.conversation : state.budget === "blocked" ? "blocked" : scenario === "unavailable" && state.state === "failed" ? "unavailable" : state.state;
  const submit = () => {
    if (busy || locked || !draft.trim() || draft.length > INPUT_LIMIT || !transport.current) return;
    transport.current.submit(draft.trim(), crypto.randomUUID(), scenario);
    dispatch({ type: "snapshot", snapshot: transport.current.snapshot() });
    updateDraft("");
  };

  return (
    <section className="grid min-w-0 gap-6 py-8 text-body md:grid-cols-3 md:gap-10 md:py-24">
      <aside className="min-w-0 space-y-3 md:space-y-6">
        <div><p className="mb-3 font-mono text-caption text-accent">{t("assistant.preview")}</p><h1 className="font-display text-heading">{t("assistant.title")}</h1></div>
        <p className="text-caption text-muted">{t("assistant.previewNotice")}</p>
        <button type="button" className={`${button} md:hidden`} aria-expanded={controlsOpen} aria-controls="assistant-preview-controls" onClick={() => setControlsOpen((open) => !open)}>{t("assistant.previewControls")}</button>
        <div id="assistant-preview-controls" className={`${controlsOpen ? "block" : "hidden"} space-y-4 md:block md:space-y-6`}>
        <p className="text-muted">{t("assistant.description")}</p>
        <div className="flex flex-wrap gap-2">
          <button ref={newConversation} type="button" className={button} disabled={busy} onClick={() => { start(); input.current?.focus(); }}>{t("assistant.newConversation")}</button>
          <button type="button" className={button} disabled={state.conversation !== "active"} onClick={() => { transport.current?.close(); if (transport.current) dispatch({ type: "snapshot", snapshot: transport.current.snapshot() }); requestAnimationFrame(() => newConversation.current?.focus()); }}>{t("assistant.close")}</button>
        </div>
        <label className="block text-caption" htmlFor="assistant-scenario">{t("assistant.scenario")}</label>
        <select id="assistant-scenario" value={scenario} disabled={busy} className="w-full min-w-0 border border-border bg-background p-2 text-body" onChange={(event) => setScenario(event.target.value as Scenario)}>
          {scenarios.map((item) => <option key={item} value={item}>{t(`assistant.${item}` as TKey)}</option>)}
        </select>
        <p className="text-caption text-muted">{t("assistant.scenarioHint")}</p>
        <p className="font-mono text-caption">{t("assistant.budget")}: {t(`assistant.${state.budget}` as TKey)}</p>
        <p className="text-caption text-muted">{t("assistant.retention")}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col border border-border md:col-span-2">
        <div className="border-b border-border px-4 py-3" role="status" aria-live="polite" aria-atomic="true">{t(`assistant.${status}` as TKey)}</div>
        <div ref={messages} role="region" aria-label={t("assistant.messages")} tabIndex={0} className="h-[36dvh] min-h-48 min-w-0 space-y-8 overflow-y-auto overscroll-contain p-4 md:h-[52dvh] md:min-h-64" onScroll={(event) => { const element = event.currentTarget; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; if (atBottom.current) setUnread(false); }}>
          {state.messages.length === 0 && <p className="text-muted">{t("assistant.welcome")}</p>}
          {state.messages.map((message) => (
            <article key={message.id} className="min-w-0 space-y-3 break-words">
              <p className="font-mono text-caption text-muted">{t(message.role === "user" ? "assistant.you" : "assistant.assistant")}</p>
              {message.invalidated ? <p>{t("assistant.invalidated")}</p> : <div className="min-w-0 space-y-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border [&_pre]:p-3 [&_p]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:p-2 [&_a]:text-accent [&_a]:underline">
                <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml components={{ img: () => null, a: ({ href, children }) => href && /^(https?:\/\/|\/)/.test(href) && !href.startsWith("//") ? <a href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a> : <span>{children}</span> }}>{message.text}</ReactMarkdown>
              </div>}
              {message.sources.length > 0 && <div className="space-y-2 text-caption"><p className="text-muted">{t("assistant.sources")}</p>{message.sources.map((source) => <a className="block text-accent underline" key={source.postId} href={source.url}>{source.title}</a>)}</div>}
            </article>
          ))}
        </div>
        {unread && <button type="button" className={button} onClick={() => { if (messages.current) messages.current.scrollTop = messages.current.scrollHeight; atBottom.current = true; setUnread(false); }}>{t("assistant.newMessages")}</button>}
        <details className="border-t border-border px-4 py-3 text-caption"><summary className="cursor-pointer">{t("assistant.process")}</summary><p className="pt-2 text-muted">{t("assistant.simulatedProcess")}</p>{state.phase && <p>{t(`assistant.${state.phase}` as TKey)}</p>}</details>
        <form className="min-w-0 space-y-3 border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="block text-caption" htmlFor="assistant-input">{t("assistant.input")}</label>
          <textarea ref={input} id="assistant-input" rows={3} value={draft} maxLength={INPUT_LIMIT} disabled={locked || !ready} aria-describedby="assistant-input-hint" className="block w-full resize-y border border-border bg-background p-3 text-body focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" onChange={(event) => updateDraft(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); submit(); } }} />
          <p id="assistant-input-hint" className="text-caption text-muted">{t("assistant.inputHint")} · {INPUT_LIMIT - draft.length}</p>
          <div className="flex flex-wrap gap-3">
            {busy ? <button type="button" className={button} disabled={state.state === "cancelling"} onClick={() => { dispatch({ type: "cancel" }); transport.current?.cancel(); if (transport.current) dispatch({ type: "snapshot", snapshot: transport.current.snapshot() }); }}>{t("assistant.stop")}</button> : <button type="submit" className={button} disabled={locked || !ready || !draft.trim()}>{t("assistant.send")}</button>}
            {["partial", "failed", "timed_out", "interrupted"].includes(state.state) && !locked && <button type="button" className={button} onClick={() => { const previous = [...state.messages].reverse().find((message) => message.role === "user"); if (previous) updateDraft(previous.text); input.current?.focus(); }}>{t("assistant.retry")}</button>}
          </div>
          {["partial", "failed", "timed_out"].includes(state.state) && <p className="text-caption text-muted">{t("assistant.retryNotice")}</p>}
        </form>
      </div>
    </section>
  );
}
