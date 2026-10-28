"use client";

import { useState } from "react";
import Link from "next/link";
import { BlogAssistant } from "@/components/motion/blog-assistant";
import { FadeUp } from "@/components/motion/fade-up";
import { TextRoll } from "@/components/motion/text-roll";
import { useBlogLayoutTransition } from "@/components/motion/use-blog-layout-transition";
import { useLocale, useT } from "@/i18n";
import { parseTitle } from "@/lib/blog-metadata";

export interface BlogListItem {
  preview?: boolean; slug: string; title: string; titleEn?: string | null; date: string;
  cleanTitle: string; cleanTitleEn: string | null; tags: string[];
  category: string; color: "book" | "agent" | "notes" | "unknown"; depth: number;
}

const colors = { book: "var(--blog-book)", agent: "var(--blog-agent)", notes: "var(--blog-notes)", unknown: "var(--blog-unknown)" };

export function BlogList({ posts }: { posts: BlogListItem[] }) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const { scope, transition, closing } = useBlogLayoutTransition();
  return <section className="mx-[calc(50%-50vw)] px-6 py-16 lg:px-12 lg:py-24">
    <div ref={scope} className={open ? "mx-auto max-w-[1440px] gap-16 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]" : "mx-auto max-w-[1440px] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.618fr)] lg:gap-16"}>
      <FadeUp as="aside" stagger className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
        <h1 className="text-heading font-display">{t("blog.title")}</h1>
        <BlogAssistant preview={posts.some(post => post.preview)} open={open} onToggle={() => transition(() => setOpen(value => !value), !open)} />
      </FadeUp>
      <div data-blog-flip="article" data-flip-id="articles" className={open ? "relative mt-12 min-w-0 xl:mt-0" : "relative mt-12 min-w-0 lg:mt-0"}>
        <div data-blog-header aria-hidden={open} className={open ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "relative"}>
          <FadeUp className="grid grid-cols-[6.5rem_1fr] border-b border-border pb-3 text-caption font-mono uppercase text-muted"><span>{t("blog.dateHeader")}</span><span>{t("blog.nameHeader")}</span></FadeUp>
        </div>
        <FadeUp as="ul" stagger>
          {posts.map(post => {
            const localized = parseTitle(locale === "en" && post.titleEn ? post.titleEn : post.title);
            const prefix = localized.tags.map(tag => `[${tag}]`).join("");
            return <li key={post.slug}>
              <Link aria-disabled={closing || undefined} tabIndex={closing ? -1 : undefined} onClick={event => { if (closing) event.preventDefault(); }} data-blog-flip="article" data-flip-id={`post-${post.slug}`} href={post.preview ? `/blog/preview/${post.slug}` : `/blog/${post.slug}`} className={open ? "grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4 max-md:portrait:grid-cols-[6.5rem_minmax(0,1fr)] max-md:portrait:gap-0 focus-visible:outline-2 focus-visible:outline-accent" : `${closing ? "pointer-events-none" : "group"} relative -mx-3 grid grid-cols-[6.5rem_1fr] items-center border-b border-transparent px-3 py-5 transition-[background-color] duration-500 ${closing ? "" : "hover:bg-foreground focus-visible:bg-foreground"}`} title={[post.date, ...post.tags].join(" · ")}>
                <span className={open ? "relative block h-14" : "relative block font-mono text-caption text-muted group-hover:text-background group-focus-visible:text-background"}>
                  <span aria-hidden={open} className={open ? "absolute inset-0 flex items-center font-mono text-caption text-muted" : "block"}><TextRoll text={post.date} expanded={open} blogRoll /></span>
                  <span className="pointer-events-none absolute left-0 top-0 z-10 h-14 w-full overflow-hidden">
                  <span data-blog-band className={`absolute inset-0 flex h-14 min-w-0 flex-col items-center justify-center overflow-hidden px-1 text-center leading-none ${open ? "" : "invisible"}`} style={{ backgroundColor: `color-mix(in srgb, ${colors[post.color]} ${100 - post.depth * 15}%, var(--assistant-entry-background))`, color: "var(--blog-band-text)" }}>
                    <span className="font-display text-caption font-bold">{post.date.slice(2, 4)} / {post.date.slice(5, 7)}</span><span className="max-w-full truncate font-body text-caption font-light italic tracking-widest">{post.category || t("blog.uncategorized")}</span>
                  </span>
                  </span>
                </span>
                <span className={open ? "relative flex min-w-0 justify-end py-3 text-body max-md:portrait:justify-start" : "relative min-w-0 text-body group-hover:text-background group-focus-visible:text-background"}>
                  {prefix && <span data-blog-prefix aria-hidden={open} className={open ? "pointer-events-none absolute left-0 top-0 whitespace-nowrap text-caption text-muted opacity-0" : "mr-2 inline-block whitespace-nowrap"}><TextRoll text={prefix} expanded={open} blogRoll /></span>}
                  <span data-blog-flip="article" data-flip-id={`title-${post.slug}`} className={open ? "block w-fit max-w-full text-right [overflow-wrap:anywhere] max-md:portrait:text-left" : "inline-block max-w-full"}>
                    <TextRoll text={localized.title} className="text-body" expanded={open} blogRoll />
                  </span>
                </span>
                {!open && <span aria-hidden="true" data-blog-divider className={`pointer-events-none absolute inset-x-0 bottom-0 border-b border-border ${closing ? "opacity-0" : ""}`} />}
                {open && <span className="sr-only">{post.date} {post.tags.join(", ")}</span>}
              </Link>
            </li>;
          })}
        </FadeUp>
      </div>
    </div>
  </section>;
}
