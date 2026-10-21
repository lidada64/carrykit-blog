"use client";

// Throwaway comparison on the existing campfire route: ?variant=1|2.
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import { useLocale, useT } from "@/i18n";
import { createCampfireRenderer, type CampfireRenderer } from "./harry-campfire-orbit-renderer";
import { motionTokens } from "./tokens";

const motion = motionTokens.heroPrototype;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function CampfireHeroPrototype({ initialVariant }: { initialVariant: "1" | "2" }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [variant, setVariant] = useState(initialVariant);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [original, setOriginal] = useState(true);
  const [systemReduced, setReduced] = useState(false);
  const [forceReduced, setForceReduced] = useState(false);
  const reduced = systemReduced || forceReduced;
  const [status, setStatus] = useState("loading");
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<CampfireRenderer | null>(null);
  const options = useRef({ paused, original, reduced });
  const viewState = useRef({ variant, progress, reduced });
  const orbitOffset = useRef({ yaw: 0, pitch: 0 });
  const switchRef = useRef<() => void>(() => {});

  function select(next: "1" | "2") {
    orbitOffset.current = { yaw: 0, pitch: 0 };
    setVariant(next);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
    setProgress(0);
  }
  useGSAP(() => { switchRef.current = () => select(variant === "1" ? "2" : "1"); }, [variant]);
  useGSAP(() => { viewState.current = { variant, progress, reduced }; }, [variant, progress, reduced]);
  useGSAP(() => { options.current = { paused, original, reduced }; }, [paused, original, reduced]);

  useGSAP(() => {
    const node = canvas.current;
    if (!node) return;
    const abort = new AbortController();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = true, elapsed = 0;
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener("change", sync);
    const tick = (_: number, delta: number) => {
      if (!renderer.current || document.hidden) return;
      if (!options.current.paused && !options.current.reduced) elapsed += Math.min(delta / 1000, 0.1);
      const state = viewState.current;
      const amount = state.variant === "1" && !state.reduced ? gsap.parseEase(motionTokens.ease.transition)(state.progress) : 0;
      const start = motion.camera.opening, end = motion.camera.right, left = motion.camera.left;
      const a = state.variant === "2" ? left : start;
      const b = state.variant === "2" || state.reduced ? a : end;
      const mix = (x: number, y: number) => x + (y - x) * amount;
      const aspect = node.clientWidth / Math.max(1, node.clientHeight);
      renderer.current.setView({
        yaw: mix(a.yaw, b.yaw) + orbitOffset.current.yaw,
        pitch: Math.max(.025, Math.min(1.3, mix(a.pitch, b.pitch) + orbitOffset.current.pitch)),
        distance: mix(a.distance, b.distance) * Math.max(1, .95 / aspect),
        target: a.target.map((value, index) => mix(value, b.target[index])),
      });
      renderer.current.draw(options.current.reduced ? 0 : elapsed, options.current.original);
    };
    void createCampfireRenderer(node, abort.signal).then(result => {
      if (!active) { result.dispose(); return; }
      renderer.current = result;
      result.draw(0, options.current.original);
      setStatus("ready"); gsap.ticker.add(tick);
    }).catch(() => { if (active) setStatus("error"); });
    const lost = (event: Event) => { event.preventDefault(); gsap.ticker.remove(tick); setStatus("error"); };
    node.addEventListener("webglcontextlost", lost);
    let pointer: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => { if (e.button !== 0) return; pointer = { x: e.clientX, y: e.clientY, id: e.pointerId }; node.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!pointer || pointer.id !== e.pointerId) return;
      orbitOffset.current.yaw += (e.clientX - pointer.x) * -.008;
      orbitOffset.current.pitch += (e.clientY - pointer.y) * .006;
      pointer.x = e.clientX; pointer.y = e.clientY;
    };
    const up = () => { pointer = null; };
    node.addEventListener("pointerdown", down); node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up); node.addEventListener("lostpointercapture", up);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); switchRef.current(); }
    };
    const pop = () => { setVariant(new URLSearchParams(location.search).get("variant") === "2" ? "2" : "1"); window.scrollTo(0, 0); };
    window.addEventListener("keydown", key); window.addEventListener("popstate", pop);
    return () => {
      active = false; abort.abort(); gsap.ticker.remove(tick); renderer.current?.dispose(); renderer.current = null;
      media.removeEventListener("change", sync); node.removeEventListener("webglcontextlost", lost);
      node.removeEventListener("pointerdown", down); node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up); node.removeEventListener("lostpointercapture", up);
      window.removeEventListener("keydown", key); window.removeEventListener("popstate", pop);
    };
  }, []);

  useGSAP(() => {
    const scroll = () => {
      const rect = root.current?.getBoundingClientRect();
      if (rect) setProgress(clamp(-rect.top / (window.innerHeight * motion.scrollScreens)));
    };
    window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", scroll); scroll();
    return () => { window.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); };
  }, [variant]);

  const p = variant === "1" ? progress : 0;
  const peel = gsap.parseEase(motionTokens.ease.transition)(p);
  const edge = motion.coverStart - peel * (motion.coverStart + motion.feather * 2);
  const mask = `linear-gradient(135deg, var(--foreground) ${edge - motion.feather}%, transparent ${edge + motion.feather}%)`;
  function seek(value: number) {
    const top = (root.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
    window.scrollTo({ top: top + value * window.innerHeight * motion.scrollScreens, behavior: "instant" });
  }

  return <div ref={root} className="relative bg-[var(--water-ink)] text-[var(--water-paper)]" style={{ height: variant === "1" ? `${(1 + motion.scrollScreens) * 100}svh` : "100svh" }}>
    <div className="sticky top-0 h-svh overflow-hidden">
      <canvas ref={canvas} role="img" aria-label={t("harryCampfire.sceneAlt")} className="absolute inset-0 h-full w-full touch-pan-y cursor-grab active:cursor-grabbing" />
      {variant === "1" && <>
        <div className="pointer-events-none absolute inset-0 bg-[var(--water-ink)]" style={{ opacity: reduced ? 1 - p : 1, maskImage: reduced ? undefined : mask, WebkitMaskImage: reduced ? undefined : mask }}>
          <div className="absolute left-6 top-[17%] max-w-[80%] md:left-[8%] md:top-[20%] md:max-w-[55%]" style={{ transform: reduced ? undefined : `translate(${-peel * motion.titleLift}%, ${-peel * motion.titleLift}%)` }}>
            <h1 className="font-display text-display tracking-tight">{t("heroPrototype.title")}</h1>
            <p className="mt-4 text-subheading">{t("heroPrototype.subtitle")}</p>
          </div>
        </div>
        {!reduced && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: Math.sin((.12 + peel * .88) * Math.PI) * .16, backdropFilter: `blur(${motion.blur}px)`, maskImage: `linear-gradient(135deg, transparent ${edge - motion.feather * 2}%, var(--foreground) ${edge}%, transparent ${edge + motion.feather * 2}%)`, background: `linear-gradient(135deg, transparent ${edge - 4}%, var(--water-paper) ${edge}%, transparent ${edge + motion.feather}%)` }} />}
      </>}
      {variant === "2" && <div className="pointer-events-none absolute left-6 top-[13%] md:left-[8%]">
        <h1 className="font-display text-heading">{t("heroPrototype.title")}</h1>
      </div>}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-6 md:px-12">
        <Link href="/" className="font-mono text-caption">{t("harryCampfire.home")}</Link>
        <button onClick={() => setLocale(locale === "en" ? "zh" : "en")} className="text-caption">{t("harryCampfire.language")}</button>
      </header>
      {status !== "ready" && <p role="status" className="absolute left-6 top-1/2 text-body">{t(status === "error" ? "harryCampfire.error" : "harryCampfire.loading")}</p>}
      <p className="pointer-events-none absolute bottom-44 left-6 max-w-xs text-caption opacity-70 md:bottom-32 md:left-12">{reduced ? t("heroPrototype.reduced") : t(variant === "1" ? "heroPrototype.hint" : "heroPrototype.centerHint")}</p>
    </div>
    <aside aria-label={t("heroPrototype.label")} className="fixed inset-x-3 bottom-3 z-20 mx-auto max-w-3xl border border-[var(--water-paper)]/30 bg-[var(--water-ink)]/95 px-4 py-3 text-[var(--water-paper)] backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 text-caption">
        <button aria-label={t("heroPrototype.previous")} onClick={() => select(variant === "1" ? "2" : "1")}>←</button>
        <button aria-pressed={variant === "1"} onClick={() => select("1")} className={variant === "1" ? "underline underline-offset-4" : "opacity-50"}>{t("heroPrototype.one")}</button>
        <button aria-pressed={variant === "2"} onClick={() => select("2")} className={variant === "2" ? "underline underline-offset-4" : "opacity-50"}>{t("heroPrototype.two")}</button>
        <button aria-label={t("heroPrototype.next")} onClick={() => select(variant === "1" ? "2" : "1")}>→</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption">
        <button onClick={() => setPaused(!paused)}>{t(paused ? "harryCampfire.play" : "harryCampfire.pause")}</button>
        <button onClick={() => setOriginal(!original)}>{t(original ? "harryCampfire.showDither" : "harryCampfire.showColor")}</button>
        <button onClick={() => { orbitOffset.current = { yaw: 0, pitch: 0 }; seek(0); }}>{t("heroPrototype.reset")}</button>
        <button aria-pressed={forceReduced} onClick={() => setForceReduced(!forceReduced)}>{t(forceReduced ? "heroPrototype.motionOn" : "heroPrototype.motionOff")}</button>
        <span className="opacity-50">{t("heroPrototype.orbit")}</span>
      </div>
      {variant === "1" && <label className="mt-3 flex items-center gap-3 text-caption">{t("heroPrototype.progress")}<input className="min-w-0 flex-1 accent-[var(--water-paper)]" type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={event => seek(Number(event.target.value) / 1000)} /><output className="w-10 tabular-nums">{Math.round(progress * 100)}%</output></label>}
    </aside>
  </div>;
}
