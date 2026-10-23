"use client";

// Selected homepage composition; the Lab exposes optional preview controls.
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Observer } from "gsap/Observer";
import Link from "next/link";
import { useLocale, useT } from "@/i18n";
import { createCampfireRenderer, type CampfireRenderer } from "./harry-campfire-orbit-renderer";
import { motionTokens } from "./tokens";
import { Preloader } from "./preloader";
import { hangingMotion, stageProgress } from "./campfire-transition";

const motion = motionTokens.heroPrototype;
gsap.registerPlugin(Observer);

export function CampfireHero({ preview = false }: { preview?: boolean }) {
  const t = useT();
  const { locale, setLocale } = useLocale();

  const [yaw, setYaw] = useState<number>(motion.camera.defaultOrbit);
  const [pitch, setPitch] = useState<number>(motion.camera.defaultElevation);
  const [original, setOriginal] = useState(false);
  const [brightness, setBrightness] = useState<number>(motion.orb.brightness);
  const [density, setDensity] = useState<number>(motion.orb.density);
  const [systemReduced, setReduced] = useState(false);
  const [forceReduced, setForceReduced] = useState(false);
  const reduced = systemReduced || forceReduced;
  const [status, setStatus] = useState("loading");
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<CampfireRenderer | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const rope = useRef<SVGPathElement>(null);
  const progressInput = useRef<HTMLInputElement>(null);
  const progressOutput = useRef<HTMLOutputElement>(null);
  const propLinks = useRef<Partial<Record<"blog" | "work" | "radar", HTMLAnchorElement | null>>>({});
  const performanceState = useRef({ progress: 0 });
  const knobDrag = useRef({ y: 0, value: 0 });
  const play = useRef<(reverse?: boolean) => void>(() => {});
  const seek = useRef<(value: number) => void>(() => {});
  const options = useRef({ yaw, pitch, original, reduced, brightness, density });
  useGSAP(() => { options.current = { yaw, pitch, original, reduced, brightness, density }; }, [yaw, pitch, original, reduced, brightness, density]);

  useGSAP(() => {
    const node=root.current;
    if(!preview||!node||status!=="ready"||reduced) {
      performanceState.current.progress=0;
      play.current=()=>{};seek.current=()=>{};
      return;
    }
    const state=performanceState.current;
    let tween: gsap.core.Tween | undefined;
    let finishedAt=0;
    const animate=(reverse=false)=>{
      tween?.kill();
      tween=gsap.to(state,{progress:reverse?0:1,
        duration:motion.transition.duration*Math.abs((reverse?0:1)-state.progress),
        ease:motion.transition.ease,onComplete:()=>{finishedAt=performance.now();}});
    };
    play.current=animate;
    seek.current=(value)=>{tween?.kill();state.progress=value;finishedAt=performance.now();};
    const atTop=()=>Math.abs(node.getBoundingClientRect().top)<4;
    const observer=Observer.create({
      target:node,type:"wheel,touch",preventDefault:true,tolerance:15,
      ignore:"input,button,a,label,fieldset,summary",
      onDown:()=>{
        if(!atTop()) {observer.disable();return;}
        if(state.progress>=.999) {
          if(performance.now()-finishedAt>motion.transition.releaseDelay) observer.disable();
        } else if(!tween?.isActive()||tween.vars.progress===0) animate();
      },
      onUp:()=>{
        if(!atTop()) {observer.disable();return;}
        if(state.progress>0&&(!tween?.isActive()||tween.vars.progress===1)) animate(true);
      },
    });
    const scroll=()=>{if(atTop()) observer.enable();else observer.disable();};
    const keyboard=(event:KeyboardEvent)=>{
      if(!atTop()||event.target instanceof HTMLElement&&event.target.closest("input,button,a,summary")) return;
      if(event.key==="Escape") {tween?.kill();observer.disable();return;}
      if(["PageDown"," ","PageUp"].includes(event.key)) {
        if(state.progress>=.999&&event.key!=="PageUp") {observer.disable();return;}
        event.preventDefault();animate(event.key==="PageUp");
      }
    };
    scroll();window.addEventListener("scroll",scroll,{passive:true});window.addEventListener("keydown",keyboard);
    return ()=>{tween?.kill();observer.kill();play.current=()=>{};seek.current=()=>{};
      window.removeEventListener("scroll",scroll);window.removeEventListener("keydown",keyboard);};
  },{dependencies:[preview,status,reduced],revertOnUpdate:true});

  useGSAP(() => {
    const node = canvas.current;
    if (!node) return;
    const abort = new AbortController();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = true, elapsed = 0;
    let presented = false;
    let paintFrame = 0;
    let readyDelay: gsap.core.Tween | undefined;
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener("change", sync);
    const tick = (_: number, delta: number) => {
      if (!renderer.current || document.hidden) return;
      if (!options.current.reduced) elapsed += Math.min(delta / 1000, 0.1);
      const view = motion.camera.centered;
      const aspect = node.clientWidth / Math.max(1, node.clientHeight);
      renderer.current.setView({
        ...view,
        yaw: view.yaw + options.current.yaw * Math.PI / 180,
        pitch: options.current.pitch * Math.PI / 180,
        distance: view.distance * Math.max(1, .95 / aspect),
      });
      try {
        const progress=options.current.reduced?0:performanceState.current.progress;
        renderer.current.setPresentation(options.current.brightness,options.current.density,progress);
        renderer.current.draw(options.current.reduced ? 0 : elapsed, options.current.original);
        for(const target of renderer.current.propTargets()) {
          const link=propLinks.current[target.id];
          if(!link) continue;
          link.hidden=!target.visible;
          link.style.left=`${target.x*100}%`;
          link.style.top=`${target.y*100}%`;
          link.style.width=`${Math.max(44,target.width*node.clientWidth)}px`;
          link.style.height=`${Math.max(44,target.height*node.clientHeight)}px`;
          const label=link.firstElementChild;
          if(label instanceof HTMLElement) {
            const bottom=target.y*node.clientHeight+Math.max(44,target.height*node.clientHeight)/2;
            link.dataset.labelPlacement=bottom+label.offsetHeight>node.clientHeight
              ? target.id==="radar"?"left":"above" : "below";
          }
        }
        const anchor=renderer.current.suspensionPoint();
        if(rope.current) {
          const slack=hangingMotion(progress).slack*100;
          // Fixed ceiling, projected attachment, slight bow while upward inertia unloads the rope.
          rope.current.setAttribute("d",`M 50 0 Q ${(50+anchor.x*100)/2+slack} ${anchor.y*50+slack} ${anchor.x*100} ${anchor.y*100}`);
          rope.current.style.opacity=String(stageProgress(progress,motion.transition.ropeStart,motion.transition.ropeEnd));
        }
        if(title.current) title.current.style.opacity=String(1-stageProgress(progress,0,motion.transition.titleEnd));
        if(progressInput.current) progressInput.current.value=String(Math.round(progress*100));
        if(progressOutput.current) progressOutput.current.value=`${Math.round(progress*100)}%`;
        if (!presented) {
          presented = true;
          // Let the fully configured frame reach the browser before revealing it.
          paintFrame = requestAnimationFrame(() => {
            paintFrame = requestAnimationFrame(() => {
              if (!active) return;
              readyDelay = gsap.delayedCall(motion.loading.readyDelay, () => {
                if (active) setStatus("ready");
              });
            });
          });
        }
      } catch {
        gsap.ticker.remove(tick);
        cancelAnimationFrame(paintFrame); readyDelay?.kill();
        setStatus("error");
      }
    };
    void createCampfireRenderer(node, abort.signal).then(result => {
      if (!active) { result.dispose(); return; }
      renderer.current = result;
      gsap.ticker.add(tick);
    }).catch(() => { if (active) setStatus("error"); });
    const lost = (event: Event) => { event.preventDefault(); gsap.ticker.remove(tick); cancelAnimationFrame(paintFrame); readyDelay?.kill(); setStatus("error"); };
    node.addEventListener("webglcontextlost", lost);
    return () => {
      active = false; abort.abort(); cancelAnimationFrame(paintFrame); readyDelay?.kill(); gsap.ticker.remove(tick); renderer.current?.dispose(); renderer.current = null;
      media.removeEventListener("change", sync); node.removeEventListener("webglcontextlost", lost);
    };
  }, []);

  return <>
    {!preview && <Preloader ready={status!=="loading"} />}
    <div ref={root} aria-busy={status==="loading"} className={`relative isolate bg-[var(--water-ink)] text-[var(--water-paper)] ${preview ? "" : "mx-[calc(50%-50vw)] w-screen"}`} >
    <div className="relative h-svh overflow-hidden">
      <div ref={title} className="pointer-events-none absolute inset-0">
        <h1 className="absolute left-1/2 top-[26%] -translate-x-1/2 scale-90 whitespace-nowrap font-title italic text-[length:var(--hero-title-size)] leading-none tracking-tight md:top-[20%]">{t("heroPrototype.title")}</h1>
      </div>
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <path ref={rope} d="M 50 0 L 50 0" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0" />
      </svg>
      <canvas ref={canvas} role="img" aria-label={t("heroPrototype.sceneAlt")} className="absolute inset-0 h-full w-full touch-pan-y" />
      {(["blog","work","radar"] as const).map(id=><Link key={id} href={`/${id}`} hidden
        ref={element=>{propLinks.current[id]=element;}}
        aria-label={t(`heroPrototype.${id}Object`)}
        onPointerEnter={()=>renderer.current?.setActiveProp(id)}
        onPointerLeave={()=>renderer.current?.setActiveProp(null)}
        onFocus={()=>renderer.current?.setActiveProp(id)}
        onBlur={()=>renderer.current?.setActiveProp(null)}
        className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--water-paper)]">
        <span className="absolute left-1/2 top-full -translate-x-1/2 group-data-[label-placement=above]:top-auto group-data-[label-placement=above]:bottom-full group-data-[label-placement=left]:left-auto group-data-[label-placement=left]:right-full group-data-[label-placement=left]:top-1/2 group-data-[label-placement=left]:-translate-y-1/2 group-data-[label-placement=left]:translate-x-0 group-data-[label-placement=left]:mr-1 whitespace-nowrap bg-[var(--water-ink)]/80 px-2 py-1 font-mono text-caption text-[var(--water-paper)] group-hover:underline group-focus-visible:underline">{t(`nav.${id}`)}</span>
      </Link>)}
      {preview && <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-6 md:px-12">
        <Link href="/" className="font-mono text-caption">{t("harryCampfire.home")}</Link>
        <button onClick={() => setLocale(locale === "en" ? "zh" : "en")} className="text-caption">{t("harryCampfire.language")}</button>
      </header>}
      {status !== "ready" && <p role="status" className="absolute left-6 top-1/2 text-body">{t(status === "error" ? "harryCampfire.error" : "harryCampfire.loading")}</p>}
      {preview && <button type="button" aria-pressed={!original} className="absolute right-6 top-24 z-10 text-caption md:right-12" onClick={() => setOriginal(!original)}>{t(original ? "heroPrototype.enterBit" : "heroPrototype.exitBit")}</button>}
      {preview && <details className="absolute inset-x-6 bottom-4 z-20 mx-auto max-w-md border border-[var(--water-paper)]/30 bg-[var(--water-ink)]/90 text-caption backdrop-blur-md">
        <summary className="cursor-pointer px-4 py-2">{t("heroPrototype.controls")}</summary>
      <fieldset className="flex flex-col gap-3 p-4">
        <legend className="sr-only">{t("heroPrototype.camera")}</legend>
        <div className="flex justify-evenly gap-6">
          {([{key:"brightness",value:brightness,set:setBrightness,min:20,max:180,label:t("heroPrototype.brightness")},
            {key:"density",value:density,set:setDensity,min:0,max:100,label:t("heroPrototype.density")}] as const).map(control=>
            <label key={control.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span>{control.label} <output className="tabular-nums">{control.value}%</output></span>
              <span aria-hidden="true" className="relative block size-9 touch-none cursor-ns-resize rounded-full border border-current/50"
                onPointerDown={event=>{
                  event.preventDefault();
                  knobDrag.current={y:event.clientY,value:control.value};
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={event=>{
                  if(!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const next=knobDrag.current.value+(knobDrag.current.y-event.clientY)*(control.max-control.min)/100;
                  control.set(Math.round(Math.max(control.min,Math.min(control.max,next))));
                }}
                onPointerUp={event=>event.currentTarget.releasePointerCapture(event.pointerId)}>
                <span className="absolute inset-1" style={{transform:`rotate(${-135+(control.value-control.min)/(control.max-control.min)*270}deg)`}}>
                  <span className="absolute left-1/2 top-0 h-2 w-px bg-current" />
                </span>
              </span>
              <input aria-label={control.label} type="range" min={control.min} max={control.max} step="1" value={control.value}
                className="w-full accent-[var(--water-paper)]" onChange={event=>control.set(Number(event.target.value))} />
            </label>)}
        </div>
        <details>
        <summary className="cursor-pointer">{t("heroPrototype.camera")}</summary>
        <label className="flex items-center gap-3"><span className="w-20 shrink-0">{t("heroPrototype.yaw")}</span><input className="min-w-0 flex-1 accent-[var(--water-paper)]" type="range" min="-180" max="180" step="1" value={yaw} onChange={event => setYaw(Number(event.target.value))} /><output className="w-12 text-right tabular-nums">{yaw}°</output></label>
        <label className="flex items-center gap-3"><span className="w-20 shrink-0">{t("heroPrototype.pitch")}</span><input className="min-w-0 flex-1 accent-[var(--water-paper)]" type="range" min="2" max="65" step="1" value={pitch} onChange={event => setPitch(Number(event.target.value))} /><output className="w-12 text-right tabular-nums">{pitch}°</output></label>
        </details>
        <label className="flex items-center gap-3"><span className="w-20 shrink-0">{t("heroPrototype.transition")}</span>
          <input ref={progressInput} disabled={reduced||status!=="ready"} type="range" min="0" max="100" defaultValue="0"
            className="min-w-0 flex-1 accent-[var(--water-paper)]" onChange={event=>seek.current(Number(event.target.value)/100)} />
          <output ref={progressOutput} className="w-12 text-right tabular-nums">0%</output>
        </label>
        <div className="flex justify-between gap-4">
          <button disabled={reduced||status!=="ready"} type="button" onClick={()=>play.current()}>{t("heroPrototype.playTransition")}</button>
          <button disabled={reduced||status!=="ready"} type="button" onClick={()=>play.current(true)}>{t("heroPrototype.returnScene")}</button>
        </div>
        <div className="flex justify-between gap-4"><button type="button" onClick={() => { setYaw(motion.camera.defaultOrbit); setPitch(motion.camera.defaultElevation); }}>{t("harryCampfire.reset")}</button><Link href="/lab/hero-archive">{t("heroPrototype.archive")}</Link></div>
      </fieldset>
      </details>}
    </div>
    {preview && <aside aria-label={t("heroPrototype.label")} className="fixed left-3 top-20 z-20 mx-auto max-w-3xl border border-[var(--water-paper)]/30 bg-[var(--water-ink)]/95 px-4 py-3 text-[var(--water-paper)] backdrop-blur-md">
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption">
        <button aria-pressed={forceReduced} onClick={() => setForceReduced(!forceReduced)}>{t(forceReduced ? "heroPrototype.motionOn" : "heroPrototype.motionOff")}</button>
      </div>
    </aside>}
  </div>
  </>;
}
