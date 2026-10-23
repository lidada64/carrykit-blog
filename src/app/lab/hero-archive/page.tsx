import type { Metadata } from "next";
import { HomeHero } from "@/components/home/home-hero";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: en.heroPrototype.archive, robots: { index: false, follow: false } };

/** Archived sky / disco-ball homepage; keep the original scene and interactions. */
export default function HeroArchivePage() {
  return <main className="mx-auto w-full max-w-[1120px] px-6 lg:px-12"><HomeHero /></main>;
}
