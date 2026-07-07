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
  common: {
    language: "Language",
    backToBlog: "Back to blog",
    comingSoon: "Coming soon.",
    home: "Home",
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
