"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { LiveAssistantSession } from "@/components/assistant/live-assistant-session";
import { site } from "@/config/site";
import { useLocale, useT } from "@/i18n";
import { motionTokens } from "./tokens";

const DiscoOrb = dynamic(() => import("./disco-orb"), { ssr: false });

export function BlogAssistant() {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const transition = useRef<gsap.core.Timeline | null>(null);
  const initialized = useRef(false);

  useGSAP(() => {
    if (!initialized.current) {
      gsap.set(panel.current, { height: 0, opacity: 0 });
      initialized.current = true;
      return;
    }
    transition.current?.kill();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : motionTokens.duration.slow;
    const timeline = gsap.timeline({ onComplete: () => { if (!open) setPanelVisible(false); } });
    transition.current = timeline;
    timeline.to(image.current, { yPercent: open ? 100 : 0, duration, ease: motionTokens.ease.transition }, 0)
      .to(panel.current, { height: open ? "auto" : 0, opacity: open ? 1 : 0, duration, ease: motionTokens.ease.transition }, 0);
  }, { scope, dependencies: [open] });

  return <div ref={scope} className="w-full max-w-[320px]">
    <button type="button" aria-expanded={open} aria-controls="blog-assistant-panel" aria-label={t(open ? "blog.assistantCollapse" : "blog.assistantOpen")} onClick={() => { if (!open) { setMounted(true); setPanelVisible(true); } setOpen(value => !value); }} className="group relative z-10 mb-4 block h-40 w-full overflow-hidden bg-assistant-entry-background focus-visible:outline-2 focus-visible:outline-accent">
      <span className="absolute -top-2 left-0 h-full w-3/4"><DiscoOrb active={busy} /></span>
      <span aria-hidden="true" className={`absolute flex flex-col items-center gap-0.5 text-subheading font-body leading-none text-assistant-entry-label/60 ${locale === "zh" ? "right-7 top-5 scale-110" : "right-8 top-2 scale-90"}`}>{Array.from(t("blog.assistantClick")).map((letter, index) => <span key={index}>{letter}</span>)}</span>
      <span className="absolute bottom-2 right-4 text-right text-body font-display font-bold italic tracking-normal text-assistant-entry-label [text-shadow:none]">{t(open ? "blog.assistantCollapse" : "blog.assistantOpen")}</span>
    </button>
    <div className="grid [grid-template-areas:'stack']">
      <div ref={panel} id="blog-assistant-panel" hidden={!panelVisible} inert={!open} className="min-w-0 overflow-hidden [grid-area:stack]">
        {mounted && <LiveAssistantSession compact onBusyChange={setBusy} />}
      </div>
      <div aria-hidden="true" className="pointer-events-none relative z-10 aspect-[4/5] self-start overflow-hidden [grid-area:stack]">
        <div ref={image} className="absolute inset-0">
          <Image src={site.blogThumbnail} alt="" fill priority sizes="(min-width: 1024px) 320px, 60vw" className="object-cover" />
        </div>
      </div>
    </div>
  </div>;
}
