/**
 * 站点常量:站名、联系方式、社交链接。
 * 这些是数据(非 UI 文案),不进 i18n 字典;改联系方式/社交链接只改本文件。
 */
export const site = {
  name: "Carrykit",
  contactEmail: "lidada317988@gmail.com",
  socials: [{ label: "GitHub", href: "https://github.com/lidada64" }],
  /** Blog 列表侧栏缩略图(DESIGN_SPEC §6 线框);V1 图片走外链 URL */
  blogThumbnail: "/DE.jpg",
  /** Home hero 大图(DESIGN_SPEC §6 线框);V1 图片走外链 URL */
  heroImage: "/outerwilds.webp",
  /** About 页 SKILLS 节的技能/关注领域列表(US-A2);技能为专有名词,不进 i18n */
  skills: [
    "TypeScript",
    "Next.js",
    "React",
    "Tailwind CSS",
    "GSAP",
    "Node.js",
    "SQLite",
  ],
} as const;
