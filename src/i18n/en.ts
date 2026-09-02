/**
 * 【扩展性接口】英文 UI 字典(ARCHITECTURE §7.3)。
 * 结构基准:zh.ts 必须与本文件键位完全一致(由 Dictionary 类型强校验)。
 * 字典最多两级嵌套;新增文案必须同时更新 en.ts 与 zh.ts。
 */
export const en = {
  nav: {
    work: "Work",
    blog: "Blog",
    radar: "Radar",
    about: "About",
    contact: "Contact",
  },
  home: {
    slogan: "Welcome to CarryKit",
    descriptionLeft:
      "This is my blog, for recording and sharing",
    descriptionRight:
      "This site collects my projects, posts and design",
    selectedWorkLabel: "Selected Work",
    latestWritingLabel: "Latest Writing",
  },
  common: {
    language: "Language",
    backToBlog: "Back to blog",
    comingSoon: "Coming soon.",
    home: "Home",
    themeDark: "Dark",
    themeLight: "Light",
  },
  blog: {
    title: "Blog",
    aboutLabel: "About",
    description: "Sharing thoughts, updated anytime.",
    dateHeader: "Date",
    nameHeader: "Name",
    dateLabel: "Date",
    tagsLabel: "Tags",
    relatedLabel: "Related Articles",
  },
  work: {
    linkLabel: "Visit project",
    description: "Selected projects — web experiences, motion and tools.",
  },
  about: {
    bioLabel: "Bio",
    skillsLabel: "Skills",
    connectLabel: "Connect",
    intro: "I build things for the web, with care for layout, motion and words.",
    bio: "Carrykit is my corner of the internet: a place to show work, share notes and experiment with web motion. This site is built with Next.js, GSAP and SQLite, and runs on a small VPS.",
  },
  admin: {
    title: "Admin",
    loginTitle: "Sign in",
    emailLabel: "Email",
    passwordLabel: "Password",
    loginButton: "Sign in",
    loginError: "Invalid email or password.",
    logout: "Log out",
    postsLink: "Posts",
    projectsLink: "Projects",
    newPost: "New post",
    editPost: "Edit post",
    titleLabel: "Title",
    titleEnLabel: "Title (En)",
    slugLabel: "Slug",
    excerptLabel: "Excerpt",
    excerptEnLabel: "Excerpt (En)",
    coverImageLabel: "Cover image",
    tagsFieldLabel: "Tags (comma separated)",
    contentLabel: "Content",
    contentEnLabel: "Content (En)",
    statusLabel: "Status",
    statusDraft: "Draft",
    statusPublished: "Published",
    publishedAtLabel: "Published Date",
    saveButton: "Save",
    editLink: "Edit",
    translateButton: "✨ Translate to English",
    translatingText: "Translating...",
    deleteButton: "Delete",
    confirmDelete: "Delete this item? This cannot be undone.",
    invalidError: "Title, slug and content are required.",
    slugTakenError: "Slug is already in use.",
    newProject: "New project",
    editProject: "Edit project",
    summaryLabel: "Summary",
    summaryEnLabel: "Summary (En)",
    linkFieldLabel: "External link URL",
    orderLabel: "Order",
    publishedLabel: "Published",
    editTab: "Edit",
    previewTab: "Preview",
    uploadTab: "Upload",
    urlTab: "URL",
    uploadDropzone: "Drop image here or click to select",
    uploading: "Uploading…",
    uploadClear: "Remove",
    uploadInvalidType: "Only image files are allowed.",
    uploadTooLarge: "File too large, maximum 5 MB.",
    uploadFailed: "Upload failed, please try again.",
    insertImage: "Insert image",
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
