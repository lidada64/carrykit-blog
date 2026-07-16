"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollSmoother } from "@/lib/gsap/ScrollSmoother";
import { useRef } from "react";
import { prefersReducedMotion } from "@/components/motion/reduced-motion";
import { motionTokens } from "@/components/motion/tokens";
import { Bilingual } from "@/components/ui/bilingual";

export function BackToTop() {
  const containerRef = useRef<HTMLButtonElement>(null);
  
  // Outer horizontal lines (shrink on hover)
  const leftBarRef = useRef<HTMLDivElement>(null);
  const rightBarRef = useRef<HTMLDivElement>(null);
  
  // Arrow heads (rotate on hover)
  const leftArrowRef = useRef<HTMLDivElement>(null);
  const rightArrowRef = useRef<HTMLDivElement>(null);

  // Center elements
  const dotRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP({ scope: containerRef });

  const onEnter = () => {
    contextSafe(() => {
      if (prefersReducedMotion()) return;
      
      // Outer bars shrink inwards
      gsap.to([leftBarRef.current, rightBarRef.current], {
        scaleX: 0,
        opacity: 0,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });

      // Left arrow (originally pointing right) rotates up (-90deg)
      gsap.to(leftArrowRef.current, {
        rotation: -90,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });

      // Right arrow (originally pointing left) rotates up (90deg)
      gsap.to(rightArrowRef.current, {
        rotation: 90,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });

      // Center dot disappears
      gsap.to(dotRef.current, {
        opacity: 0,
        scale: 0,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });

      // Text appears
      gsap.to(textRef.current, {
        opacity: 1,
        scale: 1,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });
    })();
  };

  const onLeave = () => {
    contextSafe(() => {
      if (prefersReducedMotion()) return;
      
      // Outer bars restore
      gsap.to([leftBarRef.current, rightBarRef.current], {
        scaleX: 1,
        opacity: 1,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });

      // Arrows restore rotation
      gsap.to([leftArrowRef.current, rightArrowRef.current], {
        rotation: 0,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });

      // Center dot appears
      gsap.to(dotRef.current, {
        opacity: 1,
        scale: 1,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });

      // Text disappears
      gsap.to(textRef.current, {
        opacity: 0,
        scale: 0.8,
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.transition,
      });
    })();
  };

  const scrollToTop = () => {
    const smoother = ScrollSmoother.get();
    if (smoother) {
      smoother.scrollTo(0, true);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <button
      ref={containerRef}
      onClick={scrollToTop}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className="group relative flex h-32 w-full cursor-pointer items-center justify-center outline-none"
      aria-label="Back to top"
    >
      <div className="flex w-full max-w-[400px] items-center justify-between text-muted-foreground/60 transition-colors group-hover:text-muted-foreground">
        
        {/* Left Side: Bar + Arrow Right */}
        <div className="flex items-center">
          <div ref={leftBarRef} className="h-[2px] w-12 bg-current origin-right"></div>
          <div ref={leftArrowRef} className="flex origin-center items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </div>
        </div>

        {/* Center: Dot <-> Text */}
        <div className="relative flex flex-1 h-10 items-center justify-center">
          <div ref={dotRef} className="absolute w-3 h-3 rounded-full border-[2px] border-current"></div>
          <div ref={textRef} className="absolute whitespace-nowrap opacity-0 scale-80 text-sm font-mono uppercase tracking-widest">
            <Bilingual zh="--回朕车以复路兮--" en="--TO- TOP--" />
          </div>
        </div>

        {/* Right Side: Arrow Left + Bar */}
        <div className="flex items-center">
          <div ref={rightArrowRef} className="flex origin-center items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </div>
          <div ref={rightBarRef} className="h-[2px] w-12 bg-current origin-left"></div>
        </div>

      </div>
    </button>
  );
}
