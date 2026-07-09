import type { Dictionary } from "./en";

/**
 * 【扩展性接口】中文 UI 字典,键位与 en.ts 强一致(Dictionary 校验)。
 */
export const zh: Dictionary = {
  nav: {
    work: "作品",
    blog: "博客",
    about: "关于",
    contact: "联系",
  },
  common: {
    language: "语言",
    backToBlog: "返回博客列表",
    comingSoon: "建设中。",
    home: "首页",
  },
  blog: {
    title: "博客",
    aboutLabel: "关于",
    description: "关于设计、代码与动效的记录——每月一篇,月末发布。",
    dateHeader: "日期",
    nameHeader: "标题",
  },
  footer: {
    byline: "Carrykit",
  },
};
