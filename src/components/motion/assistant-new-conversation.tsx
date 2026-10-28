"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useT } from "@/i18n";
import { motionTokens } from "./tokens";

/** The bookmark gives way to a curtain while a new session is created. */
export function AssistantNewConversation({ target, action, disabled = false, open }: {
  target: HTMLElement | null;
  action: () => Promise<void>;
  disabled?: boolean;
  open: boolean;
}) {
  const t = useT();
  const bookmark = useRef<HTMLButtonElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const mounted = useRef(false);
  const bookmarkInitialized = useRef(false);
  const [covering, setCovering] = useState(false);
  const { contextSafe } = useGSAP();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useGSAP(() => {
    if (!bookmark.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!bookmarkInitialized.current) {
      gsap.set(bookmark.current, { yPercent: -100 });
      bookmarkInitialized.current = true;
    }
    gsap.killTweensOf(bookmark.current);
    gsap.to(bookmark.current, {
      yPercent: open ? 0 : -100,
      delay: reduced ? 0 : open ? motionTokens.blogExpansion.lead + motionTokens.duration.slow : motionTokens.blogExpansion.lead,
      duration: reduced ? 0 : open ? motionTokens.duration.base : motionTokens.duration.slow,
      ease: motionTokens.ease.transition,
    });
  }, { dependencies: [open] });

  function start() {
    contextSafe(() => {
    if (running.current || disabled || !target || !curtain.current || !bookmark.current) return;
    running.current = true;
    setCovering(true);
    const overlay = curtain.current;
    const tab = bookmark.current;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : motionTokens.duration.base;
    gsap.timeline()
      .to(tab, { yPercent: -100, duration, ease: motionTokens.ease.transition })
      .fromTo(overlay, { scaleY: 0, autoAlpha: 1, transformOrigin: "50% 0%" }, { scaleY: 1, duration, ease: motionTokens.ease.transition })
      .call(() => {
        void action().catch(() => {}).finally(() => {
          if (!mounted.current) return;
          contextSafe(() => {
            gsap.timeline({ onComplete: () => { running.current = false; setCovering(false); } })
              .to(overlay, { scaleY: 0, duration, ease: motionTokens.ease.transition })
              .set(overlay, { autoAlpha: 0 })
              .to(tab, { yPercent: 0, duration, ease: motionTokens.ease.transition });
          })();
        });
      });
    })();
  }

  return <>
    <button ref={bookmark} type="button" disabled={disabled || covering || !target} onClick={start} className="min-h-16 cursor-pointer bg-[var(--blog-band-text)] px-4 py-3 text-body font-display font-bold italic text-[var(--blog-unknown)] transition-colors duration-200 hover:bg-assistant-entry-label hover:text-assistant-entry-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px] disabled:cursor-default disabled:opacity-40">{t("assistant.newConversation")}</button>
    {target && createPortal(<div ref={curtain} aria-hidden={!covering} role="status" className="invisible absolute inset-0 z-30 flex items-center justify-center bg-[var(--blog-band-text)] text-body text-[var(--blog-unknown)]">{t("assistant.curtainLoading")}</div>, target)}
  </>;
}
