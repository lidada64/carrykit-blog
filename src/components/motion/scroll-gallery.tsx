"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { motionTokens } from "./tokens";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export interface GalleryProject {
  slug: string;
  title: string;
  summary: string;
  coverImage: string;
}

/**
 * Work 滚动驱动画廊(DESIGN_SPEC A5 / PRD US-W1):
 * ScrollTrigger pin 整屏,滚动进度离散切换当前作品:
 * ① 大图交叉淡切 ② 序号双 digit 在 overflow mask 内上移翻转
 * ③ 作品名列表 — indicator 位移 + 当前名高亮;前后留 whitespace 缓冲。
 * 仅 md+ 且未开启减弱动态时创建(gsap.matchMedia);
 * 其余情况本组件被 CSS 隐藏(hidden motion-safe:md:block),
 * 由 WorkGallery 的静态卡片列表兜底。正反向滚动均按进度驱动。
 */
export function ScrollGallery({ projects }: { projects: GalleryProject[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || projects.length === 0) return;

      const mm = gsap.matchMedia();
      // 768px = Tailwind md 断点;reduced-motion 由 media query 排除
      mm.add(
        "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
        () => {
          const stage = root.querySelector<HTMLElement>("[data-stage]");
          if (!stage) return;
          const images = gsap.utils.toArray<HTMLElement>(
            "[data-gallery-image]",
            root,
          );
          const summaries = gsap.utils.toArray<HTMLElement>(
            "[data-gallery-summary]",
            root,
          );
          const names = gsap.utils.toArray<HTMLElement>(
            "[data-gallery-name]",
            root,
          );
          const digitColumns = gsap.utils.toArray<HTMLElement>(
            "[data-digit-column]",
            root,
          );
          const dash = root.querySelector<HTMLElement>("[data-indicator]");

          const setIndex = (next: number, immediate: boolean) => {
            indexRef.current = next;
            const duration = immediate ? 0 : motionTokens.duration.base;
            const ease = motionTokens.ease.transition;

            images.forEach((image, i) => {
              gsap.to(image, {
                autoAlpha: i === next ? 1 : 0,
                duration,
                ease,
                overwrite: "auto",
              });
            });
            summaries.forEach((summary, i) => {
              gsap.to(summary, {
                autoAlpha: i === next ? 1 : 0,
                duration,
                ease,
                overwrite: "auto",
              });
            });
            digitColumns.forEach((column) => {
              gsap.to(column, {
                yPercent: -100 * next,
                duration,
                ease: motionTokens.ease.enter,
                overwrite: "auto",
              });
            });
            names.forEach((name, i) => {
              name.classList.toggle("text-foreground", i === next);
              name.classList.toggle("text-muted", i !== next);
            });
            if (dash && names[next]) {
              gsap.to(dash, {
                y: names[next].offsetTop,
                duration,
                ease,
                overwrite: "auto",
              });
            }
          };

          setIndex(0, true);

          ScrollTrigger.create({
            trigger: stage,
            start: "top top",
            // 每个作品一屏滚动量,滚完全部作品才解除 pin
            end: () => `+=${projects.length * window.innerHeight}`,
            pin: true,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const next = Math.min(
                projects.length - 1,
                Math.floor(self.progress * projects.length),
              );
              if (next !== indexRef.current) setIndex(next, false);
            },
          });
        },
      );
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="hidden motion-safe:md:block">
      {/* whitespace 滚动缓冲区(进入) */}
      <div aria-hidden className="h-[20vh]" />
      <section
        data-stage
        className="grid h-svh grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-center gap-16"
      >
        <div className="flex flex-col gap-6">
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-border/40">
            {projects.map((project, index) => (
              <Link
                key={project.slug}
                href={`/work/${project.slug}`}
                data-gallery-image
                className="absolute inset-0"
                style={
                  index === 0
                    ? undefined
                    : { opacity: 0, visibility: "hidden" }
                }
              >
                {project.coverImage && (
                  <Image
                    src={project.coverImage}
                    alt={project.title}
                    fill
                    priority={index === 0}
                    sizes="(min-width: 768px) 70vw, 100vw"
                    className="object-cover"
                  />
                )}
              </Link>
            ))}
          </div>
          <div className="flex items-start gap-6">
            {/* 序号:双 digit wrapper,各自在 1lh mask 内上移翻转 */}
            <span aria-hidden className="flex text-heading font-mono">
              <span
                className="inline-block overflow-hidden"
                style={{ height: "1lh" }}
              >
                <span data-digit-column className="flex flex-col">
                  {projects.map((project, index) => (
                    <span key={project.slug}>
                      {Math.floor((index + 1) / 10)}
                    </span>
                  ))}
                </span>
              </span>
              <span
                className="inline-block overflow-hidden"
                style={{ height: "1lh" }}
              >
                <span data-digit-column className="flex flex-col">
                  {projects.map((project, index) => (
                    <span key={project.slug}>{(index + 1) % 10}</span>
                  ))}
                </span>
              </span>
            </span>
            {/* 当前作品一句话描述:grid 叠放,随索引淡切 */}
            <span className="grid flex-1">
              {projects.map((project, index) => (
                <span
                  key={project.slug}
                  data-gallery-summary
                  className="col-start-1 row-start-1 max-w-[48ch] text-body text-muted"
                  style={
                    index === 0
                      ? undefined
                      : { opacity: 0, visibility: "hidden" }
                  }
                >
                  {project.summary}
                </span>
              ))}
            </span>
          </div>
        </div>
        <ul className="relative flex flex-col gap-3 pl-8">
          <span
            data-indicator
            aria-hidden
            className="absolute left-0 top-0 text-subheading"
          >
            —
          </span>
          {projects.map((project, index) => (
            <li
              key={project.slug}
              data-gallery-name
              className={`transition-colors ${
                index === 0 ? "text-foreground" : "text-muted"
              }`}
            >
              <Link
                href={`/work/${project.slug}`}
                className="text-subheading hover:text-foreground"
              >
                {project.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {/* whitespace 滚动缓冲区(离开) */}
      <div aria-hidden className="h-[20vh]" />
    </div>
  );
}
