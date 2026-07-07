# ARCHITECTURE — 技术架构文档

> 版本:v2.0 | 日期:2026-07-07
> 需求来源:[PRD.md](PRD.md)
> v2 变更:动效库改 GSAP(对齐参考站);新增 §7 扩展性接口、§8 仓库与分支

## 1. 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | **Next.js 16 (App Router) + TypeScript** | 全栈单体,前后端同仓同框架;SSG/ISR 满足 SEO;vibecoding 上下文集中(M0 锁定 16.2.10,版本以 package.json 为准) |
| UI | **React 19 + Tailwind CSS 4** | 原子化样式,设计 token 落地为 CSS 变量,便于遵守设计规范 |
| 动效 | **GSAP + ScrollTrigger + @gsap/react (useGSAP)** | 参考站自述即用 GSAP;复刻滚动驱动画廊、revealer 过渡、数字翻转等效果的标准工具 |
| ORM | **Prisma** | 类型安全;SQLite → PostgreSQL 迁移路径平滑 |
| 数据库 | **SQLite** | 单文件零运维,个人博客流量足够;备份即拷贝文件 |
| Markdown | **react-markdown + remark-gfm + rehype-highlight**(或 MDX,实施时二选一并锁定) | 博客/作品正文渲染,代码高亮 |
| 鉴权 | **自实现 session cookie**(iron-session 或等价轻量方案) | 单用户后台,NextAuth 过重 |
| 部署 | **Docker(standalone 输出)+ Caddy 反代 → VPS** | Caddy 自动 HTTPS;单容器 + 反代,运维面最小 |

**版本策略**:实施 M0 时以 `create-next-app` 当时的最新稳定版为准,锁定在 `package.json` 中;此后不随意升级大版本。

## 2. 目录结构

```
Carrykit blog2/
├── AGENTS.md                  # AI 生成全局规范
├── Target.md                  # 原始需求
├── docs/                      # 项目管理文档(本目录)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                # 种子数据(示例文章/作品/admin 用户)
├── public/                    # 静态资源
├── src/
│   ├── app/
│   │   ├── layout.tsx         # 根布局:字体变量 + LocaleProvider
│   │   ├── (site)/            # 公开站路由组:共享 Nav + Footer
│   │   │   ├── layout.tsx     # 公开站布局:导航 + footer(admin 不走此布局)
│   │   │   ├── page.tsx       # Home
│   │   │   ├── about/page.tsx
│   │   │   ├── blog/
│   │   │   │   ├── page.tsx   # 列表
│   │   │   │   └── [slug]/page.tsx
│   │   │   ├── work/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/page.tsx
│   │   │   └── styleguide/    # 临时演示页(上线前移除)
│   │   ├── admin/
│   │   │   ├── login/page.tsx
│   │   │   ├── layout.tsx     # 鉴权守卫 + 后台布局
│   │   │   ├── posts/...      # 列表/新建/编辑
│   │   │   └── projects/...
│   │   ├── api/               # 仅当 Server Actions 不适用时才建 API route
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   ├── components/
│   │   ├── layout/            # Nav(含语言切换)、Footer
│   │   ├── motion/            # GSAP 动效封装组件(client):Revealer、Preloader、TextRoll、ScrollGallery、ProgressBar 等
│   │   ├── blog/  work/  admin/
│   │   └── ui/                # 通用小组件
│   ├── config/
│   │   ├── fonts.ts           # 【扩展性接口】next/font 字体定义单点,见 §7
│   │   └── site.ts            # 站点常量:站名、联系邮箱、社交链接
│   ├── i18n/
│   │   ├── en.ts  zh.ts       # 【扩展性接口】UI 文案字典,见 §7
│   │   └── index.ts           # LocaleProvider + useT() hook
│   ├── lib/
│   │   ├── db.ts              # Prisma client 单例
│   │   ├── auth.ts            # session 读写、密码校验
│   │   ├── markdown.ts        # Markdown 渲染配置
│   │   └── utils.ts
│   └── styles/globals.css     # 【扩展性接口】设计 token(CSS 变量),见 §7
├── Dockerfile
├── docker-compose.yml
├── Caddyfile
└── .env.example
```

## 3. 数据模型(Prisma schema 草案)

```prisma
model Post {
  id          String     @id @default(cuid())
  slug        String     @unique
  title       String
  excerpt     String     @default("")
  content     String     // Markdown
  status      PostStatus @default(DRAFT)
  publishedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  tags        String     @default("") // 逗号分隔,V2 可迁移为关联表
}

enum PostStatus {
  DRAFT
  PUBLISHED
}

model Project {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  summary     String   @default("")   // 一句话描述
  content     String   // Markdown 详情
  coverImage  String   @default("")   // 图片 URL
  tags        String   @default("")   // 技术标签,逗号分隔
  link        String   @default("")   // 演示/仓库外链
  order       Int      @default(0)    // 手动排序,小的在前
  published   Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model User {
  id           String @id @default(cuid())
  email        String @unique
  passwordHash String
}
```

**扩展点**:`tags` 先用逗号分隔字符串(SQLite 无数组),V2 若需要按标签筛选再迁移为 `Tag` 关联表;`Post`/`Project` 结构相似但**不合并**,保持各自演化自由。

## 4. 渲染与鉴权策略

| 路由 | 策略 |
|------|------|
| `/`、`/about`、`/blog`、`/work` | SSG + ISR(`revalidate` 60s),内容更新后自动生效 |
| `/blog/[slug]`、`/work/[slug]` | `generateStaticParams` + ISR;草稿返回 404 |
| `/admin/**` | 动态渲染(SSR);`admin/layout.tsx` 统一校验 session,未登录重定向 `/admin/login` |
| 写操作 | 优先 Server Actions(表单提交),内部先校验 session;避免暴露裸 API |

**鉴权流程**:登录表单 → Server Action 校验 email + bcrypt 比对 passwordHash → 签发加密 session cookie(httpOnly、secure、7 天)→ admin layout 每次请求校验。admin 用户由 `prisma/seed.ts` 从环境变量创建。

## 5. 部署方案(VPS)

```
Internet → Caddy (80/443, 自动 HTTPS) → next-app 容器 (:3000)
                                          └── volume: /data/blog.db (SQLite)
```

- **Dockerfile**:多阶段构建,`output: "standalone"`,最终镜像仅含 node_modules 精简产物
- **docker-compose.yml**:`app` + `caddy` 两个服务;SQLite 文件与 Caddy 证书挂 named volume
- **迁移**:容器启动命令先执行 `prisma migrate deploy` 再启动 server
- **备份**:cron 定时将 `blog.db` 拷贝/压缩到备份目录(文档化在部署说明中即可)

## 6. 环境变量

| 变量 | 用途 | 示例 |
|------|------|------|
| `DATABASE_URL` | SQLite 路径 | `file:/data/blog.db`(本地 `file:./dev.db`) |
| `SESSION_SECRET` | session cookie 加密密钥 | 32+ 随机字符 |
| `ADMIN_EMAIL` | seed 创建的管理员邮箱 | — |
| `ADMIN_PASSWORD` | seed 初始密码(仅 seed 时使用) | — |
| `SITE_URL` | 站点公开地址,用于 sitemap/OG | `https://example.com` |

`.env.example` 列出全部变量;`.env` 进 `.gitignore`,真实值绝不入库。

## 7. 扩展性接口(单点修改入口)

以下三类高频定制需求各自收敛到**唯一修改点**,任何其他位置不得出现相应的字面量(AGENTS.md 红线):

### 7.1 字体 — `src/config/fonts.ts`

```ts
// 唯一的字体定义处:next/font 导入 + CSS 变量导出
import { Geist, Geist_Mono } from "next/font/google";
export const fontDisplay = Geist({ variable: "--font-display", ... });
export const fontMono   = Geist_Mono({ variable: "--font-mono", ... });
```

根 layout 挂载变量,Tailwind 的 `font-*` 工具类映射到 `var(--font-*)`。
**更换字体 = 只改此文件的导入与配置**,变量名保持不变,全站自动生效。

### 7.2 主题色 — `src/styles/globals.css` 的 token 块

```css
:root {
  --background: #FAFAF8;  --foreground: #1A1A1A;
  --muted: #6B6B6B;       --border: #E5E5E0;
  --accent: #2F4AE0;      --revealer: #1A1A1A;
}
/* 预留:[data-theme="dark"] { ...覆写同名 token... } */
```

Tailwind 语义类(`bg-background`、`text-accent` 等)映射到这些变量。
**更换主题色 = 只改 token 值**;新增暗色模式 = 增加 `[data-theme="dark"]` 覆写块 + 切换按钮,组件零改动。

### 7.3 UI 语言 — `src/i18n/`

```
src/i18n/en.ts     # const en = { nav: { work: "Work", ... }, blog: { about: "..." } }
src/i18n/zh.ts     # 同结构中文字典(satisfies typeof en,键位强校验)
src/i18n/index.ts  # LocaleProvider(client)+ useT() hook;locale 存 localStorage,默认 "en"
```

- 纯 UI 层切换(字典体积小,随包下发,client 即时切换),**不影响 SSG/ISR 渲染策略**,无路由前缀
- 博客/作品正文为单语内容,不参与切换;内容双语为 V2(届时再评估 DB 字段方案)
- **新增语言 = 新增字典文件并在 index.ts 注册**;组件只用 `t("nav.work")` 形式取文案

## 8. 仓库与分支

| 项 | 值 |
|----|-----|
| Remote | `https://github.com/lidada64/carrykit-blog` |
| 主分支 | `main`(默认分支,开发与部署基准) |
| `First-version` | 第一版历史归档,**只读**,禁止推送/合并/删除 |
| 提交规范 | Conventional Commits(`feat:` / `fix:` / `docs:` / `chore:`) |
