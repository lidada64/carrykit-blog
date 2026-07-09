/**
 * 【扩展性接口】英文 UI 字典(ARCHITECTURE §7.3)。
 * 结构基准:zh.ts 必须与本文件键位完全一致(由 Dictionary 类型强校验)。
 * 字典最多两级嵌套;新增文案必须同时更新 en.ts 与 zh.ts。
 */
export const en = {
  nav: {
    work: "Work",
    blog: "Blog",
    about: "About",
    contact: "Contact",
  },
  home: {
    slogan: "Design-minded developer building web experiences.",
    descriptionLeft:
      "I care about the small things: type scales, spacing, easing curves and the words in between.",
    descriptionRight:
      "This site collects my projects and monthly notes on design, code and motion.",
    selectedWorkLabel: "Selected Work",
    latestWritingLabel: "Latest Writing",
  },
  common: {
    language: "Language",
    backToBlog: "Back to blog",
    comingSoon: "Coming soon.",
    home: "Home",
  },
  blog: {
    title: "Blog",
    aboutLabel: "About",
    description:
      "Notes on design, code and motion — one article a month, released towards the end of the month.",
    dateHeader: "Date",
    nameHeader: "Name",
    dateLabel: "Date",
    tagsLabel: "Tags",
    relatedLabel: "Related Articles",
  },
  work: {
    linkLabel: "Visit project",
  },
  about: {
    bioLabel: "Bio",
    skillsLabel: "Skills",
    connectLabel: "Connect",
    intro: "I build things for the web, with care for layout, motion and words.",
    bio: "Carrykit is my corner of the internet: a place to show work, share notes and experiment with web motion. This site is built with Next.js, GSAP and SQLite, and runs on a small VPS.",
  },
  footer: {
    byline: "Carrykit",
  },
} as const;

/** 值放宽为 string 的字典结构类型,供 zh.ts 与后续语言实现 */
export type Dictionary = DeepRecord<typeof en>;

type DeepRecord<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepRecord<T[K]>;
};
