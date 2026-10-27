"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useLocale, useT, type TKey } from "@/i18n";
import { remarkPlugins, rehypePlugins } from "@/lib/markdown";
import { emptySnapshot, INPUT_LIMIT, type PublicEvent, type Snapshot } from "@/lib/assistant/contracts";
import { sessionReducer } from "@/lib/assistant/reducer";
import { cancelRun, closeConversation, createConversation, restartConversation, submitMessage } from "@/app/(site)/assistant/actions";

const button = "border border-border px-4 py-2 font-mono text-caption focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const active = new Set(["queued", "running", "reconnecting", "cancelling"]);
const events = ["run.accepted", "phase.changed", "answer.committed", "answer.invalidated", "budget.changed", "run.terminal"];
const storedConversation = "carrykit.assistant.conversation";
const storedDraft = "carrykit.assistant.draft";

async function loadSnapshot(id: string): Promise<Snapshot> {
  const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.code === "string" ? data.code : "AGENT_UNAVAILABLE");
  if (data.contractVersion !== 1 || typeof data.conversationId !== "string" || !Array.isArray(data.messages)) throw new Error("AGENT_UNAVAILABLE");
  return data;
}

export function LiveAssistantSession() {
  const t = useT();
  const { locale } = useLocale();
  const [snapshot, setSnapshot] = useState<Snapshot>(() => emptySnapshot("initial"));
  const [connected, setConnected] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [obsolete, setObsolete] = useState(false);
  const [streamRevision, setStreamRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [unread, setUnread] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const atBottom = useRef(true);
  const sending = useRef(false);
  const request = useRef<{ id: string; text: string } | null>(null);
  const initialLocale = useRef(locale);

  const accept = useCallback((next: Snapshot) => {
    setSnapshot(next); setConnected(true); setFresh(true); setObsolete(false); setError("");
    try { sessionStorage.setItem(storedConversation, next.conversationId); } catch { /* The connection remains usable without storage. */ }
  }, []);

  const snapshotFailure = useCallback((failure: unknown) => {
    const code = failure instanceof Error ? failure.message : "AGENT_UNAVAILABLE";
    setError(code); setFresh(false);
    // An unverified snapshot must not keep exposing previously rendered source text.
    if (code === "EXPIRED" || code === "NOT_FOUND") {
      setConnected(false); setObsolete(true);
      setSnapshot(current => ({ ...current, messages: [] }));
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    Promise.resolve().then(async () => {
      try {
        const saved = sessionStorage.getItem(storedConversation);
        const restoredDraft = sessionStorage.getItem(storedDraft);
        if (!disposed && restoredDraft) setDraft(restoredDraft);
        if (saved) {
          if (!disposed) setSnapshot(current => ({ ...current, conversationId: saved }));
          const next = await loadSnapshot(saved);
          if (!disposed) accept(next);
        } else {
          const result = await createConversation(initialLocale.current);
          if (!disposed) {
            if (result.ok) accept(result.snapshot);
            else setError(result.code);
          }
        }
      } catch (failure) { if (!disposed) snapshotFailure(failure); }
    });
    return () => { disposed = true; };
  }, [accept, snapshotFailure]);

  const currentSnapshot = useRef(snapshot);
  useEffect(() => { currentSnapshot.current = snapshot; }, [snapshot]);
  const busy = active.has(snapshot.state);
  useEffect(() => {
    if (!snapshot.runId || !busy || snapshot.conversation !== "active") return;
    const source = new EventSource(`/api/assistant/runs/${encodeURIComponent(snapshot.runId)}/events?after=${currentSnapshot.current.cursor}`);
    let failures = 0;
    let disposed = false;
    const receive = (message: MessageEvent<string>) => {
      try {
        const event: PublicEvent = JSON.parse(message.data);
        if (!events.includes(event.type)) return;
        setSnapshot(current => sessionReducer(current, { type: "event", event }));
        setReconnecting(false);
        failures = 0;
        if (event.type === "run.terminal") source.close();
      } catch { source.close(); setError("AGENT_UNAVAILABLE"); }
    };
    source.onmessage = receive;
    for (const event of events) source.addEventListener(event, receive as EventListener);
    source.addEventListener("reset.required", () => {
      source.close(); setFresh(false); setReconnecting(true);
      loadSnapshot(snapshot.conversationId).then(next => {
        if (!disposed) { accept(next); setReconnecting(false); setStreamRevision(current => current + 1); }
      }).catch(failure => { if (!disposed) { setReconnecting(false); snapshotFailure(failure); } });
    });
    source.onopen = () => { failures = 0; setReconnecting(false); };
    source.onerror = () => {
      setReconnecting(true);
      if (++failures >= 3) { source.close(); setError("AGENT_UNAVAILABLE"); }
      loadSnapshot(snapshot.conversationId).then(next => {
        if (!disposed) { accept(next); if (!active.has(next.state)) { source.close(); setReconnecting(false); } }
      }).catch(failure => {
        if (!disposed) {
          snapshotFailure(failure);
          if (failure instanceof Error && ["EXPIRED", "NOT_FOUND", "FORBIDDEN", "UNAUTHENTICATED"].includes(failure.message)) source.close();
        }
      });
    };
    return () => { disposed = true; source.close(); };
  }, [snapshot.runId, busy, snapshot.conversation, snapshot.conversationId, streamRevision, accept, snapshotFailure]);

  useEffect(() => {
    if (!connected) return;
    const refresh = () => { setFresh(false); loadSnapshot(snapshot.conversationId).then(accept).catch(snapshotFailure); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [connected, snapshot.conversationId, accept, snapshotFailure]);

  const latest = snapshot.messages.at(-1);
  useEffect(() => {
    if (!messages.current) return;
    if (atBottom.current) messages.current.scrollTop = messages.current.scrollHeight;
    else setUnread(true);
  }, [latest]);

  function updateDraft(value: string) {
    setDraft(value);
    try { sessionStorage.setItem(storedDraft, value); } catch { /* In-memory drafts still work. */ }
  }

  async function command(action: () => ReturnType<typeof createConversation>) {
    if (sending.current) return;
    sending.current = true; setPending(true);
    try {
      const result = await action();
      if (result.ok) accept(result.snapshot);
      else if (result.code === "EXPIRED" || result.code === "NOT_FOUND") snapshotFailure(new Error(result.code));
      else setError(result.code);
    } catch { setError("AGENT_UNAVAILABLE"); }
    finally { sending.current = false; setPending(false); }
  }

  async function submit() {
    if (busy || sending.current || !connected || !fresh || snapshot.conversation !== "active" || snapshot.budget === "blocked" || !draft.trim() || draft.length > INPUT_LIMIT) return;
    const text = draft.trim();
    if (!request.current || request.current.text !== text) request.current = { id: crypto.randomUUID(), text };
    const current = request.current;
    await command(async () => {
      const result = await submitMessage({ conversationId: snapshot.conversationId, clientRequestId: current.id, text, locale });
      if (result.ok) { request.current = null; updateDraft(""); }
      return result;
    });
  }

  const locked = snapshot.conversation !== "active" || snapshot.budget === "blocked";
  const missing = obsolete;
  const status = error === "EXPIRED" ? "expired" : obsolete ? "liveMissing" : !connected ? "liveConnecting" : !fresh ? "liveRecovering" : snapshot.conversation !== "active" ? snapshot.conversation : reconnecting ? "reconnecting" : snapshot.budget === "blocked" ? "blocked" : snapshot.state === "idle" ? "liveReady" : snapshot.state === "running" ? "liveRunning" : snapshot.state;
  const errorKey = error === "EXPIRED" ? "expired" : error === "NOT_FOUND" ? "liveMissing" : error === "BUDGET_EXHAUSTED" ? "blocked" : error === "RATE_LIMITED" ? "liveRateLimited" : error === "FORBIDDEN" || error === "UNAUTHENTICATED" ? "liveForbidden" : error === "RUN_ACTIVE" || error === "IDEMPOTENCY_CONFLICT" ? "liveConflict" : "unavailable";

  return <section className="grid min-w-0 gap-6 py-8 text-body md:grid-cols-3 md:gap-10 md:py-24">
    <aside className="min-w-0 space-y-5">
      <p className="font-mono text-caption text-accent">{t(connected ? "assistant.liveConnected" : "assistant.liveConnecting")}</p>
      <h1 className="font-display text-heading">{t("assistant.title")}</h1>
      <p className="text-caption text-muted">{t("assistant.liveNotice")}</p>
      <div className="flex flex-wrap gap-2">
        <button ref={newButton} type="button" className={button} disabled={pending || (busy && !missing)} onClick={() => command(() => snapshot.conversationId === "initial" || missing ? createConversation(locale) : restartConversation(snapshot.conversationId, locale))}>{t("assistant.newConversation")}</button>
        <button type="button" className={button} disabled={!connected || pending || snapshot.conversation !== "active"} onClick={() => command(async () => { const result = await closeConversation(snapshot.conversationId); requestAnimationFrame(() => newButton.current?.focus()); return result; })}>{t("assistant.close")}</button>
      </div>
      <p className="text-caption text-muted">{t("assistant.liveRetention")}</p>
      <details className="text-caption text-muted">
        <summary>{t("assistant.livePrivacyTitle")}</summary>
        <div className="space-y-3 pt-3">
          <p>{t("assistant.livePrivacyProvider")}</p>
          <p>{t("assistant.livePrivacyRetention")}</p>
          <p>{t("assistant.livePrivacyLimits")}</p>
        </div>
      </details>
    </aside>
    <div className="min-w-0 border border-border md:col-span-2">
      <p role="status" aria-live="polite" className="border-b border-border px-4 py-3">{t(`assistant.${status}` as TKey)}</p>
      {error && <p role="alert" id="assistant-live-error" className="border-b border-border p-4 text-caption">{t(`assistant.${errorKey}` as TKey)}</p>}
      <div ref={messages} role="region" aria-label={t("assistant.messages")} tabIndex={0} className="h-[36dvh] min-h-48 min-w-0 space-y-8 overflow-y-auto overscroll-contain p-4 md:h-[52dvh]" onScroll={event => { const element = event.currentTarget; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; if (atBottom.current) setUnread(false); }}>
        {!fresh && <p className="text-muted">{t(missing ? `assistant.${errorKey}` as TKey : "assistant.liveRecovering")}</p>}
        {fresh && snapshot.messages.length === 0 && <p className="text-muted">{t("assistant.liveWelcome")}</p>}
        {(fresh ? snapshot.messages : []).map(message => <article key={message.id} className="min-w-0 space-y-3 break-words">
          <p className="font-mono text-caption text-muted">{t(message.role === "user" ? "assistant.you" : "assistant.liveAssistant")}</p>
          {message.invalidated ? <p>{t("assistant.invalidated")}</p> : <div className="min-w-0 space-y-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border [&_pre]:p-3 [&_p]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_a]:text-accent [&_a]:underline">
            <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml components={{ img: () => null, a: ({ href, children }) => href && /^(https?:\/\/|\/)/.test(href) && !href.startsWith("//") ? <a href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a> : <span>{children}</span> }}>{message.text}</ReactMarkdown>
          </div>}
          {message.sources.length > 0 && <div className="space-y-2 text-caption"><p className="text-muted">{t("assistant.liveSources")}</p>{message.sources.map(source => /^https?:\/\//.test(source.url) || source.url.startsWith("/blog/") ? <a className="block text-accent underline" key={`${source.postId}:${source.locale}`} href={source.url} rel="noopener noreferrer">{source.title}</a> : null)}</div>}
        </article>)}
      </div>
      {unread && <button type="button" className={button} onClick={() => { if (messages.current) messages.current.scrollTop = messages.current.scrollHeight; atBottom.current = true; setUnread(false); }}>{t("assistant.newMessages")}</button>}
      <details className="border-t border-border px-4 py-3 text-caption"><summary>{t("assistant.process")}</summary><p className="pt-2 text-muted">{t("assistant.liveProcess")}</p>{snapshot.phase && <p>{snapshot.phase === "generating" ? t("assistant.liveGenerating") : t(`assistant.${snapshot.phase}` as TKey)}</p>}</details>
      <form className="space-y-3 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={event => { event.preventDefault(); submit(); }}>
        <label className="block text-caption" htmlFor="assistant-live-input">{t("assistant.input")}</label>
        <textarea id="assistant-live-input" ref={input} rows={3} value={draft} maxLength={INPUT_LIMIT} disabled={!connected || !fresh || locked} aria-describedby="assistant-live-hint" aria-errormessage={error ? "assistant-live-error" : undefined} className="block w-full resize-y border border-border bg-background p-3 text-body focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" onChange={event => updateDraft(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); submit(); } }} />
        <p id="assistant-live-hint" className="text-caption text-muted">{t("assistant.inputHint")} · {INPUT_LIMIT - draft.length}</p>
        {busy ? <button type="button" className={button} disabled={pending || !fresh || snapshot.state === "cancelling"} onClick={() => snapshot.runId && command(() => cancelRun(snapshot.conversationId, snapshot.runId!))}>{t("assistant.stop")}</button> : <button type="submit" className={button} disabled={pending || !connected || !fresh || locked || !draft.trim()}>{t("assistant.send")}</button>}
        {["failed", "partial", "timed_out", "interrupted"].includes(snapshot.state) && <p className="text-caption text-muted">{t("assistant.retryNotice")}</p>}
      </form>
    </div>
  </section>;
}
