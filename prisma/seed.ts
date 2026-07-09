import "dotenv/config";
import { hashSync } from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 种子数据(TASKS M0-4):3 篇文章、4 个作品、1 个 admin 用户。
 * admin 凭据来自 ADMIN_EMAIL / ADMIN_PASSWORD 环境变量;
 * 未设置时使用仅供本地开发的默认值(生产部署必须设置环境变量,见 docs/ARCHITECTURE.md §6)。
 * 幂等:按 slug/email upsert,可重复执行。
 */

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const db = new PrismaClient({ adapter });

const posts = [
  {
    slug: "hello-carrykit",
    title: "Hello, Carrykit",
    excerpt: "Why I am rebuilding my corner of the internet from scratch.",
    tags: "meta,writing",
    coverImage: "https://picsum.photos/seed/carrykit-hello-cover/1600/900",
    publishedAt: new Date("2026-05-11"),
    content: `# Hello, Carrykit

This is the first post on the rebuilt site.

## Why rebuild

I wanted a place that is **mine**: layout, motion, and words.

- Built with Next.js and GSAP
- Content lives in SQLite
- Deployed on a small VPS

## What to expect

One article a month, released towards the end of the month.

\`\`\`ts
const site = { pages: ["home", "work", "blog", "about"] };
console.log(site.pages.length); // 4
\`\`\`

> Creativity isn't just a skill, it's a mindset.

![placeholder](https://picsum.photos/seed/carrykit-hello/1200/630)
`,
  },
  {
    slug: "designing-with-type-scales",
    title: "Designing with Type Scales",
    excerpt: "Five sizes, big steps: how a strict type scale keeps design honest.",
    tags: "design,typography",
    coverImage: "", // 故意无封面:验证详情页头图区优雅隐藏(US-B4)
    publishedAt: new Date("2026-06-07"),
    content: `# Designing with Type Scales

Pick 3~5 font sizes for the whole project, with **big** steps between them.

## The scale here

1. Display — hero statements
2. Heading — section titles
3. Subheading — card titles
4. Body — paragraphs
5. Caption — dates and labels

Grids are guidelines, not rules.
`,
  },
  {
    slug: "scroll-driven-galleries",
    title: "Scroll-driven Galleries with GSAP",
    excerpt: "Notes on pinning, scrubbing and digit-roll counters.",
    tags: "dev,animation,gsap",
    coverImage: "https://picsum.photos/seed/scroll-gallery-cover/1600/900",
    publishedAt: new Date("2026-07-01"),
    content: `# Scroll-driven Galleries with GSAP

ScrollTrigger's \`pin\` + \`scrub\` combo drives the work page.

## Ingredients

- A pinned viewport-height section
- Images swapped by scroll progress
- An index counter that rolls inside an overflow mask

\`\`\`js
gsap.to(el, { yPercent: -100, ease: "power4.out" });
\`\`\`
`,
  },
];

const projects = [
  {
    slug: "carrykit-blog",
    title: "Carrykit Blog",
    summary: "This site: Next.js, GSAP and SQLite on a VPS.",
    tags: "Next.js,GSAP,Prisma",
    link: "https://github.com/lidada64/carrykit-blog",
    order: 1,
    coverImage: "https://picsum.photos/seed/carrykit-blog/1600/1000",
    content: `# Carrykit Blog

A personal blog & portfolio, replicating the layout and motion of a
reference site with Next.js, Tailwind and GSAP.
`,
  },
  {
    slug: "sample-brand-site",
    title: "Sample Brand Site",
    summary: "Placeholder project — replace with a real one in admin.",
    tags: "Design,Web",
    link: "",
    order: 2,
    coverImage: "https://picsum.photos/seed/brand-site/1600/1000",
    content: `# Sample Brand Site

Seed placeholder. Edit or delete me in /admin.
`,
  },
  {
    slug: "sample-motion-study",
    title: "Sample Motion Study",
    summary: "Placeholder project — GSAP interaction experiments.",
    tags: "GSAP,Animation",
    link: "",
    order: 3,
    coverImage: "https://picsum.photos/seed/motion-study/1600/1000",
    content: `# Sample Motion Study

Seed placeholder. Edit or delete me in /admin.
`,
  },
  {
    slug: "sample-cli-tool",
    title: "Sample CLI Tool",
    summary: "Placeholder project — a small developer tool.",
    tags: "TypeScript,CLI",
    link: "",
    order: 4,
    coverImage: "https://picsum.photos/seed/cli-tool/1600/1000",
    content: `# Sample CLI Tool

Seed placeholder. Edit or delete me in /admin.
`,
  },
];

async function main() {
  for (const post of posts) {
    await db.post.upsert({
      where: { slug: post.slug },
      create: { ...post, status: "PUBLISHED" },
      update: { ...post, status: "PUBLISHED" },
    });
  }

  for (const project of projects) {
    await db.project.upsert({
      where: { slug: project.slug },
      create: project,
      update: project,
    });
  }

  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "carrykit-dev-only";
  await db.user.upsert({
    where: { email },
    create: { email, passwordHash: hashSync(password, 10) },
    update: {},
  });

  const [postCount, projectCount, userCount] = await Promise.all([
    db.post.count(),
    db.project.count(),
    db.user.count(),
  ]);
  console.log(
    `Seed done: ${postCount} posts, ${projectCount} projects, ${userCount} user(s). Admin: ${email}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
