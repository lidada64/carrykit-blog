# TASKS — 任务分解与路线图

> 版本:v2.0 | 日期:2026-07-07
> 使用方式:每次 vibecoding 会话认领一条任务;完成并通过验收后勾选。任务顺序即依赖顺序。
> v2 变更:布局/动效任务按参考站调研修订;新增扩展性接口脚手架;动效任务拆细(GSAP)。

## M0 项目脚手架

- [x] **M0-1 初始化项目**:`create-next-app`(TypeScript、App Router、Tailwind、src 目录、ESLint);配置 `next.config` `output: "standalone"`;安装 gsap、@gsap/react、Prisma 等锁定依赖
  - 验收:`npm run dev` 与 `npm run build` 均通过 ✅(2026-07-07,Next.js 16.2.10 / Tailwind 4 / gsap 3.15 / Prisma 7.8)
- [x] **M0-2 设计 token 与字体接口**:`src/config/fonts.ts`(Geist + Geist Mono + 中文回退,输出 `--font-*` 变量);`globals.css` 写入色板 token 块(含 `[data-theme]` 预留)与 5 档字号阶梯(见 [DESIGN_SPEC.md](DESIGN_SPEC.md) §2-3、§7)
  - 验收:临时演示页可见 5 档字号、全部色板 token、mono 字体;改 fonts.ts 中一处字体全站生效 ✅(2026-07-07,演示页 `/styleguide`,上线前移除)
- [x] **M0-3 i18n 接口**:`src/i18n/{en.ts,zh.ts,index.ts}`(字典 + LocaleProvider + useT,默认 en,localStorage 持久化),见 [ARCHITECTURE.md](ARCHITECTURE.md) §7.3
  - 验收:演示组件可用 `t()` 取文案并即时切换 EN/中;刷新后语言保持 ✅(2026-07-07,演示见 `/styleguide` 顶部;实现用 useSyncExternalStore,SSR 默认 en、水合后同步持久化语言)
- [x] **M0-4 Prisma + SQLite**:按 ARCHITECTURE §3 建 schema,首次 migration,`lib/db.ts` 单例,`seed.ts` 写入示例数据(3 篇文章、4 个作品、1 个 admin 用户)
  - 验收:`npx prisma migrate dev` + seed 成功;Prisma Studio 可见数据 ✅(2026-07-07,seed 输出 3 posts / 4 projects / 1 user;Prisma 7:配置在 prisma.config.ts,client 生成到 src/generated/prisma,运行时用 better-sqlite3 adapter)
- [x] **M0-5 全局布局与导航**:根 `layout.tsx` + Nav(logo、四项导航、语言切换按钮、active 态)+ Footer;四个页面占位路由
  - 验收:PRD US-H3/US-I1(切换部分);移动端正常 ✅(2026-07-07,公开页收入 `(site)` 路由组共享 Nav/Footer(admin 后续独立布局,ARCHITECTURE §2 已同步);四路由 200、active 态与 mailto 验证通过;站点常量在 src/config/site.ts)

## M1 公开页面(使用种子数据,静态布局优先,复杂动效留 M3)

- [x] **M1-1 Blog 列表页(双栏)**:左侧 sticky 侧栏(Blog(N)、栏目描述、缩略图)+ 右侧列表(DATE/NAME 表头、日期+标题行),只取 PUBLISHED,ISR;移动端降级单栏
  - 验收:PRD US-B1/B2(hover 动效除外);草稿不可见 ✅(2026-07-09,`revalidate 60`;临时插入 DRAFT 验证不可见后已删;侧栏缩略图常量在 site.ts,next/image 放行 picsum.photos;日期格式化 `lib/utils.ts` 按 UTC)
- [x] **M1-2 Blog 详情页**:顶部大缩略图 + 标题 → metadata 侧栏(描述/日期/标签)+ Markdown 正文(GFM + 代码高亮);`generateStaticParams`、草稿 404
  - 验收:PRD US-B3/B4;示例文章标题/图片/代码块渲染正确 ✅(2026-07-09,Markdown 选型锁定 react-markdown+remark-gfm+rehype-highlight,管线在 `lib/markdown.ts` 前后台共用;Post 新增 coverImage 字段(migration `20260709055913`,ARCHITECTURE/PRD 已同步),种子第二篇故意无封面验证头图隐藏;草稿与未知 slug 均 404 验证通过)
- [ ] **M1-3 Related Articles**:详情页底部相关文章卡片网格(≤3,不足 2 篇隐藏)
  - 验收:PRD US-B5(进度条除外)
- [ ] **M1-4 Work 画廊静态布局**:桌面端画廊版式(大图区 + 序号 + 右侧作品名列表 + 描述,先不接滚动动画);**移动端纵向作品卡片列表**;按 `order` 排序
  - 验收:PRD US-W1 的布局与移动端降级部分;作品名/大图可点击进详情
- [ ] **M1-5 Work 详情页**:封面、标签(mono)、外链按钮、Markdown 正文
  - 验收:PRD US-W2;无外链时按钮隐藏
- [ ] **M1-6 About 页(分节)**:BIO / SKILLS / CONNECT 三节 + 大写 mono label + socials
  - 验收:PRD US-A1~A3;email 为 mailto
- [ ] **M1-7 Home 页**:hero(标语 + 大图 + 双栏 description)+ 精选作品(≤3)+ 最新博客(≤3)
  - 验收:PRD US-H1/H2;区块无内容时隐藏

## M2 管理后台

- [ ] **M2-1 鉴权**:`lib/auth.ts`(bcrypt + 加密 session cookie)、登录页、admin layout 守卫、登出
  - 验收:PRD US-M1;未登录访问 `/admin/posts` 被重定向;错误密码有提示
- [ ] **M2-2 文章 CRUD**:后台文章列表(含状态)、新建/编辑表单(Server Actions)、删除(带确认)、slug 唯一校验
  - 验收:PRD US-M2;发布后前台 ISR 生效可见
- [ ] **M2-3 作品 CRUD**:同上,含 order 与 published 控制
  - 验收:PRD US-M3
- [ ] **M2-4 Markdown 编辑器**:textarea + 编辑/预览切换,预览用与前台一致的渲染管线
  - 验收:PRD US-M4;预览效果与前台详情页一致

## M3 动效与打磨(复刻参考站,编号对应 DESIGN_SPEC §5 动效清单)

- [ ] **M3-1 GSAP 基建 + 入场动效(A7/A8)**:`components/motion/` 骨架(useGSAP 封装、动效 token 常量、reduced-motion 工具);区块 fade+up、列表 stagger、卡片 hover
  - 验收:动效 token 统一引用;`prefers-reduced-motion` 全局降级生效
- [ ] **M3-2 Revealer 页面过渡(A1)**:路由切换遮罩滑入/滑出
  - 验收:PRD US-N1;admin 不启用;降级为 fade
- [ ] **M3-3 Preloader(A2)**:Home 首次加载 counter 计数 + overlay 揭示,sessionStorage 记忆
  - 验收:PRD US-H4;同会话不重播;reduced-motion 跳过
- [ ] **M3-4 Text-roll hover(A3)**:三层 span 文字滚动组件,应用到博客列表行(日期+标题)与导航项
  - 验收:US-B1 hover 验收项;键盘 focus 同样触发
- [ ] **M3-5 Pixelated 标题(A4)**:Home hero 标题像素化入场特效(实现方案本任务内定:canvas 或分块 div)
  - 验收:入场一次性播放;reduced-motion 降级为 fade
- [ ] **M3-6 Work 滚动画廊动效(A5)**:ScrollTrigger pin + 大图切换 + 序号数字 mask 翻转 + 作品名 indicator 高亮 + whitespace 缓冲
  - 验收:PRD US-W1 完整验收;滚动正反向均流畅;移动端不启用 pin
- [ ] **M3-7 ProgressBar(A6)**:滚动/阅读进度条,应用到 Blog 详情与 Work
  - 验收:US-B5 进度条项;进度与滚动位置一致
- [ ] **M3-8 SEO**:各页 `generateMetadata`、`sitemap.ts`、`robots.ts`、文章/作品 OG 标签
  - 验收:PRD §4 SEO 行;view-source 可见正确 meta
- [ ] **M3-9 响应式与视觉走查**:三档断点逐页对照 DESIGN_SPEC §6 线框与参考站修偏差
  - 验收:360px 宽无横向滚动;各页与线框一致
- [ ] **M3-10 性能**:`next/image` 全覆盖、字体 swap、Lighthouse 检查
  - 验收:本地 Lighthouse Performance ≥ 90(动效页允许 ≥ 85)

## M4 部署(VPS)

- [ ] **M4-1 容器化**:多阶段 Dockerfile、docker-compose.yml(app + caddy)、Caddyfile、启动时 `prisma migrate deploy`
  - 验收:本地 `docker compose up` 后功能与 dev 一致
- [ ] **M4-2 VPS 上线**:环境变量配置、域名解析、HTTPS、seed 生产 admin
  - 验收:公网域名可访问,HTTPS 正常,admin 可登录发文
- [ ] **M4-3 备份与运维文档**:SQLite 定时备份脚本 + `docs/OPS.md`(部署/更新/回滚/备份恢复步骤)
  - 验收:手动执行备份并完成一次恢复演练

## V2 候选池(不排期)

内容双语(Post/Project 双语字段)· 暗色模式(token 结构已预留,加 `[data-theme="dark"]` 块即可)· 文章目录 TOC · RSS 订阅 · 标签筛选(迁移 Tag 关联表)· 图片上传 · 全文搜索 · 评论
