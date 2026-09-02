import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";
import { en } from "@/i18n/en";

export const metadata: Metadata = {
  title: en.nav.radar,
};

/** Radar 页占位接口(取代原 about);内容待接入,先给出可路由的骨架 */
export default function RadarPage() {
  return <PagePlaceholder titleKey="nav.radar" />;
}
