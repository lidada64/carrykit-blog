"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PreviewAssistantSession } from "@/components/assistant/preview-assistant-session";
import { LiveAssistantSession } from "@/components/assistant/live-assistant-session";
import { site } from "@/config/site";
import { useLocale, useT } from "@/i18n";
import { motionTokens } from "./tokens";

const DiscoOrb = dynamic(() => import("./disco-orb"), { ssr: false });

export function BlogAssistant({ open, onToggle, preview = false }: { open: boolean; onToggle: () => void; preview?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outputTarget, setOutputTarget] = useState<HTMLDivElement | null>(null);
  const scope = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const transition = useRef<gsap.core.Timeline | null>(null);
  const initialized = useRef(false);

  useGSAP(() => {
    if (!initialized.current) {
      gsap.set(panel.current, { opacity: 0 });
      initialized.current = true;
      return;
    }
    transition.current?.kill();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : motionTokens.duration.slow;
    const phone = window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
    const start = open && !reduced && !phone ? motionTokens.blogExpansion.lead + motionTokens.duration.base : 0;
    const timeline = gsap.timeline({ onComplete: () => { if (!open) setPanelVisible(false); } });
    transition.current = timeline;
    timeline.to(image.current, { yPercent: open ? 100 : 0, duration, ease: motionTokens.ease.transition }, start)
      .to(panel.current, { opacity: open ? 1 : 0, duration, ease: motionTokens.ease.transition }, start)
      .to(orb.current, { scale: open ? motionTokens.blogExpansion.orbScale : 1, transformOrigin: "0% 0%", duration, ease: motionTokens.ease.transition }, start);
  }, { scope, dependencies: [open] });

  return <div ref={scope} data-blog-flip="assistant" data-flip-id="assistant" className={open ? "w-full" : "w-full max-w-[320px]"}>
    <div className={`@container relative overflow-hidden bg-assistant-entry-background ${open ? "h-72" : "h-40"}`}>
      <span ref={orb} className="pointer-events-none absolute -top-2 left-0 h-40 w-60 max-w-[60%]"><DiscoOrb active={busy} /></span>
      <div ref={setOutputTarget} className={`absolute bottom-0 left-4 right-4 top-40 min-w-0 @xl:bottom-0 @xl:left-48 @xl:right-48 @xl:top-0 ${open ? "" : "hidden"}`} />
      <button type="button" aria-expanded={open} aria-controls="blog-assistant-panel" aria-label={t(open ? "blog.assistantCollapse" : "blog.assistantOpen")} onClick={() => { if (!open) { setMounted(true); setPanelVisible(true); } onToggle(); }} className={`group absolute right-0 top-0 z-10 block cursor-pointer overflow-hidden focus-visible:outline-2 focus-visible:outline-accent ${open ? "h-full w-48 max-w-full" : "h-40 w-full"}`}>
        <span aria-hidden="true" className={`absolute flex flex-col items-center gap-0.5 text-subheading font-body leading-none text-assistant-entry-label/60 ${locale === "zh" ? "right-7 top-5 scale-110" : "right-8 top-2 scale-90"}`}>{Array.from(t("blog.assistantClick")).map((letter, index) => <span key={index}>{letter}</span>)}</span>
        <span className="absolute bottom-2 right-4 whitespace-nowrap text-right text-body font-display font-bold italic tracking-normal text-assistant-entry-label [text-shadow:none]">{t(open ? "blog.assistantCollapse" : "blog.assistantOpen")}</span>
      </button>
    </div>
    <div ref={panel} id="blog-assistant-panel" hidden={!panelVisible} inert={!open} className="min-w-0 overflow-hidden">
      {mounted && (preview ? <PreviewAssistantSession outputTarget={outputTarget} /> : <LiveAssistantSession compact outputTarget={outputTarget} onBusyChange={setBusy} />)}
    </div>
    <div aria-hidden="true" hidden={open} className="pointer-events-none relative mt-4 aspect-[4/5] w-full max-w-[320px] overflow-hidden">
      <div ref={image} className="absolute inset-0">
        <Image src={site.blogThumbnail} alt="" fill priority sizes="(min-width: 1024px) 320px, 60vw" className="object-cover" />
      </div>
    </div>
  </div>;
}
