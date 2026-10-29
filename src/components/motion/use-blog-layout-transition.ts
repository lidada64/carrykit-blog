"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";

gsap.registerPlugin(Flip);

/** Portrait phones keep their natural stacked layout; only the labels animate. */
export function useBlogLayoutTransition() {
  const scope = useRef<HTMLDivElement>(null);
  const animation = useRef<gsap.core.Timeline | null>(null);
  const waiting = useRef(false);
  const [closing, setClosing] = useState(false);
  const { contextSafe } = useGSAP({ scope });
  function transition(change: () => void, opening: boolean) {
    contextSafe(() => {
      if (waiting.current) return;
      const root = scope.current;
      animation.current?.kill();
      if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        root?.removeAttribute("data-blog-roll-locked");
        setClosing(false);
        change();
        return;
      }
      const startTransition = () => {
        root.setAttribute("data-blog-roll-locked", "");
        waiting.current = false;
        const phone = window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
        const articleTargets = '[data-blog-flip="article"]';
        const assistantTargets = '[data-blog-flip="assistant"]';
        const articleBefore = phone ? null : Flip.getState(root.querySelectorAll<HTMLElement>(articleTargets));
        const assistantBefore = phone ? null : Flip.getState(root.querySelectorAll<HTMLElement>(assistantTargets));
        flushSync(() => { setClosing(!opening); change(); });
        const timeline = gsap.timeline({ onComplete: () => {
          if (!opening) root.removeAttribute("data-blog-roll-locked");
          setClosing(false);
        } });
        animation.current = timeline;
        if (opening) {
          timeline.fromTo(root.querySelectorAll("[data-blog-band]"), { autoAlpha: 1, yPercent: 100 }, { autoAlpha: 1, yPercent: 0, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, 0)
            .fromTo(root.querySelectorAll("[data-blog-prefix]"), { xPercent: 0, opacity: 1 }, { xPercent: -100, opacity: 0, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, 0)
            .fromTo(root.querySelectorAll("[data-blog-header]"), { yPercent: 0, autoAlpha: 1 }, { yPercent: 100, autoAlpha: 0, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, 0);
        }
        if (!opening) {
          timeline.fromTo(root.querySelectorAll("[data-blog-band]"), { autoAlpha: 1, yPercent: 0 }, { autoAlpha: 0, yPercent: 100, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, motionTokens.duration.base)
            .fromTo(root.querySelectorAll("[data-blog-prefix]"), { xPercent: -100, opacity: 0 }, { xPercent: 0, opacity: 1, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, motionTokens.duration.base)
            .fromTo(root.querySelectorAll("[data-blog-header]"), { yPercent: 100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, motionTokens.duration.base)
            .fromTo(root.querySelectorAll("[data-blog-divider]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: motionTokens.duration.fast, ease: motionTokens.ease.transition }, motionTokens.duration.base);
        }
        if (articleBefore && assistantBefore) {
          const flipOptions = { nested: true, duration: motionTokens.duration.base, ease: motionTokens.ease.transition, absolute: false, scale: false };
          const articleFlip = Flip.from(articleBefore, { ...flipOptions, targets: root.querySelectorAll(articleTargets) });
          const assistantFlip = Flip.from(assistantBefore, { ...flipOptions, targets: root.querySelectorAll(assistantTargets), duration: motionTokens.duration.slow });
          if (opening) {
            timeline.add(articleFlip, motionTokens.blogExpansion.lead)
              .add(assistantFlip, motionTokens.blogExpansion.lead);
          } else {
            timeline.add(assistantFlip, 0).add(articleFlip, 0);
          }
        }
      };
      if (!opening) {
        startTransition();
        return;
      }
      root.setAttribute("data-blog-roll-locked", "");
      const rolling = Array.from(root.querySelectorAll<HTMLElement>("[data-blog-roll] > span"))
        .filter(element => Math.abs(Number(gsap.getProperty(element, "yPercent"))) > 0.01 || gsap.getTweensOf(element, true).length > 0);
      if (!rolling.length) {
        startTransition();
        return;
      }
      waiting.current = true;
      const finish = gsap.timeline({ onComplete: startTransition });
      animation.current = finish;
      for (const element of rolling) {
        const current = Number(gsap.getProperty(element, "yPercent"));
        gsap.killTweensOf(element);
        const remaining = Math.max(0, Math.min(2, 2 + current / (100 / 3)));
        finish.to(element, { yPercent: -200 / 3, duration: motionTokens.duration.base * remaining, ease: "none" }, 0)
          .set(element, { yPercent: 0 });
      }
    })();
  }
  return { scope, transition, closing };
}
