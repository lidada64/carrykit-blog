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

## Placeholder for Scrolling Effect

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi. Donec fermentum. Pellentesque malesuada nulla a mi.

Phasellus a est. Phasellus magna. In hac habitasse platea dictumst. Curabitur at lacus ac velit ornare lobortis. Curabitur a felis in nunc fringilla tristique. Morbi mattis ullamcorper velit. Phasellus gravida semper nisi. Nullam vel sem. Pellentesque libero tortor, tincidunt et, tincidunt eget, semper nec, quam. Sed hendrerit. Morbi ac felis. Nunc egestas, augue at pellentesque laoreet, felis eros vehicula leo, at malesuada velit leo quis pede. Donec interdum, metus et hendrerit aliquet, dolor diam sagittis ligula, eget egestas libero turpis vel mi.

Nunc nulla. Fusce risus nisl, viverra et, tempor et, pretium in, sapien. Donec venenatis vulputate lorem. Morbi nec metus. Phasellus blandit leo ut odio. Maecenas ullamcorper, dui et placerat feugiat, eros pede varius nisi, condimentum viverra felis nunc et lorem. Sed magna purus, fermentum eu, tincidunt eu, varius ut, felis. In auctor lobortis lacus. Quisque libero metus, condimentum nec, tempor a, commodo mollis, magna.

Vestibulum ullamcorper mauris at ligula. Fusce fermentum. Nullam cursus lacinia erat. Praesent blandit laoreet nibh. Fusce convallis metus id felis luctus adipiscing. Pellentesque egestas, neque sit amet convallis pulvinar, justo nulla eleifend augue, ac auctor orci leo non est. Quisque id mi. Ut tincidunt tincidunt erat. Etiam feugiat lorem non metus. Vestibulum dapibus nunc ac augue.

Sed mollis, eros et ultrices tempus, mauris ipsum aliquam libero, non adipiscing dolor urna a orci. Aenean commodo ligula eget dolor. Nulla facilisi. Sed mollis, eros et ultrices tempus, mauris ipsum aliquam libero, non adipiscing dolor urna a orci. Aenean commodo ligula eget dolor. Nulla facilisi.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi. Donec fermentum. Pellentesque malesuada nulla a mi.
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

  // 用 || 而非 ??:容器环境可能把未配置的变量注入为空字符串
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "carrykit-dev-only";
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
