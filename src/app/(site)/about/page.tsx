import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { AboutContent } from "./about-content";

export const metadata: Metadata = {
  title: en.nav.about,
  description: en.about.intro,
};

export default function AboutPage() {
  return <AboutContent />;
}
