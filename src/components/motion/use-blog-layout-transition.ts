"use client";

import { useRef } from "react";
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
  const { contextSafe } = useGSAP({ scope });
  function transition(change: () => void, opening: boolean) {
    contextSafe(() => {
      const root = scope.current;
      animation.current?.kill();
      if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        change();
        return;
      }
      const phone = window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
      const articleTargets = '[data-blog-flip="article"]';
      const assistantTargets = '[data-blog-flip="assistant"]';
      const articleBefore = phone ? null : Flip.getState(root.querySelectorAll<HTMLElement>(articleTargets));
      const assistantBefore = phone ? null : Flip.getState(root.querySelectorAll<HTMLElement>(assistantTargets));
      flushSync(change);
      const timeline = gsap.timeline();
      animation.current = timeline;
      if (opening) {
        timeline.fromTo(root.querySelectorAll("[data-blog-band]"), { yPercent: 100 }, { yPercent: 0, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, 0)
          .fromTo(root.querySelectorAll("[data-blog-prefix]"), { yPercent: 0, opacity: 1 }, { yPercent: 100, opacity: 0, duration: motionTokens.blogExpansion.lead, ease: motionTokens.ease.transition }, 0);
      }
      if (articleBefore && assistantBefore) {
        const flipOptions = { paused: true, nested: true, duration: motionTokens.duration.base, ease: motionTokens.ease.transition, absolute: false, scale: false };
        const articleFlip = Flip.from(articleBefore, { ...flipOptions, targets: root.querySelectorAll(articleTargets) });
        const assistantFlip = Flip.from(assistantBefore, { ...flipOptions, targets: root.querySelectorAll(assistantTargets), duration: motionTokens.duration.slow });
        if (opening) {
          timeline.add(articleFlip, motionTokens.blogExpansion.lead)
            .add(assistantFlip, motionTokens.blogExpansion.lead + motionTokens.duration.base);
        } else {
          timeline.add(assistantFlip, 0).add(articleFlip, 0);
        }
      }
    })();
  }
  return { scope, transition };
}
