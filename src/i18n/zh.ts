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
    dateLabel: "日期",
    tagsLabel: "标签",
    relatedLabel: "相关文章",
  },
  work: {
    linkLabel: "访问项目",
  },
  about: {
    bioLabel: "简介",
    skillsLabel: "技能",
    connectLabel: "联系",
    intro: "为 Web 而做:在意布局、动效与文字。",
    bio: "Carrykit 是我在互联网上的一个角落:展示作品、记录想法、试验 Web 动效。本站用 Next.js、GSAP 与 SQLite 构建,运行在一台小 VPS 上。",
  },
  footer: {
    byline: "Carrykit",
  },
};
