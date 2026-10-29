"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
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
  const [imageVisible, setImageVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outputTarget, setOutputTarget] = useState<HTMLDivElement | null>(null);
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);
  const scope = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const imageBox = useRef<HTMLDivElement>(null);
  const panelContent = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const entry = useRef<HTMLDivElement>(null);
  const [curtainTarget, setCurtainTarget] = useState<HTMLDivElement | null>(null);
  const setEntry = useCallback((node: HTMLDivElement | null) => { entry.current = node; setCurtainTarget(node); }, []);
  const clickLabel = useRef<HTMLSpanElement>(null);
  const actionLabel = useRef<HTMLSpanElement>(null);
  const transition = useRef<gsap.core.Timeline | null>(null);
  const labelProgress = useRef({ value: 0 });
  const initialized = useRef(false);

  useGSAP(() => {
    if (!initialized.current) {
      gsap.set(panel.current, { opacity: 0, height: 0 });
      gsap.set(panelContent.current, { yPercent: -10 });
      gsap.set(outputTarget, { opacity: 0, yPercent: -10 });
      initialized.current = true;
      return;
    }
    transition.current?.kill();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : motionTokens.duration.slow;
    const start = reduced ? 0 : motionTokens.blogExpansion.lead;
    const positionLabels = () => {
      if (!entry.current || !actionLabel.current || !clickLabel.current) return;
      const progress = labelProgress.current.value;
      gsap.set(actionLabel.current, { x: -(entry.current.clientWidth - actionLabel.current.offsetWidth - 32) * progress });
      gsap.set(clickLabel.current, { y: (entry.current.clientHeight - clickLabel.current.offsetTop - clickLabel.current.offsetHeight - 24) * progress });
    };
    const timeline = gsap.timeline({ onComplete: () => { if (open) setImageVisible(false); else setPanelVisible(false); ScrollTrigger.refresh(); } });
    transition.current = timeline;
    const entryStart = open ? start : (reduced ? 0 : motionTokens.duration.fast);
    const panelStart = open ? start : 0;
    timeline.to(panel.current, { height: open ? "auto" : 0, opacity: open ? 1 : 0, duration, ease: motionTokens.ease.transition }, panelStart)
      .to(panelContent.current, { yPercent: open ? 0 : -10, duration, ease: motionTokens.ease.transition }, panelStart)
      .to(outputTarget, { opacity: open ? 1 : 0, yPercent: open ? 0 : -10, duration, ease: motionTokens.ease.transition }, panelStart)
      .to(imageBox.current, { height: open ? 0 : "auto", marginTop: open ? 0 : "1rem", duration, ease: motionTokens.ease.transition }, entryStart)
      .to(entry.current, { height: open ? (window.matchMedia("(max-width: 767px)").matches ? "22rem" : "18rem") : "10rem", duration, ease: motionTokens.ease.transition, clearProps: "height" }, entryStart)
      .to(image.current, { yPercent: open ? 100 : 0, duration, ease: motionTokens.ease.transition }, entryStart)
      .to(orb.current, { scale: open ? (window.matchMedia("(max-width: 360px)").matches ? motionTokens.blogExpansion.narrowOrbScale : motionTokens.blogExpansion.orbScale) : 1, transformOrigin: "0% 0%", duration, ease: motionTokens.ease.transition }, entryStart)
      .to(labelProgress.current, { value: open ? 1 : 0, duration, ease: motionTokens.ease.transition, onUpdate: positionLabels }, entryStart);
  }, { scope, dependencies: [open] });

  useGSAP(() => {
    if (entry.current && actionLabel.current) {
      gsap.set(actionLabel.current, { x: -(entry.current.clientWidth - actionLabel.current.offsetWidth - 32) * labelProgress.current.value });
    }
  }, { scope, dependencies: [locale] });

  return <div ref={scope} data-blog-flip="assistant" data-flip-id="assistant" className={open ? "relative w-full" : "relative w-full max-w-[320px]"}>
    <div ref={setEntry} className={`@container relative overflow-hidden bg-assistant-entry-background ${open ? "h-[22rem] md:h-72" : "h-40"}`}>
      <span ref={orb} className="pointer-events-none absolute -top-2 left-2 h-40 w-48 max-w-full"><DiscoOrb active={busy} /></span>
      <div ref={setActionsTarget} inert={!open} aria-hidden={!open} className={`absolute right-4 top-0 z-20 flex items-start justify-end gap-2 ${open || panelVisible ? "" : "hidden"}`} />
      <div ref={setOutputTarget} className={`absolute bottom-12 left-4 right-4 top-40 min-w-0 md:bottom-0 @xl:bottom-0 @xl:left-48 @xl:right-48 @xl:top-10 ${open || panelVisible ? "" : "hidden"}`} inert={!open} aria-hidden={!open} />
      <button type="button" aria-expanded={open} aria-controls="blog-assistant-panel" aria-label={t(open ? "blog.assistantCollapse" : "blog.assistantOpen")} onClick={() => { if (entry.current) gsap.set(entry.current, { height: entry.current.offsetHeight }); if (!open) { setMounted(true); setPanelVisible(true); } else { setImageVisible(true); } onToggle(); }} className={`group absolute inset-0 z-10 block focus-visible:outline-2 focus-visible:outline-accent ${open ? "pointer-events-none" : "cursor-pointer"}`}>
        <span ref={clickLabel} aria-hidden="true" className={`${open ? "max-md:hidden" : ""} pointer-events-auto absolute flex cursor-pointer flex-col items-center gap-0.5 text-subheading font-body leading-none text-assistant-entry-label/60 ${locale === "zh" ? "right-7 top-5 scale-110" : "right-8 top-2 scale-90"}`}>{Array.from(t("blog.assistantClick")).map((letter, index) => <span key={index}>{letter}</span>)}</span>
        <span ref={actionLabel} className="pointer-events-auto absolute bottom-2 right-4 cursor-pointer whitespace-nowrap text-right text-body font-display font-bold italic tracking-normal text-assistant-entry-label [text-shadow:none]">{t(open ? "blog.assistantCollapse" : "blog.assistantOpen")}</span>
      </button>
    </div>
    <div ref={panel} id="blog-assistant-panel" hidden={!panelVisible} inert={!open} className="min-w-0 overflow-hidden">
      <div ref={panelContent}>
        {mounted && (preview ? <PreviewAssistantSession outputTarget={outputTarget} actionsTarget={actionsTarget} curtainTarget={curtainTarget} open={open} /> : <LiveAssistantSession compact outputTarget={outputTarget} actionsTarget={actionsTarget} curtainTarget={curtainTarget} open={open} onBusyChange={setBusy} />)}
      </div>
    </div>
    <div ref={imageBox} aria-hidden="true" hidden={!imageVisible} className="pointer-events-none relative mt-4 aspect-[4/5] w-full max-w-[320px] overflow-hidden">
      <div ref={image} className="absolute inset-0">
        <Image src={site.blogThumbnail} alt="" fill priority sizes="(min-width: 1024px) 320px, 60vw" className="object-cover" />
      </div>
    </div>
  </div>;
}
