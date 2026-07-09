import type { MetadataRoute } from "next";

/** robots(M3-8):admin 与临时 styleguide 不收录 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.SITE_URL ?? "http://localhost:3000";

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/styleguide"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
