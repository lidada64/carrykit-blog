import localFont from "next/font/local";

/**
 * 【扩展性接口】字体唯一定义处(ARCHITECTURE §7.1 / DESIGN_SPEC §2)。
 * 更换字体只改本文件的导入与配置;导出的 CSS 变量名
 * (--font-display / --font-body / --font-mono)保持不变,全站自动生效。
 * 注意:next/font 要求配置为字面量,不能提取共享变量。
 */

export const newFont = localFont({
  src: "../assets/fonts/FengYaShiSong-2.woff",
  variable: "--font-zh",
  display: "swap",
});

export const fontDisplay = localFont({
  src: "../assets/fonts/girassol.woff2",
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const fontBody = localFont({
  src: "../assets/fonts/geist.woff2",
  weight: "100 900",
  variable: "--font-body",
  display: "swap",
});

export const fontMono = localFont({
  src: "../assets/fonts/geist-mono.woff2",
  weight: "100 900",
  variable: "--font-mono",
  display: "swap",
});

/** 背景播报文字墙(HR-BG)专用字体 Anton SC(次级文字,区别于标题/正文) */
export const fontBroadcast = localFont({
  src: "../assets/fonts/anton-sc.woff2",
  weight: "400",
  variable: "--font-broadcast",
  display: "swap",
});

/** 主页矢量大标题专用字体 IM Fell English SC(古典衬线小型大写) */
export const fontTitle = localFont({
  src: "../assets/fonts/im-fell-english-sc.woff2",
  weight: "400",
  variable: "--font-title",
  display: "swap",
});

/** 挂到 <html> 上的变量类名集合,根 layout 使用 */
export const fontVariables = `${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} ${newFont.variable} ${fontBroadcast.variable} ${fontTitle.variable}`;
