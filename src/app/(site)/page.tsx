import { CampfireHero } from "@/components/motion/campfire-hero";

import { Preloader } from "@/components/motion/preloader";

export default function HomePage() {
  return <>
    <Preloader />
    <CampfireHero />
  </>;
}
