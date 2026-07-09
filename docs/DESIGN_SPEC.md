# DESIGN_SPEC — 设计规范

> 版本:v2.0 | 日期:2026-07-07
> 参考:lokasasmita.com(布局与动效第一优先级参考,**需着重复刻**)
> 调研依据:对参考站原始 HTML 的结构分析,详见 §5-§6 各动效/线框条目

## 1. 设计原则

1. **极简与留白** — 内容优先,装饰性元素克制;区块之间用大间距而非分割线
2. **排版即设计** — 视觉层级靠字号大步进与字重建立,不靠颜色堆砌
3. **动效服务内容** — 动画引导注意力、增强质感;所有动效可降级
4. **忠实复刻** — 布局与动效以参考站为准绳,拿不准时回看参考站,不即兴创作

## 2. 排版系统

字号阶梯(5 档,大步进):

| Token | 尺寸 | 用途 |
|-------|------|------|
| `text-display` | `clamp(2.5rem, 8vw, 6rem)` / 行高 1.05 / 字重 600 | Home hero 标语、页面大标题 |
| `text-heading` | `2rem` (32px) / 行高 1.2 / 字重 600 | 区块标题、文章 h2 |
| `text-subheading` | `1.25rem` (20px) / 行高 1.4 / 字重 500 | 卡片标题、文章 h3 |
| `text-body` | `1rem` (16px) / 行高 1.7 | 正文 |
| `text-caption` | `0.8125rem` (13px) / 行高 1.5 / 字母间距 +0.05em | 日期、标签、导航、表头,常配大写 |

规则:
- 标题控制在 2~3 行内,措辞精炼
- 全站只使用以上 5 档字号,**禁止新增中间档**
- 文章正文最大宽度 `65ch`

**字体**(与参考站一致):

| CSS 变量 | 字体 | 用途 |
|----------|------|------|
| `--font-display` / `--font-body` | **Geist** | 标题与正文(参考站同款) |
| `--font-mono` | **Geist Mono** | 日期、序号、caption 标签、表头 |
| 中文回退 | `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif` | 中文 UI 与内容 |

字体定义**只允许**写在 `src/config/fonts.ts`(next/font),输出上述 CSS 变量;更换字体只改此文件,见 §7。

## 3. 色板

中性底 + 单一强调色,全部落地为 CSS 变量(`src/styles/globals.css` 的 `:root` token 块):

| Token | Light 值 | 用途 |
|-------|----------|------|
| `--background` | `#FAFAF8`(暖白) | 页面底色 |
| `--foreground` | `#1A1A1A` | 主文字 |
| `--muted` | `#6B6B6B` | 次要文字(日期、描述) |
| `--border` | `#E5E5E0` | 边框、分隔 |
| `--accent` | `#2F4AE0`(可在 M0 微调一次后锁定) | 链接 hover、强调、焦点态 |
| `--revealer` | `#1A1A1A` | 页面过渡遮罩、preloader overlay 底色 |

规则:
- **禁止**在组件内出现字面量色值,一律引用 token
- token 块结构预留 `[data-theme="dark"]` 选择器位,暗色模式为 V2 低成本扩展
- 强调色使用面积 < 5%
- 更换主题色只改 token 块,见 §7

## 4. 布局与导航

- 内容最大宽度:`1120px`,水平内边距 `24px`(移动)/ `48px`(桌面)
- 区块垂直间距量级:`py-24`(桌面)/ `py-16`(移动);断点用 Tailwind 默认(`sm 640 / md 768 / lg 1024`)
- **导航**(全站共享,顶部):左侧 logo,右侧 `work / blog / about / contact` + 语言切换(`EN/中`);caption 字号 + 大写 + mono;当前页高亮(参考站 `active` 态);移动端保持横排
- **Footer**:极简一行,`名字 — 页面名` 式署名 + 社交链接

## 5. 动效规范(GSAP)

**库**:GSAP + ScrollTrigger 插件 + `@gsap/react`(`useGSAP` hook)。参考站自述即 "smooth animations from GSAP/Motion"。
所有动效组件集中在 `src/components/motion/`(client),页面本身保持 Server Component。

统一 token:

| Token | 值 |
|-------|-----|
| 时长 `fast / base / slow` | `0.2s / 0.5s / 0.8s` |
| 缓动 | `power4.out`(入场/揭示)、`power2.inOut`(过渡)、`power3.in`(由慢到快、尾端急加速:revealer 覆盖/上刷) |
| 入场位移 | `y: 24px → 0` |
| stagger 间隔 | `0.08s` |

**动效清单**(按参考站逐条复刻,标注出处页面):

| # | 动效 | 机制 | 出现位置 |
|---|------|------|----------|
| A1 | **页面过渡 revealer** | 全屏遮罩(`--revealer` 色):路由切换时,屏幕纵向约 3/4 处(下 1/4)浮现一条**约 2/5 屏宽**的横向黑线,X/Y **同步由慢到快**放大(同一 tween,同时抵达上下与左右边缘,"弹出"感)铺满全屏 → 新页就绪 → 遮罩**自底向上由慢到快**上刷揭示内容;每页顶层挂 revealer 元素 | 全站所有路由切换 |
| A2 | **Preloader** | 首次访问:全屏 overlay + 数字 counter(mono 字体)从 0 计数到 100 → overlay 揭开进入 hero;sessionStorage 记忆,同会话不重播 | Home 首次加载 |
| A3 | **文字滚动 hover(text-roll)** | 同一文字堆叠 3 份 span 于 overflow-hidden wrapper 内,hover 时 wrapper translateY 滚动到下一份;**触发容器整体反色**(整行/整项背景变 `--foreground`,滚入副本文字为 `--background`),避免不同字号的文字块各自反色;离开时滚到第三份(正常色)后无缝复位 | 博客列表行(整行反色,日期+标题各自滚动)、导航项 |
| A4 | **Pixelated 标题** | hero 大标题入场时像素块化 → 逐步清晰的揭示特效(canvas 或分块 div 实现,M3 定方案) | Home hero 标题 |
| A5 | **Work 滚动画廊** | ScrollTrigger pin 整屏:滚动驱动 ① 作品大图依次切换 ② 序号数字在 overflow mask 内翻转(双 digit wrapper 上移) ③ 右侧作品名列表 indicator(`—` 符号)移动 + 当前名高亮 ④ 底部 progressBar 随总进度增长;前后留 whitespace 滚动缓冲区 | Work 页 |
| A6 | **阅读进度条 progressBar** | 页面底部(或顶部)细条,宽度 = 滚动进度 | Blog 详情、Work |
| A7 | **入场 fade+up** | 区块进入视口:opacity 0→1 + y 24→0,列表项 stagger;`once: true` | 全站通用兜底动效 |
| A8 | **卡片 hover** | 封面图 scale 1.03 + 卡片 y -4px,时长 fast | Related articles、Home 精选区 |

红线:
- 必须响应 `prefers-reduced-motion`:A1-A5 降级为纯 fade 或直接展示;A2 直接跳过;A6 保留(非运动性)
- A5 在移动端(< md)降级为普通纵向作品列表,不做 pin 滚动
- 不新增清单之外的动效;发现参考站有遗漏的效果,先记入 TASKS V2 池再讨论

## 6. 页面线框(依据参考站 HTML 结构)

### Home `/`
```
[Preloader: counter 00→100 + overlay 揭示(仅首次)]        ← A2
[Nav: logo ······ work blog about contact | EN/中]

[hero ~100vh]
  大字标语 (display, pixelated 入场)                       ← A4
  hero 大图
  双栏 description(左右两列副文, muted)

[SELECTED WORK  (caption/mono 大写)]
  作品卡片 × ≤3                                            ← A8
[LATEST WRITING]
  文章行 × ≤3(日期 + 标题, text-roll hover)               ← A3
[Footer]
```

### Blog `/blog` — 双栏
```
[Nav]
┌─────────────────┬──────────────────────────────┐
│ 左侧 sticky 侧栏 │ 右侧文章列表                   │
│  Blog(N) 标题    │  表头: DATE        NAME       │ ← mono 大写
│  ABOUT 标签      │  ─────────────────────────    │
│  栏目描述一段     │  2026.1.11  文章标题一         │ ← 整行链接,
│  缩略图          │  2026.1.05  文章标题二         │   日期+标题 text-roll (A3)
└─────────────────┴──────────────────────────────┘
[Footer]
移动端:侧栏内容置顶,列表随后单栏
```

### Blog 详情 `/blog/[slug]`
```
[Nav]
[顶部大缩略图 (全宽 thumbnail)]
[文章标题 (display 缩小档)]
┌────────────────┬───────────────────────────────┐
│ metadata 侧栏   │ Markdown 正文 (max-w-65ch)     │
│  文章描述       │  h2/h3、段落、图片、代码块高亮   │
│  DATE  值      │  引用、列表                     │
│  TAGS  标签     │                               │
└────────────────┴───────────────────────────────┘
[RELATED ARTICLES: 卡片网格 × 2~3 (缩略图+标题+描述)]  ← A8
[底部阅读进度条]                                        ← A6
[Footer]
注:参考站无 TOC,本站同样不做(V2 候选)
```

### Work `/work` — 滚动驱动画廊(A5)
```
[Nav]
[whitespace 缓冲区]
[pin 整屏画廊]
   ┌───────────────────────┬────────────────┐
   │ 作品大图 (随滚动切换)    │ 作品名列表       │
   │ 序号 01↕ (mask 数字翻转) │ — 当前名高亮     │
   │ 当前作品一句话描述        │   其他名 muted  │
   └───────────────────────┴────────────────┘
[whitespace 缓冲区]
[底部 progressBar]                                     ← A6
点击作品名/大图 → /work/[slug]
移动端降级:纵向作品卡片列表(封面+标题+summary+标签)
```

### Work 详情 `/work/[slug]`
```
[Nav] → 封面大图 → 标题 + 技术标签(mono) + 外链按钮 → Markdown 正文 → [Footer]
```

### About `/about` — 分节布局
```
[Nav]
[BIO   (label mono 大写)] 自我介绍开场句 (display 缩小档) + 介绍段落
[SKILLS]                  技能/关注领域标签列表
[CONNECT]                 email(mailto) + socials 社交链接
[Footer]
```

### Admin `/admin/**`
后台**不受**本规范动效/排版约束,以朴素实用为准,但仍使用同一色板 token。

## 7. 主题定制接口(单点修改)

| 要改什么 | 只改哪里 | 步骤 |
|----------|----------|------|
| **字体** | `src/config/fonts.ts` | 换 next/font 导入(如 Geist → Space Grotesk),保持导出的 `--font-display/--font-body/--font-mono` 变量名不变,全站自动生效 |
| **主题色** | `src/styles/globals.css` 的 `:root` token 块 | 改 token 值(如 `--accent`);新增暗色 = 增加 `[data-theme="dark"]` 块覆写同名 token |
| **UI 语言文案** | `src/i18n/zh.ts` / `src/i18n/en.ts` | 改字典键值;新增语言 = 新增字典文件并注册,组件零改动 |

除上述入口外,任何组件/页面**禁止**内联字体名、色值、UI 文案字符串(详见 [AGENTS.md](../AGENTS.md) 红线)。
