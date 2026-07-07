import { Geist, Geist_Mono } from "next/font/google";

/**
 * 【扩展性接口】字体唯一定义处(ARCHITECTURE §7.1 / DESIGN_SPEC §2)。
 * 更换字体只改本文件的导入与配置;导出的 CSS 变量名
 * (--font-display / --font-body / --font-mono)保持不变,全站自动生效。
 * 注意:next/font 要求配置为字面量,不能提取共享变量。
 */

export const fontDisplay = Geist({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  fallback: ["Noto Sans SC", "PingFang SC", "Microsoft YaHei", "sans-serif"],
});

export const fontBody = Geist({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  fallback: ["Noto Sans SC", "PingFang SC", "Microsoft YaHei", "sans-serif"],
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  fallback: ["Noto Sans SC", "PingFang SC", "Microsoft YaHei", "monospace"],
});

/** 挂到 <html> 上的变量类名集合,根 layout 使用 */
export const fontVariables = `${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`;
