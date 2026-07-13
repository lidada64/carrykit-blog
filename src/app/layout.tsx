import type { Metadata } from "next";
import { fontVariables } from "@/config/fonts";
import { site } from "@/config/site";
import { en } from "@/i18n/en";
import { LocaleProvider } from "@/i18n";
import { ThemeProvider } from "next-themes";
import "@/styles/globals.css";

/** SEO 基础(M3-8):metadataBase 供 OG/sitemap 生成绝对 URL;文案单源引自英文字典 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: site.name, template: `%s — ${site.name}` },
  description: en.home.descriptionRight,
  openGraph: { siteName: site.name, type: "website" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
