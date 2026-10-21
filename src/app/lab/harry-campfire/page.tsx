import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { HarryCampfire } from "@/components/motion/harry-campfire";
import { CampfireHero } from "@/components/motion/campfire-hero";

export const metadata: Metadata = {
  title: en.harryCampfire.title,
  description: en.harryCampfire.description,
  robots: { index: false, follow: false },
};

export default async function HarryCampfirePage({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const { variant } = await searchParams;
  if (process.env.NODE_ENV !== "production" && (variant === "1" || variant === "2")) return <CampfireHero preview />;
  return <HarryCampfire />;
}
