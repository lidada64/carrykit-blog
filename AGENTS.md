
# AGENTS.md — 全局生成规范 / Global Agent Rules

个人博客/作品集网站:Next.js 16 全栈单体 + GSAP 动效 + Prisma/SQLite,自建 admin 后台,Docker 部署 VPS。布局与动效复刻 lokasasmita.com。
Personal blog/portfolio: Next.js 16 full-stack monolith + GSAP animations + Prisma/SQLite, custom admin panel, Docker on VPS. Layout & motion replicate lokasasmita.com.

**仓库 / Repo**: `https://github.com/lidada64/carrykit-blog` — 主分支 `main`;`First-version` 为只读历史归档,**禁止**推送、合并或删除。
Default branch `main`; `First-version` is a read-only archive — never push to, merge, or delete it.

## 文档索引 / Document Index

**做任何任务前,先读对应文档 / Read the relevant doc before any task:**

| 文档 | 何时读 / When to read |
|------|----------------------|
| [docs/TASKS.md](docs/TASKS.md) | **每次会话开始**:确认当前任务与验收标准 / Start of every session: pick the task and its acceptance criteria |
| [docs/PRD.md](docs/PRD.md) | 实现或修改任何功能时,确认需求边界 / Before implementing or changing any feature |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 涉及路由、数据模型、鉴权、部署时 / When touching routes, data model, auth, or deployment |
| [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md) | 写任何 UI/样式/动效时 / Before writing any UI, style, or animation |
| [Target.md](Target.md) | 需求有歧义时回溯原始意图 / When requirements are ambiguous |

文档与代码冲突时,以文档为准并指出冲突;文档本身有误则先修文档。
If docs and code conflict, docs win — flag the conflict. If a doc is wrong, fix the doc first.

## 技术栈锁定 / Tech Stack Lock

- 锁定栈:Next.js 16 (App Router) / TypeScript / Tailwind CSS 4 / **GSAP(+ScrollTrigger、@gsap/react)** / Prisma / SQLite。版本以 `package.json` 为准。
  The stack is locked as above; `package.json` is the source of truth for versions.
- **禁止**未经用户确认引入新框架、UI 组件库、状态管理库或任何大型依赖;小工具依赖(< 50KB、无传染性)需在提交说明中注明理由。
  **Never** add new frameworks, UI kits, state libs, or heavy deps without user approval; small utilities need a stated reason.
- 不升级已锁定依赖的大版本 / No major-version bumps of locked deps.

## 代码规范 / Code Conventions

- TypeScript `strict` 模式;禁止 `any` 与 `@ts-ignore`(确需时写明原因)。
  TS strict mode; no `any` / `@ts-ignore` (justify if unavoidable).
- 文件名 kebab-case,组件名 PascalCase,目录结构遵循 ARCHITECTURE §2,不自创顶层目录。
  kebab-case files, PascalCase components; follow the directory layout in ARCHITECTURE §2.
- **Server Component 优先**:仅动效/交互组件加 `"use client"`,且 GSAP 动效组件集中在 `src/components/motion/`,统一经 `useGSAP` 封装并引用动效 token。
  Server Components by default; `"use client"` only for motion/interactive components, kept under `src/components/motion/`, wrapped via `useGSAP` and using motion tokens.
- 数据库访问只经 `src/lib/db.ts` 的 Prisma 单例;写操作用 Server Actions 并先校验 session。
  DB access only via the Prisma singleton; mutations via Server Actions with session check first.
- 样式只用 Tailwind + 设计 token,组件内禁止字面量色值与自创字号。
  Tailwind + design tokens only; no literal colors or ad-hoc font sizes in components.

## 扩展性接口红线 / Extensibility Single-Entry Rules

三类定制各有**唯一修改点**(机制见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §7),其余任何位置出现对应字面量即违规:
Three customizations each have exactly ONE entry point; the same literal anywhere else is a violation:

- **字体 / Fonts**:只准改 `src/config/fonts.ts`;组件与 CSS 中禁止出现字体名,只用 `--font-display/--font-body/--font-mono` 变量。
  Fonts change only in `src/config/fonts.ts`; components/CSS use the `--font-*` variables, never font names.
- **主题色 / Theme colors**:只准改 `src/styles/globals.css` 的 `:root` token 块(暗色扩展加 `[data-theme="dark"]` 覆写块)。
  Colors change only in the `:root` token block (dark mode = add a `[data-theme="dark"]` override block).
- **UI 文案 / UI copy**:全部走 `src/i18n/` 字典(`useT()`),组件内禁止硬编码任何面向用户的字符串;新增文案必须同时补 `en.ts` 与 `zh.ts` 两个字典。
  All user-facing strings go through the `src/i18n/` dictionaries via `useT()`; adding copy means updating BOTH `en.ts` and `zh.ts`. No hardcoded UI strings in components.

## 工作流 / Workflow

1. 认领 TASKS.md 中的一条任务 → 实现 → 对照验收标准自测 → 勾选该项。
   Claim one task in TASKS.md → implement → verify against its acceptance criteria → check it off.
2. 改动 Prisma schema 必须同时生成 migration(`prisma migrate dev`),禁止手改数据库。
   Any schema change ships with a migration; never hand-edit the DB.
3. 提交信息用 Conventional Commits(`feat:` / `fix:` / `docs:` / `chore:`),一条任务一次提交为宜。
   Conventional Commits; ideally one commit per task.
4. 需求变化时先更新 PRD/TASKS,再改代码。
   Requirement changes update the docs first, then the code.

## 设计红线 / Design Red Lines

- 严格遵守 DESIGN_SPEC:5 档字号阶梯、色板 token、动效 token,不新增、不即兴发挥。
  Strictly follow DESIGN_SPEC: the 5-step type scale, color tokens, motion tokens — no additions, no improvising.
- 所有动效必须支持 `prefers-reduced-motion` 降级。
  All motion must degrade under `prefers-reduced-motion`.
- admin 后台以朴素实用为准,不投入动效预算。
  The admin panel stays plain and functional; no motion budget there.

## 验证要求 / Verification

- 每次改动后必须通过:`npm run lint && npm run build`。
  Every change must pass lint and build.
- 涉及页面的改动,本地 `npm run dev` 跑起来确认目标页面实际可用后才算完成。
  Page-affecting changes are done only after visually confirming the page in a running dev server.
- 涉及数据的改动,确认 seed 数据下前后台行为均正确。
  Data changes must be verified against seed data on both public and admin sides.

## 禁止事项 / Never Do

- ❌ 硬编码密钥/密码;一切敏感值走环境变量,`.env` 不入库。
  No hardcoded secrets; env vars only, `.env` stays untracked.
- ❌ 跳过类型检查、lint 或以 `--force` 类手段绕过失败。
  No skipping type checks/lint or force-bypassing failures.
- ❌ 生成任务范围外的"顺手"功能、抽象或重构;发现改进点记入 TASKS.md 的 V2 候选池。
  No out-of-scope "while I'm here" features or refactors; log ideas in the TASKS.md V2 pool instead.
- ❌ 删除或清空 SQLite 数据文件、migrations 目录。
  Never delete or wipe the SQLite data file or migrations.
