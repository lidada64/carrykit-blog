import type { Metadata } from "next";
import { fontVariables } from "@/config/fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Carrykit",
  description: "Personal blog & portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
