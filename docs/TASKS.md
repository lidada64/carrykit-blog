# TASKS — 任务分解与路线图

> 版本:v2.1 | 日期:2026-07-17
> 使用方式:每次 vibecoding 会话认领一条任务;完成并通过验收后勾选。任务顺序即依赖顺序。
> v2 变更:布局/动效任务按参考站调研修订;新增扩展性接口脚手架;动效任务拆细(GSAP)。

> 2026-10-12 Agent 预算/跨轮次状态工程修复及网站类型修复完成；旧修复提醒已解除。真实问答质量、复杂任务默认额度与成本对照仍待验收，下一次优先事项以 [唯一长期台账](../../Agent/docs/project-highlights/README.md#下次会话优先预算与状态问题) 为准。

## M0 项目脚手架

- [x] **2026-10-21 颗粒旋钮与吊起转场试作**：亮度/颗粒密度旋钮、手动进度、播放/返回、下滑接管及整组缩小/点亮/吊起已实现；最新lint/build含TS通过（7条既有警告）。桌面/390px、旋钮拖动、下滑推进、进度终态、返回及Lab减少动态开关已验。视觉节奏及真实触摸/惯性完整回归留后续，终态截图blender/hero-transition-hanging.png。

- [x] **2026-10-20 哑光格纹与−34°镜头**：撤回暗镜面，改试径向连续受光/暗格缝的哑光灯球；默认及复位−34°/12°，保留1-bit与其余构图。lint/build通过（7条既有警告），浏览器首页、复位及实际画面已验；截图blender/hero-matte-orbit-minus34.png。用户审美反馈待定。

- [ ] **2026-10-20 暗镜面与指定镜头**：默认/复位Orbit −109°、Elevation 12°；源灯球轴已确认倾角0，保持人物/篝火和主题/标题。试作③暗镜面，保留①②；lint/build（含类型）通过，7条既有警告，首页HTTP200；浏览器错误页协议限制，GPU/视觉待验。
- [ ] **下一阶段：Hero缩小、点亮、吊起**：首版试作已实现，待最终视觉/输入回归及正文衔接；路线与分阶段验收见 `idea/harry-orb-hero-plan.md` 最新章节。

- [ ] **2026-10-20 灯球方案①柔光镜片**：保留镜片结构，减弱破碎倒影/亮缝，连续受光与有序1-bit；②哑光格纹星球、③暗镜面灯球仅保留备选。lint/build通过（7条既有警告）；旧错误标签阻断视觉，GPU运行与实际减斑效果待验。

- [ ] **2026-10-20 Hero侧面/1-bit默认**：标题再上移4vh并缩至90%，默认右侧近似平视和1-bit，滑块复位同步；灯球斑块方案评估，尚不改材质；lint/build通过（7条既有警告），旧错误标签仍受协议限制，视觉待验。

- [ ] **2026-10-20 Hero标题微调**：再次上移4vh（窄屏34%→30%，桌面28%→24%），双语标题改为CarryKit.；保持场景后方；lint/build通过，浏览器协议策略拒绝读取旧错误标签，视觉待验。

- [ ] **2026-10-19 Hero字体/归档/镜头控制**：去副标题，恢复原Hero字体，保留并归档配色；旧首页可在Lab打开；环绕/俯仰滑块及1-bit往返切换；lint/build及HTTP/HTML检查通过，旧错误标签待用户重新导航后完成视觉/交互验收。

- [ ] **2026-10-19 字体构建断网修复**：首页500复现字体内部模块错误；将现有Google字体改为官方本地资源，保留变量/字重和许可证。首页500→200，五字体可解析，lint/build通过（7条既有警告）；旧错误标签受浏览器协议策略限制，等待手动刷新后视觉验收。

- [ ] **2026-10-19 居中场景与后景大标题**：最新反馈优先固定居中构图，取消滚动旋转、标题剥离及长滚动占位；保留火焰播放/降级。实现已更新，lint通过（7条既有警告）；本轮字体本地化后build通过；旧错误标签待手动刷新，最新构图视觉验收仍待完成。

- [x] **2026-10-16 Hero双层与侧视修订**：方案一完整场景＋标题柔边遮罩向左上卷起，同步真实镜头转至哈利右侧；方案二左侧平视星球构图。验收初始/中途/终点、反向复位、方案切换、390px窄屏、手动降级及lint/build通过（7条既有lint警告）。最终视觉选择待用户反馈；卷角为柔边/高光近似，非物理纸张网格。

- [x] **2026-10-16 Hero 双方案预览**：复用现成灯球篝火，方案一左上标题/右下场景、斜向柔边剥离及水面后景旋入；方案二居中构图。验收双方案切换、滚动/进度拖动、暂停、原色/双色、窄屏、reduced-motion、lint/build；正式首页待选定方案后整合。2026-10-16：桌面及390px窄屏、切换/滑块/复位、原色/双色、暂停与减少动态效果预览已验；lint通过（7条既有警告）、联网build及类型检查通过。减少动态效果测试使用页面开关，系统媒体查询监听代码已复核，未改系统设置。

- [ ] **2026-10-15 灯球网页同步/性能优先**：实现与浏览器验收完成，构建余项待网络恢复。近景上部单段倒角/预计算粗糙度，资源3.574MB；512px倒影按24fps源帧更新、镜头变化立即更新，双色跳过倒影。资产/lint/tsc通过，实际拖动/复位/暂停/模式切换无渲染错误；619px侧栏120次调用间隔原色均值6.06ms、双色6.21ms，仅本机样本。保留自由旋转，未改固定视频。build因Google字体下载失败未通过；详见 `blender/harry-campfire-orbit.md`。

- [ ] **2026-10-15 灯球质感精修**：实施及1200×1090渲染已完成，独立版本 `harry-campfire-orb-finished.blend` 已打开；5mm薄背板/2mm倒角/0.10–0.17粗糙度与可受光暗缝。网页已按上项同步轻量近似；build因Google字体下载失败未通过，待联网重验。

- [x] **2026-10-14 哈利脸部、接触姿态与氛围精修**（2026-10-15 收尾）：源场景与网页同时修正；独立皮肤明暗保留五官，右手握杆与左手搭腿重新摆姿。Blender 主辅光/Compositor 可编辑，网页保持严格双色并加入轻微空气透视。双侧近景、指定手部表面接触检查、资产重导出、桌面双色/原色、旋转/复位、390px窄屏、lint/build 已验；详见 `blender/harry-campfire-orbit.md` 和台账 D16 第014卷。
- [ ] **D16 验证余项**：暂停/播放按钮已操作，但连续暂停截图仍有局部像素差异，尚未确认来源，不能宣称像素级冻结通过；reduced-motion 仅复核既有时钟代码，未强制系统设置实测。用户视觉满意度待反馈。

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
- [x] **M1-3 Related Articles**:详情页底部相关文章卡片网格(≤3,不足 2 篇隐藏)
  - 验收:PRD US-B5(进度条除外)✅(2026-07-09,相关文章 V1 取最新其他已发布文章;临时 DRAFT 一篇验证不足 2 篇整块隐藏后已恢复;无封面卡片用 bg-border/40 占位保持网格对齐)
- [x] **M1-4 Work 画廊静态布局**:桌面端画廊版式(大图区 + 序号 + 右侧作品名列表 + 描述,先不接滚动动画);**移动端纵向作品卡片列表**;按 `order` 排序
  - 验收:PRD US-W1 的布局与移动端降级部分;作品名/大图可点击进详情 ✅(2026-07-09,静态帧以首作品为当前态(序号 01 + `—` 高亮),M3-6 接 ScrollTrigger;组件保持 Server Component(无 UI 文案);只取 published、order 升序验证通过)
- [x] **M1-5 Work 详情页**:封面、标签(mono)、外链按钮、Markdown 正文
  - 验收:PRD US-W2;无外链时按钮隐藏 ✅(2026-07-09,`generateStaticParams` 4 作品 SSG + ISR;外链按钮新标签页打开(label 走 i18n `work.linkLabel`),无外链作品验证按钮隐藏;临时下架作品验证 404 后已恢复;Markdown 复用 M1-2 管线)
- [x] **M1-6 About 页(分节)**:BIO / SKILLS / CONNECT 三节 + 大写 mono label + socials
  - 验收:PRD US-A1~A3;email 为 mailto ✅(2026-07-09,BIO 文案走 i18n `about` 组(随 EN/中 切换),技能列表收敛在 site.ts `skills`;mailto 与 GitHub 新标签页验证通过;节间按 DESIGN_SPEC §1 用大间距无分割线)
  - ⚠️ **2026-08-21:About 页计划移除**(导航第三项改为 radar,见 change_8_21.md)。本条为历史建造记录,保留不删;移除本身待后续任务落地。
- [x] **M1-7 Home 页**:hero(标语 + 大图 + 双栏 description)+ 精选作品(≤3)+ 最新博客(≤3)
  - 验收:PRD US-H1/H2;区块无内容时隐藏 ✅(2026-07-09,标语/描述/区块 label 走 i18n `home` 组,hero 大图常量在 site.ts;精选取 order 前 3、博客取最新 3;临时下架全部作品验证精选区隐藏后已恢复;入场动效(A4/A7)属 M3。M1 里程碑 7/7 完成)

## M2 管理后台

- [x] **M2-1 鉴权**:`lib/auth.ts`(bcrypt + 加密 session cookie)、登录页、admin layout 守卫、登出
  - 验收:PRD US-M1;未登录访问 `/admin/posts` 被重定向;错误密码有提示 ✅(2026-07-09,session 方案锁定 iron-session(7 天 httpOnly cookie),SESSION_SECRET 缺失即抛错;守卫在 `admin/(protected)/layout.tsx` 路由组(登录页在组外避免死循环,ARCHITECTURE 已同步);E2E 验证:未登录 307、错误密码提示、登录 303+cookie、登出清 cookie。注意:无状态 cookie 登出前签发的旧值在 TTL 内重放仍有效,单用户后台可接受)
- [x] **M2-2 文章 CRUD**:后台文章列表(含状态)、新建/编辑表单(Server Actions)、删除(带确认)、slug 唯一校验
  - 验收:PRD US-M2;发布后前台 ISR 生效可见 ✅(2026-07-09,新建/编辑共用 PostForm(含标签字段,PRD US-M2 已同步);Server Actions 均先 requireAdmin;保存/删除后 revalidatePath 前台即时生效(不等 60s);E2E:创建/编辑/删除/slug 冲突提示/未登录写操作被拒全部验证)
- [x] **M2-3 作品 CRUD**:同上,含 order 与 published 控制
  - 验收:PRD US-M3 ✅(2026-07-09,结构同 M2-2;E2E:创建 order=0 的作品在 /work 排最前、slug 冲突提示、取消 published 后前台即时隐藏、删除同步移除;保存/删除后 revalidatePath /、/work 与详情路径)
- [x] **M2-4 Markdown 编辑器**:textarea + 编辑/预览切换,预览用与前台一致的渲染管线
  - 验收:PRD US-M4;预览效果与前台详情页一致 ✅(2026-07-09,MarkdownEditor 预览直接复用前台 MarkdownContent + lib/markdown.ts 管线(结构上保证一致);预览时 textarea 隐藏但值照常提交,required 仅可见时生效;文章/作品表单均接入;提交回归验证通过。M2 里程碑 4/4 完成)

## M3 动效与打磨(复刻参考站,编号对应 DESIGN_SPEC §5 动效清单)

- [x] **M3-1 GSAP 基建 + 入场动效(A7/A8)**:`components/motion/` 骨架(useGSAP 封装、动效 token 常量、reduced-motion 工具);区块 fade+up、列表 stagger、卡片 hover
  - 验收:动效 token 统一引用;`prefers-reduced-motion` 全局降级生效 ✅(2026-07-09,motion/{tokens,reduced-motion,fade-up,hover-card};FadeUp=ScrollTrigger once 入场(支持子元素 stagger),HoverCard=封面 scale+卡片上浮;已接入 Home/Blog 列表/About/Related;reduced-motion 时不创建动画直接静态展示;动效数值全部引用 motionTokens)
- [x] **M3-2 Revealer 页面过渡(A1)**:路由切换遮罩滑入/滑出
  - 验收:PRD US-N1;admin 不启用;降级为 fade ✅(2026-07-09,motion/revealer.tsx:捕获站内链接点击→遮罩自下而上滑入→router.push→pathname 变化后滑出;挂在 (site) 布局(admin 无),/admin 链接与外链/新标签/修饰键点击放行;reduced-motion 降级遮罩 fade;无 JS 时原生跳转;浏览器前进/后退不播滑出(covering 标志))
- [x] **M3-3 Preloader(A2)**:Home 首次加载 counter 计数 + overlay 揭示,sessionStorage 记忆
  - 验收:PRD US-H4;同会话不重播;reduced-motion 跳过 ✅(2026-07-09,motion/preloader.tsx 仅 Home 挂载:mono counter 000→100→counter 淡出→overlay 向上揭开并移除;overlay 随 SSR 输出避免首屏内容闪现,已播/reduced-motion 在水合后立即移除;播放开始即写 sessionStorage,中途刷新不重播)
- [x] **M3-4 Text-roll hover(A3)**:三层 span 文字滚动组件,应用到博客列表行(日期+标题)与导航项
  - 验收:US-B1 hover 验收项;键盘 focus 同样触发 ✅(2026-07-09,motion/text-roll.tsx:3 份 span 堆叠于 1lh overflow-hidden wrapper,hover 上滚一份、离开滚到第三份后无缝复位;触发器取最近 <a> 祖先(整行 hover 日期+标题同滚),focusin/focusout 同触发;已应用于导航项/contact、blog 列表行、Home 最新博客行;reduced-motion 不绑事件)
- [x] **M3-5 Pixelated 标题(A4)**:Home hero 标题像素化入场特效(实现方案本任务内定:canvas 或分块 div)
  - 验收:入场一次性播放;reduced-motion 降级为 fade ✅(2026-07-09,方案定为分块 div(真实 DOM 文字,SEO/无障碍友好,否决 canvas):底色方块网格盖住标题,随机顺序消失揭示;首访等 preloader 完成事件再播;hero h1 移出 A7 stagger 避免叠加;reduced-motion 降级整体 fade)
  - ⚠️ **2026-08-21:A4 已弃用**,Home hero 改为迪斯科灯球叙事动画(M6,见 homepage-animation-plan.md)。本条为历史建造记录,保留不删。
- [x] **M3-6 Work 滚动画廊动效(A5)**:ScrollTrigger pin + 大图切换 + 序号数字 mask 翻转 + 作品名 indicator 高亮 + whitespace 缓冲
  - 验收:PRD US-W1 完整验收;滚动正反向均流畅;移动端不启用 pin ✅(2026-07-09,motion/scroll-gallery.tsx:pin 整屏、每作品一屏滚动量,进度离散驱动大图淡切/双 digit 1lh mask 翻转/— indicator 位移+名字高亮,前后 20vh 缓冲;gsap.matchMedia 限 md+ 且非 reduced-motion;降级走 CSS 变体(hidden motion-safe:md:block / motion-safe:md:hidden),<md 与 reduced-motion 均为静态卡片列表;进度条属 M3-7(A6))
- [x] **M3-7 ProgressBar(A6)**:滚动/阅读进度条,应用到 Blog 详情与 Work
  - 验收:US-B5 进度条项;进度与滚动位置一致 ✅(2026-07-09,motion/progress-bar.tsx:底部 2px 细条,scaleX=整页滚动进度(ScrollTrigger scrub 直接映射);挂在 Blog 详情与 Work 页,其余页面无;非运动性反馈,reduced-motion 保留)
- [x] **M3-8 SEO**:各页 `generateMetadata`、`sitemap.ts`、`robots.ts`、文章/作品 OG 标签
  - 验收:PRD §4 SEO 行;view-source 可见正确 meta ✅(2026-07-09,根 layout metadataBase(SITE_URL)+title 模板,blog/work/about 独立 title+description(文案单源引英文字典),详情页 generateMetadata 输出 OG article/website+封面图;sitemap 11 条(4 静态+3 文章+4 作品),robots 屏蔽 /admin 与 /styleguide;About 拆为 server page + client AboutContent 以导出 metadata)
- [x] **M3-9 响应式与视觉走查**:三档断点逐页对照 DESIGN_SPEC §6 线框与参考站修偏差
  - 验收:360px 宽无横向滚动;各页与线框一致 ✅(2026-07-09,headless Chrome 实测 6 个公开页 360px scrollWidth=360 无横滚;桌面/移动截图对照线框逐页核过;修复:窄屏导航 logo 降档+组间 gap(原与链接贴死)、Markdown 宽表格包 overflow 容器、移动导航 gap 收紧)
- [x] **M3-10 性能**:`next/image` 全覆盖、字体 swap、Lighthouse 检查
  - 验收:本地 Lighthouse Performance ≥ 90(动效页允许 ≥ 85)✅(2026-07-09,本地生产模式实测:home 94 / blog 95 / 文章 98 / about 96 / work 96,CLS 全 0;Markdown 正文图片改 next/image(unoptimized,内容图可来自任意域名);blog 侧栏首屏图补 priority;字体 swap M0-2 已配。注:LCP 受 picsum 远程占位图拖累,换真实图片后更优)

## M4 部署(VPS)

- [x] **M4-1 容器化**:多阶段 Dockerfile、docker-compose.yml(app + caddy)、Caddyfile、启动时 `prisma migrate deploy`
  - 验收:本地 `docker compose up` 后功能与 dev 一致 ✅(2026-07-09,deps/builder/proddeps/runner 四阶段(debian slim,standalone+运行时保留 prisma CLI/tsx 供迁移与 seed);构建期 SSG 用空库、上线后 ISR 刷新;Caddyfile 用 SITE_DOMAIN 变量(本地 :80/生产自动 HTTPS);实测:迁移自动应用、seed 后公开页+admin 登录经 Caddy 全通。顺带修复:seed 空串环境变量回退(||)、sitemap 改 force-dynamic(构建期烘焙会永久陈旧))
- [x] **M4-2 VPS 上线**:环境变量配置、域名解析、HTTPS、seed 生产 admin
  - 验收:公网域名可访问,HTTPS 正常,admin 可登录发文 ✅(2026-07-17,站主确认生产站已上线)
- [x] **M4-3 备份与运维文档**:SQLite 定时备份脚本 + `docs/OPS.md`(部署/更新/回滚/备份恢复步骤)
  - 验收:手动执行备份并完成一次恢复演练 ✅(2026-07-09,scripts/backup.sh 用 better-sqlite3 在线备份 API 出一致性快照+gzip+保留 30 份;OPS.md 覆盖首次部署/更新/回滚/备份/恢复/常用命令;本地 Docker 完成演练:备份→删一篇文章→临时容器挂 volume 恢复→数据回到备份时点(注意:恢复不能对停止容器 docker cp,volume 未挂载,已写入文档))

## M5 图片上传

- [x] **M5-1 上传 API + 存储层**:`src/app/api/upload/route.ts`(POST 鉴权 + sharp 转 WebP)、`src/app/uploads/[...path]/route.ts`(GET 静态服务)、`src/lib/upload.ts`(工具函数)、`.env` 加 `UPLOAD_DIR`
  - 验收:上传返回 `{ url }`;未登录 401;超 5MB/非图片 400;GET 返回图片 ✅(2026-07-11,sharp 转 WebP ≤1920px q80;文件名 {timestamp}-{random}.webp;GET 带 immutable 缓存头;仅 .webp 后缀 + 路径遍历检查)
- [x] **M5-2 封面图上传组件**:`src/components/admin/image-uploader.tsx`(拖拽/点击上传 + 预览 + URL 回退 tab);接入 PostForm、ProjectForm 替换原 `type="url"` 字段
  - 验收:拖拽上传 → 预览 → 保存后前台封面图正确;URL 模式仍可用;编辑回显 ✅(2026-07-11,上传/URL 双模式 tab 切换;进度条;预览+清除;隐藏 input 随表单提交;已有图片自动回显)
- [x] **M5-3 Markdown 编辑器插图**:`markdown-editor.tsx` 工具栏加「插入图片」按钮,上传后在光标位置插入 `![](url)`
  - 验收:插入图片后预览可见;前台详情页渲染正确 ✅(2026-07-11,工具栏📷按钮展开面板:上传文件或粘贴 URL;插入后光标定位到标记末尾;预览复用前台 MarkdownContent 管线)
- [x] **M5-4 Docker 与部署适配**:Dockerfile 创建 `/data/uploads` 并赋权;docker-compose 加 `UPLOAD_DIR`;备份脚本增加 uploads 目录
  - 验收:`docker compose up` 后上传功能正常;备份恢复后图片完整 ✅(2026-07-11,Dockerfile mkdir /data/uploads;compose UPLOAD_DIR=/data/uploads;backup.sh tar+gzip uploads 配对 DB 快照;OPS.md 补充恢复步骤)
- [x] **M5-5 验证走查**:`npm run lint && npm run build` 通过;完整上传流程 e2e 验证;边界测试
  - 验收:lint + build 通过;本地 dev 与 Docker 均可正常上传和展示 ✅(2026-07-11,lint 0 errors 0 warnings;build 成功,/api/upload 与 /uploads/[...path] 路由均识别;新增依赖 sharp ~1.5MB)

## M6 主页迪斯科灯球叙事动画 (Epic: Homepage Disco Ball Animation)

> 路线:**Blender 预渲染序列 + GSAP/CSS/DOM 编排**(路线 2)。准绳 `idea/disco_ball_animation_feasibility.md`。
> 需求 HR-1~HR-10 详见 [homepage-animation-plan.md](homepage-animation-plan.md);资产见 [blender-assets.md](blender-assets.md)。
> 分支 `feature/disco-ball-homepage`。旧的 R3F/六阶段方案已废弃(2026-08-21 推倒重来)。

- [ ] **M6-1 Blender 资产**:搭主控场景(模型+灯光 rig+HDRI+材质库+渲染预设),产出 `ball-intro` / `ball-loop` / `ring-loop`(透明,无缝)
- [ ] **M6-2 序列播放器**:前端无缝循环 + scroll 变速播放组件 + CSS 发光叠层
- [ ] **M6-3 Act I 入场时间线(HR-1~5)**:承接 preloader → 接触不良 → 渐亮定住 → 缩小变"O"(球盖隐藏 O)→ 星环生成
- [ ] **M6-4 Act II 滚动骨架(HR-6)**:ScrollTrigger pin + 大字渐隐 + 球/星环变速
- [ ] **M6-5 球左移 + 文字绕排(HR-7)**:translateX + shape-outside 环绕(pretext 备选)
- [ ] **M6-6 反色凹槽咬合(HR-8)**:DOM + mix-blend-mode,与球缩小时间线对齐
- [ ] **M6-7 三板块 + 收尾(HR-9/10)**:work/blog/radar 简介+跳转,to be continued,释放 pin
- [ ] **M6-8 响应式 + 无障碍(§2/§3)**:移动端纵向降级、prefers-reduced-motion 降级

## 维护任务

- [ ] **USER-10 统一 Agent 开场白**：范围与验收统一见 [Agent PRD §3.9.5](../../Agent/docs/PRD.md#395-统一-agent-开场白2026-10-14待实现)。2026-10-14 已登记统一身份/能力/提问引导与恢复不重复需求，文案及功能待实现。

- [ ] **USER-9 显式退出 Agent 对话**：对话框增加主动退出按钮，范围与验收统一见 [Agent PRD §3.9.4](../../Agent/docs/PRD.md#394-显式退出-agent-对话2026-10-14待实现)。2026-10-14 已登记需求，功能尚未实现。

- [x] **2026-10-12 Agent PRD 迁移与整合排序**：完整 Agent 产品需求及验收迁入 `D:/CST/code/Agent/docs/PRD.md`，P0–P3 共 14 项按重要程度排序，网站 PRD 保留网站范围及 Agent 跳转。对齐两仓库任务/规划入口；仅文档完成，不据此勾选功能或 D9 修复。
  - 验证：既有 MGMT/USER/META 验收完整保留；相关文档链接/diff 检查通过，lint 0 错误/7 条既有警告，联网 build（含 TypeScript）通过。未改页面/数据/业务代码，未提交或推送。

- [x] **2026-10-12 用户端额度/语料库/彩蛋需求登记**：PRD §3.9.2 登记 USER-6 分阶段额度退出与 USER-7 预设语料库；明确提醒结束 → 预设回答 → 彩蛋并关闭入口，阈值/恢复规则待定。同步共享上下文、Agent 任务/计划及亮点台账；仅需求登记完成。
  - 验证：本轮仅文档修改；相关已跟踪文档 diff 检查通过，lint 0 错误/7 条既有警告。首次 build 遇已有构建占用，等待后联网 build（含 TypeScript）通过，未停止其他进程或删除锁。未修改运行机制/语料/页面，未提交/推送。
- [ ] **USER-6/7 对话额度与退出彩蛋、预设语料库**：实现与验收统一见 [PRD §3.9.2](../../Agent/docs/PRD.md#392-对话额度预设语料库与退出彩蛋2026-10-12待实现)。服务端限额及关闭，降级后停止模型/MCP 调用；建设可版本化的预设回答集，未命中/未建设固定文案兜底；实际页面验证持续输入、刷新/并发、彩蛋一次与 reduced-motion。

- [x] **2026-10-12 用户端网页 MCP 需求登记**：PRD §3.9.1 新增 USER-5；明确先交付简单对话框、实际网页 MCP 查询、回答“联网”标识与来源链接。更新此前排除联网/完整用户端前置的描述，同步两仓库规划；仅需求登记完成。
  - 验证：本轮仅文档修改；相关已跟踪文档 diff 检查通过，lint 0 错误/7 条既有警告，联网 build（含 TypeScript）通过。未安装 MCP、修改页面/数据或执行网页业务查询，未提交/推送。
- [ ] **USER-5 最小联网问答**：按 [PRD §3.9.1](../../Agent/docs/PRD.md#391-网页查询-mcp-与最小联网问答2026-10-12待实现) 实现，使用书籍链接/人物介绍及无结果/超时样例验收；纯网页链路不等待网站只读 API、完整流式/过程可视化或管理发布。

- [x] **2026-10-12 非 admin 用户端需求登记**：PRD §3.9 登记 USER-1~4（对话框、流式回答/终态、真实处理过程可视化、来源/会话隔离），更新旧“访客范围待确认”描述，同步共享上下文、Agent 任务/计划与亮点台账；仅表示需求登记完成。
  - 验证：本轮仅文档修改；相关已跟踪文档 diff 检查通过，lint 0 错误/7 条既有警告。联网 build 两次均因 fonts.gstatic.com 现有字体文件下载连接失败而未通过，未绕过检查或修改字体配置；页面与数据未改，未提交/推送。
- [ ] **USER 非 admin 用户端实现**：逐项认领 [PRD §3.9](../../Agent/docs/PRD.md#39-非-admin-用户端功能实现清单2026-10-12待实现)。首批优先 USER-5 简单联网问答；博客数据链路依赖可靠只读连接，完整交互/过程展示分批完善。验收包括追问、取消/截断/失败、实际来源、跨用户/草稿隔离与移动端/reduced-motion，不把 CLI/Trace 视为前端已交付。

- [x] **2026-10-12 Agent 管理模式功能目录登记**：PRD §3.8 登记 MGMT-1~6：批量导入、自动翻译、来源 URL、预计阅读时长、自动排版、标点规范；补功能边界、依赖与验收，同步共享上下文和 Agent 任务/实施计划及亮点台账。本勾选只表示文档登记完成，六项业务功能均待实现。
  - 验证：本轮仅修改文档；相关已跟踪文档 diff 检查通过，lint 0 错误/7 条既有警告，受限网络字体下载失败后联网 build（含 TypeScript）通过。npm 包装路径异常，使用现有 npm-cli 执行原脚本；未修改页面/数据或用户正文，未提交或推送。

- [ ] **MGMT 管理模式功能实现**：功能及验收统一见 [PRD §3.8](../../Agent/docs/PRD.md#38-agent-管理模式功能实现清单2026-10-12待实现)。来源字段并入 META 契约/迁移/API，阅读时长复用 META-5；与 Agent P4/P5/P6 联合验收，每项独立认领，不因已有单篇中译英而勾选 Agent 翻译完成。

- [x] **2026-10-12 Agent 预算状态与网站类型修复**：跨轮 step 归属、提示词版本/显式升级、v2 分项预算与 v1 兼容、截断观测/有界重生成；网站删除无效 NextConfig 字段及类型忽略，ScrollSmoother 复用已安装包声明，DOM 安全收窄。
  - 验收：Agent 新增 15 项，统一 171 项全部通过，证据 `D:/CST/code/Agent/code/eval_results/20261012T060511444807Z/report.md`；网站独立 tsc、lint（7 条既有警告）及联网 build（含 TypeScript）通过。dev `/blog` 与 `/blog/hello-carrykit` 200，文章实际显示、滚到底部和返回顶部通过，浏览器无错误。首次构建字体受限网络失败，联网重试暴露自动生成 validator 损坏；停止本轮 dev，仅清理损坏派生文件后构建通过，未排除类型文件或跳过检查。未升级用户原会话或执行付费模型，D7 真实语义质量待验；保留两仓库原改动，未提交或推送。

- [x] **2026-10-12 Blog-Agent 九项优先级规划**：在 PRD §1.1 分别排序本地 RAG、网站连接、语义检索、Trace 完善、缓存、成本/质量、管理发布、Subagent 与产品化；写明理由、依赖及验收证据，并同步 Agent 任务清单与实施计划。本条仅表示规划完成，各业务能力不据此勾选。
  - 验证：本轮仅文档修改；相关已跟踪文档 diff 检查通过。lint 0 错误、7 条既有警告；受限网络字体下载失败后联网 build 通过；独立类型检查仍为既有 NextConfig eslint、ScrollSmoother 声明、Element.offsetHeight 三处错误，未更改或绕过配置。npm 启动路径异常，使用已安装 npm-cli 执行原脚本。未提交或推送，保留两仓库既有改动。

- [x] **2026-10-12 实习导向项目定位与亮点记录**：Agent 为核心、博客为作品集；更新定位与协作入口，历史成果统一记录在 `D:/CST/code/Agent/docs/project-highlights/README.md`。验收：有可复用简历文案、证据及未实现边界；网站 lint/build 与 Agent 离线回归结果记录，未来实现同步维护。
  - 完成：PRD、共享上下文和两仓库 AGENTS 同步；台账已记录 6 项 Agent、3 项网站亮点。Agent 97 项离线测试通过；网站 lint 通过（7 条既有警告）、联网 build 通过；独立类型检查仍有 3 处既有错误，台账明确列出，不宣称类型全绿。

- [x] **2026-10-11 哈利与巨大灯球场景**：哈利放大 8%、向火堆靠近 0.22 个单位；复用 orb-master 的 CK_orb_body / CK_core / CK_world，泥地、草、散石全部移除。半径约 8 的球体超出画幅，坐姿/脚底和石圈按弧面放置，统一场景根节点。输出 `blender/harry-campfire-orb.blend`，旧版及输入保留。原生 WebGL 按观察方向读取源环境并近似火光反射；33 个绘制网格，源动画 288 帧保留，压缩约 3.22 MB 加 manifest。默认/转动构图、原色/双色、暂停及桌面/手机已实际检查，网页无错误；截图 `blender/harry-campfire-orb-lab-preview.png`。资产检查和 lint/build 通过（7 条既有 lint 警告），独立 tsc 仍为原有 3 处错误。Hero 计划交付于 `idea/harry-orb-hero-plan.md`，本轮首页未修改。
- [x] **2026-10-11 灯球暗场材质与光影修正**：半径 8 → 14，重新贴合人物/火堆；源金属/粗糙度/镜片倾角和 HDR 环境接入网页，RGBM 无损保存反射层次。填缝关闭发光，保留源亮灯参数；线性 GGX、平方距离火光衰减、六面点光源阴影、顶部局部人物/火堆倒影。新编辑文件 `blender/harry-campfire-orb-dark.blend` 保留 Cycles 和完整源节点；网页反射为近景切平面近似，未来整球缩小需升级，已写入 `idea/harry-orb-hero-plan.md`。计划已移至 idea，首页未接入。33 网格/288 帧资产检查通过，约 3.22 MB；桌面默认/旋转/暂停/双色及手机复位实际检查，浏览器无错误。最终截图 `blender/harry-campfire-orb-dark-lab-preview.png`。lint/build 通过，7 条既有 lint 警告；独立 tsc 仍为既有 3 处错误。

- [x] **2026-10-11 哈利 Lab 双色精修**：局部倒影用 mip 链柔化，保留镜片边界；双色灯球沿用首页 CK_tile/CK_sky、0.9 白缝、Standard 转换、共用 2px 蓝噪声。人物单独提高火光/环境受光及双色亮度；背景静态细颗粒和 32 个漂移粒子共用原有播放时钟，暂停/reduced-motion 静止。桌面原色/双色、暂停、旋转与复位实际检查；窄屏 DOM 尺寸无溢出，窄屏截图工具失败，未宣称完成窄屏视觉验收。网页错误日志为空。预览 `blender/harry-campfire-duotone-preview.png`。lint/build 通过（7 条既有警告），独立 tsc 仍为既有 3 处错误。

- [x] **2026-10-14 哈利火光、手部与上浮火星修复**：双色以火光为主，朝火的受光面应亮于背光面；源骨骼重摆右手握棍与左手搭腿，修正手指穿插；两种材质火星持续上升，暂停/reduced-motion 静止。验收资产位置/姿态检查、本地双色/原色及旋转/暂停、lint/build/类型检查。 已重导出33网格/288帧并打包约3.23MB；旧源轨迹探针497可见下降，新版0下降、3403上升、41重生，打包加入上升/淡出回归。桌面原色/双色、近景/旋转/复位及播放/暂停状态核查，页面错误为空，reduced-motion时钟代码核查；未宣称手机视觉已验。lint/build/独立tsc通过，7条既有lint警告。预览 `blender/harry-campfire-hands-light-sparks-preview.png`；尝试和限制记录共享台账D16（011/012）。

- [x] **2026-10-11 双色人物与篝火明暗重构**：人物、石圈与木柴独立计算法线天光及火光遮挡，纹理只少量修饰；窄过渡区使用 1px Bayer，增加细暗轮廓与掠射角亮边。火焰采用源动画亮色核心和暗边，取消双色体积叠层，烟雾稀疏化；灯球保留首页资产风格。参考 Obra Dinn 官方开发日志。已实际检查原色/双色、暂停与旋转，浏览器错误日志为空；预览 `blender/harry-campfire-obradinn-lighting-preview.png`。lint/build 通过（7 条既有 lint 警告），独立类型检查仍为既有 3 处错误。收尾时预览工具重新打开超时，沿用本轮已核查截图。

- [ ] **哈利与灯球 Hero 接入**（待实施）：按 `idea/harry-orb-hero-plan.md` 将场景放入首页，整组缩小、吊起并顶部停靠；增加统一场景变换和投影锚点，替换旧 Observer 时间线，验证正反向滚动、手机及 reduced-motion。

- [x] **2026-10-11 哈利篝火可旋转版本**：导入指定 Animated 篝火，移除座木、改为地面坐姿并拉近镜头；交付 `blender/harry-campfire-orbit.blend` 与原生 WebGL 旋转浏览。34 个绘制网格，三层火焰形变、烟雾/火星及闪烁灯光采用源文件 288 帧/24 fps；GPU 适配流动遮罩与体积材质，完整 Blender 材质保留。资产验证和压缩脚本通过，实际传输约 4 MB 加 manifest。3120 Lab 桌面/手机、拖动旋转、缩放、键盘、复位、原色/双色、暂停实际核查，浏览器错误日志为空；reduced-motion 静止自动播放并允许主动旋转（代码核查）。截图 `blender/harry-campfire-orbit-lab-preview.png`。lint 通过（7 条既有警告），联网 build 通过；构建配置原已跳过类型校验，单独 tsc 仍有 next.config、ScrollSmoother 声明、post-meta 的 3 处既有错误，本次无新增类型错误。构建/打包步骤见 `blender/harry-campfire-orbit.md`。

- 2026-10-11 篝火重构：使用 `Outer_Wilds_Campfire.blend` 的石圈、木柴、灰烬与火焰材质替换旧火堆；隐藏碰撞体，保留输入文件。复核哈利前倾、左右手分工、握棍和烘烤高度，维持人物主导的轻微俯视构图。

- 2026-10-11 使用用户提供的 `blender/Harry_Opening_Outfit.blend` 重构人物，保留其真实网格、骨骼与内嵌贴图，骨骼调整为弓背朝火坐姿；不覆写输入文件，输出仍为独立篝火 Lab。早期游戏质感以源资产为准，不用程序噪声覆盖脸部贴图。

- 2026-10-09 风格改为早期 Source / Half-Life / Garry’s Mod 视觉习作：低面数但边界清晰，低分辨率灰暗噪点贴图及硬阴影，不模糊画面。默认展示材质原色，双色作为可选对照；保留既有姿态、镜头和单人构图。

- 2026-10-08 用户四图精修：人物整体放大并保持大于篝火；火焰改为细密连续卷曲及形变循环；后发长、前侧短、遮耳、贴面胡须、黄绿色翻领过渡；镜头改为轻微俯视。保留弓背朝火坐姿。

- [ ] **2026-10-07 哈利篝火 Lab**（进行中）：在 `/lab/harry-campfire` 接入单人烤棉花糖场景，交付可编辑 Blender 模型及预渲染画面，剔除群像角色。
  - 2026-10-11 Outer Wilds 篝火替换：新增 `outer-wilds-fire.py`，保留源资产材质与火焰透明贴图、隐藏 Collider，添加轻微循环形变；左手落到膝旁，右手持棍，棉花糖位于火焰侧上方，镜头收至 5.2。输入资产均不覆写，静帧及最终 12 帧已渲染、打包；3120 Lab 原色/双色、暂停/恢复已实际验证，浏览器错误日志为空，截图 `blender/harry-outer-wilds-preview.png`。lint/build 通过，独立类型检查仍为上述 3 处既有错误。
  - 2026-10-11 源模型重构：`harry-outfit-scene.py` 为当前构建入口，导入 `Harry_Opening_Outfit.blend` 的 6 个网格与骨骼、内嵌贴图；重摆脊柱/四肢、脚底落地、坐木高度及烤棍。原模型未覆写，旧程序场景另存 `harry-campfire-procedural-backup.blend`。页面中英文说明及 manifest 已更正资产来源。lint/build 通过，tsc 仍为 3 处既有错误；最终 12 帧已打包，3120 Lab 原色/双色及暂停切换已实际验证，浏览器错误日志为空；截图 `blender/harry-outfit-lab-preview.png`。
  - 2026-10-09 Source 风格：新增 `harry-source-style.py`，实际内嵌 64px 最近邻漫反射纹理、灰暗降饱和配色、一级细分与局部减面、硬光及低漫反射反弹；页面默认原色。保留 `harry-campfire-pre-source.blend` 备份。lint/build 通过；独立类型检查仍为三处既有错误。静帧及最终 12 帧已渲染并打包，已检查本地原色渲染；浏览器自动化仍受环境启动错误阻塞，页面视觉验收暂未完成。
  - 2026-10-08 四图精修：人物放大 18%，火堆平面缩小 15%，镜头俯角约 16°；重建后长前短遮耳发型、贴面胡须及投射到面部的眉眼细节，黄绿色翻领。火焰采用 16 层平滑曲面、色彩与透光层次、逐帧卷曲形变；保持 12 帧循环和 reduced-motion。lint/build 通过，tsc 仍为既有三处错误；2026-10-09 已确认最终 12 帧完整并重新打包接入页面，dev 3120 页面 HTTP 200，build 通过。浏览器自动化因环境初始化失败暂不能完成本轮页面视觉复核；已核查本地整体渲染及头部近景。头部仍为风格化重建，原作相似度待验收。
  - 2026-10-08 当前修正：提高人物曲面精度、补充衣褶与面部细节，弓背朝火，双手与烤棍向前，座木同步转向；静帧及 12 帧循环已更新，3120 页面原色/双色已实际核查，浏览器无错误，展示截图为 `blender/harry-forward-pose-preview.png`。连续曲面细分两级，新增翻领缝线、腰肘衣褶及眼下/胡须细节；循环源帧升至 1100×1000，图集限制在 4096 宽。lint、联网 build 通过；独立 tsc 仍为既有 3 处错误。
  - 2026-10-08：用户否定圆润卡通比例；按游戏内 HARRYCHASTESP.gif 转面重新构建低多边形人物，腹部略收，其他外形对照原模型，保留当前坐姿。
  - 2026-10-08 展示：替换为独立 `harry-game-model.py` 的角面人物，更新 `.blend`、静帧、12 帧循环；浏览器原色视图已核查并截图。lint/build 通过；独立 tsc 仍是上述 3 处既有错误。视觉重建尚不能保证与原游戏网格一致，待用户对比例和相似度验收。
  - 精修：依据官方截图/坐姿原画与 refer(0–4)，重做连续面部、发型细节、旧衣材质及疲惫坐姿；展示新渲染并检查网页双色/原色模式。
  - 精修交付：已生成新版 `.blend`、静帧和 12 帧循环；3120 端口 Lab 实际显示，原色/双色与暂停切换通过，浏览器无错误。lint 通过（7 条既有警告），联网 build 通过。独立类型检查仍有 3 处既有错误：`next.config.ts` 的 eslint 配置、`back-to-top.tsx` 的 ScrollSmoother 声明、`post-meta.tsx` 的 offsetHeight 类型；完整验收暂不勾选。当前仍是风格化建模习作，原作肖像相似度待用户视觉反馈。
  - 验收：哈利外形及持棍坐姿可辨识，棉花糖在火边；页面只含一名角色；沿用设计 token、双语字典和 reduced-motion；lint、build、类型检查及本地实际页面验证完成。

- [ ] **2026-10-07 未引用源码清理**：删除过时的 `components/lab/NEXT.md` 及未引用的 `disco-hero.tsx`、`hero-water.tsx`、`title-paths.ts`、`pixel-title.tsx`；保留归档、验证基准和 `idea/`。
  - 验收：无活动代码引用被删文件，`npm run lint` 与 `npm run build` 通过。历史方案文档保留供后续讨论。
  - 进度：5 个文件已删除；lint 通过（7 条现有警告），build 联网重试通过。现有 `next.config.ts` 设置 `ignoreBuildErrors: true`；额外执行 `tsc --noEmit` 被 `.next/dev/types` 生成文件语法错误阻塞，完整验收暂不勾选。

## 文章结构化元数据（2026-10-12，待实施）

- [ ] **META 结构化文章信息**：按 [PRD §3.7](../../Agent/docs/PRD.md#37-文章结构化元数据2026-10-12待实现) 完成 META-1~7；同时覆盖网站与 Agent 本地文章，一个主分类/多个标签。建议复用网站 SQLite、Agent 独立本地 SQLite，字段契约与权限一致；发布时间复用既有字段，阅读时长按语言/正文/算法版本估算。具体分类清单、文件移动身份和阅读算法参数仍待确认，本次不改 schema 或建立数据库。实施时逐项认领并验收，不以需求记录计为业务完成。

## Blog 页面改版（待实现）

> 2026-10-10 用户确认方向；实施前阅读 [PRD §3.3](../../Agent/docs/PRD.md#33-blog-页blogblogslug) 与 [DESIGN_SPEC 的 Blog 改版标注](DESIGN_SPEC.md#blog-改版标注2026-10-10待实现)。每次修改 Blog 页面前，先提醒用户确认是否需要加入其他新功能，并记录本轮范围。

- [x] **BLOG-0 记录改版需求**：同步需求、设计标注与实现待办；双向链接和书架展示保持待实现状态。
  - 验收：三份文档均可查到这两项方向及后续改版前的新功能提醒规则。
- [ ] **BLOG-1 Obsidian 式双向链接**：支持正文文章引用跳转及目标文章的反向链接；实施前确定引用语法、解析规则与详情页入口位置。
  - 验收：A 引用 B 后可从 A 跳转 B，并从 B 的反向链接返回 A；公开端不泄露草稿，失效引用不产生可点击死链接。
- [ ] **BLOG-2 书架式文章列表**：将 `/blog` 文章呈现为可点击的书本；实施前补齐桌面与移动端线框，再替换当前列表样式。
  - 验收：仅显示已发布文章，标题清晰、可点击进入详情、可键盘操作；移动端无横向溢出；使用既有设计 token，动效支持 reduced-motion。

## V2 候选池(不排期)

### Blog-Agent 扩展任务

- [ ] **BA-EXT-1 humanlizer 文章语言润色**：按 PRD §7.1，在待审整理/翻译链路可用后加入可选自然语言润色；保留作者观点、事实、术语、代码、链接与引用，输出独立待审稿与修改说明，支持跳过、对照和人工修订。
  - 验收：中文/英文固定样例有前后对照与人工审阅记录；原稿保留；未批准不得覆盖或发布；额外模型调用计入费用与耗时。目前仅记录扩展需求，未实现，不阻塞核心路线。






暗色模式切换 UI · 文章目录 TOC · RSS 订阅 · 标签筛选(迁移 Tag 关联表)· 全文搜索 · 评论 · 图片管理页面(查看/删除已上传图片)


## Blog Assistant 迁移

- [x] **2026-10-12 BA-9 检索收敛与预算收尾首版**：在 Agent 仓库补 list_posts 分页/快照、正文查询精确去重与无进展检测、持久预算与最后回答、单轮上下文组装及 Trace 结果断言。网站本轮只同步需求与状态，业务 API、向量检索和发布仍未实现。统一回归证据维护在 Agent TASKS 与亮点台账。
  - 验收：Agent 新增 32 项、统一 144 项回归通过，证据 `D:/CST/code/Agent/code/eval_results/20261012T034008544602Z/report.md`；网站 lint/build 通过，7 条既有 lint 警告及独立类型检查三处既有错误保留。未修改网站页面/数据、未新增依赖或调用付费模型；两仓库未提交或推送。

- [x] **2026-10-10 BA-1 评估验收与首批本机迁移**：按 Agent 实施计划 §20 验收现有评估，保留原 Demo，共用核心新增博客 CLI 和样例只读工具。
  - 验收：原 Agent 离线回归、博客恢复/权限/参数/路径测试通过；提供验收报告、启动及修改目录说明。业务代码仅修改 `D:/CST/code/Agent/code/`；真实博客连接另按 P3 实施。

  - 交付：Agent 原 78 项及博客 11 项测试通过；真实双文章引用及资料不足验证通过。详见 `D:/CST/code/Agent/blog-agent-acceptance-20261010.md`。博客 lint/build 通过；独立类型检查仍有既有三处错误，报告已列明。P0/P1/P2/P7 的完整阶段不据本条勾选。


- [x] **2026-10-10 BA-2 博客入口文件名与关键词搜索**：给 qa/manage 加入 find_file/find_text，限定用户选定 Markdown 目录；正文搜索仅接受先前 find_file 的实际结果。
  - 验收：文件名部分匹配、正文行号/片段、跨轮使用、越界/参数拒绝及原回归通过；解释 qa/manage 的 CLI 选择和当前权限边界。

  - 完成：新增 find_file/find_text，文件名支持大小写不敏感部分匹配及含空格/点号；关键词返回行号、片段、来源和版本。博客 18 项测试通过（含已有展示测试），原回归通过；未对用户文章做模型调用。两模式启动与权限区别已更新开发说明。


- [x] **2026-10-10 BA-3 默认文章目录改为 Agent/Blog**：删除两篇持久样例，默认 qa/manage 读取 Agent/Blog；离线测试改用临时目录，不读取用户正文。
  - 验收：默认目录与现有 Blog 一致，旧样例文件不存在，博客与原测试通过，开发说明和共享状态同步；旧会话不静默切换目录。

  - 完成：两篇持久样例及空目录已删除，qa/manage 默认 Agent/Blog；19 项博客测试和原回归通过，测试仅用临时文章。lint/build 通过，既有类型检查限制见前次报告；未读取或发送用户文章正文。


- [x] **BA-4 记录 Agent 完善要求**（2026-10-10）：同步 Prompt Caching、可选 Subagent、cache/compact 成本与质量评测到实施计划 §24 和共享上下文；仅完成标注。
- [ ] **BA-5 Prompt Caching 适配与观测**：按 provider/model 实际能力适配稳定前缀及缓存配置，保存实际 cached token 和观测覆盖率；未知数据不伪造。
  - 验收：固定用例的真实缓存证据、可重复配置和 trace；支持情况及限制明确。
- [ ] **BA-6 Cache/Compact 成本与质量评测系统**：固定数据集比较 none/local/summary 和不同阈值，完整计入摘要、重试、子任务成本；根据总成本、质量、耗时提出策略。
  - 验收：每组至少 5 次，保留全部结果和原始指标；同时报告命中率、任务质量、延迟、总费用和缺失数据，能解释选择依据。详见实施计划 §24.3。
- [ ] **BA-7 可选 Subagent 与对照评测**：提供应用/用户可选开关、独立上下文、父任务核验及失败/预算处理，默认单 Agent 仍可运行。
  - 验收：启用/关闭均可运行，父子 trace 和权限测试通过；在同一任务集上对照成本与质量。详见实施计划 §24.2。

- [x] **2026-10-11 哈利 Lab 文件清理**：删除已停用的程序建模脚本、检查脚本、旧预览和多余备份；保留当前场景、两份输入模型、构建仍依赖的环境基底、渲染及打包输入。验收：活动引用完整，lint/build 通过。

  - 完成：清理 14 个文件（4,751,147 字节）；活动脚本无已删文件引用，24 个构建/展示依赖完整。lint 通过（7 条既有警告），build 联网下载已有字体后通过。历史任务记录中的旧文件名仅作过程记录；当前入口为 harry-outfit-scene.py，procedural-backup 仍是必要环境基底。


- [ ] **BA-8 Blog Agent 独立仓库整理与发布**（2026-10-11 认领）：保留 Agent-Study Git 历史，将 Git 根目录提升到 Agent；归档 Demo，整理产品/文档/依赖，忽略本地资料与数据；远程改名 Blog-Agent 并提交。两项目记录大改后 Git 提交提醒。
  - 验收：独立干净检出的测试/入口可用，凭据和用户文章不入提交，远程提交与本地一致，历史有可恢复归档；博客规范变更通过 lint/build。

BA-8 进度：本地独立仓库整理、Demo 归档、凭据排除、97 项干净副本测试和 GitHub 更名完成。本地提交 b33a41c / 95b42e9；远程代码/标签推送待 Keywall 解锁，因此本项暂不勾选。博客 lint/build 通过，额外类型检查发现三处现有错误，未进行范围外修复。

2026-10-11 推送结果更新：Blog-Agent master 已成功上传，整理提交 167eb60，收尾提交 2a73b8c。此前未发布提交已本地备份并合并，避免测试占位符触发安全检查。旧历史归档标签因 Keywall 检测到 .env 凭据记录而未上传，保留本地标签与 bundle；原远程历史未重写。BA-8 主代码发布完成，历史凭据/归档标签问题单独待处理。





- [x] **2026-10-23 Hero界面精简**：移除首页左上Carry和右上菜单，原色切换与场景调节仅Lab预览可见；验收首页无上述控件、场景可用、Lab调节保留、lint/build通过。2026-10-23：开发服务器首页实际画面已验，Lab预览入口仍在；lint通过（7条既有警告），build含类型检查通过。


- [x] **2026-10-23 禁用Hero下滑转场**：正式首页停用转场手势和键盘接管，Lab保留；验收实际首页滚动后场景保持、lint/build通过（7条既有lint警告）。


- [x] **2026-10-23 Radar热区/loading/烟雾**：部分出屏Radar仍可点击；恢复原首页Preloader；提高烟雾；验收三物件入口、首次loading/同会话跳过、桌面/窄屏、减少动态、lint/build。

  - 验证：1280×720与390×844三入口均可见，Radar实际点击跳转/radar；首次遮罩计数001→100后退出，同标签刷新计数000且遮罩跳过；烟雾实看提高。Lab减少动态开关可用，系统媒体查询沿用原逻辑并复核，未改系统设置。lint通过（7条既有警告），build含类型通过。


- [x] **2026-10-23 Hero字幕避让**：底部空间不足时字幕翻至物件上方；验收1280×720及窄屏字幕不越底、Radar跳转、lint/build；连同上一轮loading与烟雾调整提交推送。

  - 通过：原1280×720字幕bottom=747.49（越界27.49px），修复后翻至上方，三入口字幕均在视口内；390×844自动恢复下方，三字幕均通过。lint通过（7条既有警告），build含类型通过。


- [x] **2026-10-23 Radar左侧字幕与loading就绪**：底部不足时Radar字幕改左侧；右下数字进度等待场景就绪；验收桌面/窄屏字幕与加载、lint/build。

  - 已验：1280×720 Radar在左、4px间距且未越界；390×844空间充分时在下且未越界；首次loading截图右下002→100、遮罩退出；lint通过（7既有警告）、build含类型通过。未强制慢网，系统减少动态沿用原降级。


- [x] **2026-10-23 loading首帧与0.1s缓冲**：完整首帧/两次绘制机会/0.1s后就绪，重复访问仍等场景再移除遮罩；验收首次/重复访问、页面实际画面、lint/build。

  - 已验首次与同标签刷新：加载时busy=true且mask保留，完成后busy=false且mask移除；首次100、重复会话000（跳过动画）符合约定。实际完整场景已见，lint通过（7既有警告）、build含类型通过。未强制慢网或GPU延迟。


- [x] **2026-10-23 loading恢复动画**：移除session跳过，刷新仍计数至100并上滑，保留场景就绪与0.1s缓冲；验收同标签刷新计数和遮罩位移、lint/build。

  - 同标签刷新实测000→083连续变化，终态100/translate(0%,-100%)/display:none；lint通过（7既有警告），build含类型检查通过。


## Agent 网站集成 workspace（2026-10-26）

- [x] **INTEGRATION-0 架构与工作区**：创建独立多根 workspace，交付前端/接口/数据/部署/验收规范，修正文档双语冲突；验收链接、路径和 lint/build。见 [集成计划](blog-assistant/integration/tasks.md)。
- [ ] **INTEGRATION-I1~I6 实施**：I1-F开发夹具与Agent配置/checkpoint基础已交付；完整HTTP、运行账本、内容连接及生产验收仍待完成，按集成计划分别认领。

- [ ] **2026-10-26 部署前准备**：认领 I1-F 开发预览、I1-B 无新增框架基础、部署预检与发布材料；前端先可用，生产入口默认关闭。验收：状态/双语/桌面与窄屏实看、lint/build、Agent 临时库专项与统一离线评测、预检负例及明确上线阻塞项。未连接模型与公网前不得标为正式问答上线。
  - 本机部分完成：I1-F、Agent基础18专项/统一547项、部署预检4项、Blog lint/build通过；桌面和360/390px实际操作通过。现网项目/容器/卷名已获用户盘点；实际挂载与资源占用、Docker实构及I2-I4运行连接待办，详见[验收记录](blog-assistant/integration/tasks.md)。未提交/推送。
