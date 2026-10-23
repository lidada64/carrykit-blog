"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useLocale, useT } from "@/i18n";
import { createCampfireRenderer, type CampfireRenderer } from "./harry-campfire-orbit-renderer";
import { createCampfireAtmosphere } from "./harry-campfire-atmosphere";

export function HarryCampfire() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atmosphereRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CampfireRenderer | null>(null);
  const options = useRef({ paused: false, original: true });
  const [paused, setPaused] = useState(false);
  const [original, setOriginal] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useGSAP(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const abort = new AbortController();
    const drawAtmosphere=atmosphereRef.current?createCampfireAtmosphere(atmosphereRef.current):undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: CampfireRenderer | undefined;
    let elapsed = 0, mounted = true, failed = false;
    const syncMotion = () => setReduced(media.matches);
    syncMotion(); media.addEventListener("change", syncMotion);
    const fail = () => { failed = true; gsap.ticker.remove(tick); if (mounted) setStatus("error"); };
    const tick = (_time: number, delta: number) => {
      if (!renderer || document.hidden || failed) return;
      if (!options.current.paused && !media.matches) elapsed += Math.min(delta / 1000, 0.1);
      try {
        const seconds=media.matches?0:elapsed;
        renderer.draw(seconds, options.current.original);
        drawAtmosphere?.(seconds,!options.current.original);
      } catch { fail(); }
    };
    const contextLost = (event: Event) => { event.preventDefault(); fail(); };
    canvas.addEventListener("webglcontextlost", contextLost);
    void createCampfireRenderer(canvas, abort.signal).then((result) => {
      if (!mounted) { result.dispose(); return; }
      renderer = result;
      rendererRef.current = result;
      try { renderer.draw(0, options.current.original); setStatus("ready"); gsap.ticker.add(tick); } catch { fail(); }
    }).catch((error: unknown) => {
      if (mounted && !(error instanceof DOMException && error.name === "AbortError")) setStatus("error");
    });
    return () => {
      mounted = false; abort.abort(); gsap.ticker.remove(tick); renderer?.dispose(); rendererRef.current = null;
      media.removeEventListener("change", syncMotion); canvas.removeEventListener("webglcontextlost", contextLost);
    };
  }, []);

  useGSAP(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let pointer: { id: number; x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !rendererRef.current || pointer) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId); canvas.focus();
    };
    const move = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      rendererRef.current?.rotate((event.clientX - pointer.x) * -.008, (event.clientY - pointer.y) * .006);
      pointer.x = event.clientX; pointer.y = event.clientY;
    };
    const up = () => { pointer = null; };
    const wheel = (event: WheelEvent) => {
      if (!rendererRef.current) return;
      event.preventDefault(); rendererRef.current.zoom(Math.max(-.2, Math.min(.2, event.deltaY * .001)));
    };
    const key = (event: KeyboardEvent) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      if (event.key === "ArrowLeft") renderer.rotate(-.12, 0);
      else if (event.key === "ArrowRight") renderer.rotate(.12, 0);
      else if (event.key === "ArrowUp") renderer.rotate(0, .08);
      else if (event.key === "ArrowDown") renderer.rotate(0, -.08);
      else if (event.key === "+" || event.key === "=") renderer.zoom(-.1);
      else if (event.key === "-") renderer.zoom(.1);
      else if (event.key === "Home") renderer.reset();
      else return;
      event.preventDefault();
    };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("lostpointercapture", up);
    canvas.addEventListener("wheel", wheel, { passive: false }); canvas.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("lostpointercapture", up);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("keydown", key);
    };
  }, []);

  function togglePause() { options.current.paused = !paused; setPaused(!paused); }
  function toggleOriginal() { options.current.original = !original; setOriginal(!original); }

  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-[var(--water-ink)] text-[color:var(--water-paper)]">
      <canvas ref={atmosphereRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-6 md:px-12 md:py-8">
        <Link href="/" className="font-mono text-caption uppercase tracking-wider underline-offset-4 hover:underline">{t("harryCampfire.home")}</Link>
        <button type="button" onClick={() => setLocale(locale === "en" ? "zh" : "en")} className="font-mono text-caption underline-offset-4 hover:underline">{t("harryCampfire.language")}</button>
      </header>
      <section className="relative mx-auto grid min-h-[calc(100svh-11rem)] max-w-7xl items-center gap-4 px-6 pb-8 md:grid-cols-12 md:px-12 md:pb-20">
        <div className="relative z-10 pt-8 md:col-span-5 md:pb-24 md:pt-0">
          <p className="mb-6 font-mono text-caption opacity-60">{t("harryCampfire.label")}</p>
          <h1 className="font-display text-display tracking-tight">{t("harryCampfire.title")}</h1>
          <p className="mt-6 text-subheading">{t("harryCampfire.subtitle")}</p>
          <p className="mt-6 max-w-sm text-body opacity-60">{t("harryCampfire.description")}</p>
        </div>
        <div className="relative -mx-6 aspect-[11/10] md:col-span-7 md:-ml-24 md:-mr-12 md:scale-110">
          <canvas ref={canvasRef} role="img" tabIndex={0} aria-label={t("harryCampfire.sceneAlt")} aria-describedby="campfire-controls" className="absolute inset-0 h-full w-full touch-none cursor-grab outline-offset-4 focus-visible:outline active:cursor-grabbing" />
          {status !== "ready" && <p role="status" className="absolute inset-0 grid place-items-center p-8 text-center text-body">{t(status === "loading" ? "harryCampfire.loading" : "harryCampfire.error")}</p>}
        </div>
      </section>
      <footer className="relative z-10 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-6 px-6 pb-8 md:px-12">
        <div><p className="text-caption">{t("harryCampfire.character")}</p><p className="mt-1 font-mono text-caption opacity-50">{t(original ? "harryCampfire.modeColor" : "harryCampfire.modeDither")}</p></div>
        <div className="flex flex-wrap gap-6 text-caption">
          <button type="button" disabled={status !== "ready" || reduced} aria-pressed={paused} onClick={togglePause} className="underline underline-offset-4 disabled:opacity-40">{t(paused ? "harryCampfire.play" : "harryCampfire.pause")}</button>
          <button type="button" disabled={status !== "ready"} aria-pressed={original} onClick={toggleOriginal} className="underline underline-offset-4 disabled:opacity-40">{t(original ? "harryCampfire.showDither" : "harryCampfire.showColor")}</button>
          <button type="button" disabled={status !== "ready"} onClick={() => rendererRef.current?.reset()} className="underline underline-offset-4 disabled:opacity-40">{t("harryCampfire.reset")}</button>
        </div>
        <p id="campfire-controls" className="w-full text-caption opacity-50">{t("harryCampfire.controls")} {t(reduced ? "harryCampfire.reduced" : "harryCampfire.note")}</p>
      </footer>
    </main>
  );
}
