/**
 * 临时演示页(M0-2 验收用):展示 5 档字号阶梯、全部色板 token 与三个字体变量。
 * 仅供开发期自查,正式上线前可移除。文案为开发工具用途,不走 i18n 字典。
 */
export default function StyleguidePage() {
  return (
    <main className="mx-auto max-w-[1120px] px-6 py-16 flex flex-col gap-16">
      <section className="flex flex-col gap-4">
        <p className="text-caption font-mono uppercase text-muted">
          Type Scale — 5 steps only
        </p>
        <p className="text-display font-display">Display 大标题 Aa</p>
        <p className="text-heading font-display">Heading 区块标题 Aa</p>
        <p className="text-subheading">Subheading 卡片标题 Aa</p>
        <p className="text-body max-w-[65ch]">
          Body 正文 — I believe creativity isn&apos;t just a skill,
          it&apos;s a mindset. 中文正文混排效果检查,行高 1.7,最大宽度 65ch。
        </p>
        <p className="text-caption font-mono uppercase text-muted">
          Caption / mono — 2026.07.07 · DATE · NAME
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <p className="text-caption font-mono uppercase text-muted">
          Color Tokens
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["background", "bg-background"],
              ["foreground", "bg-foreground"],
              ["muted", "bg-muted"],
              ["border", "bg-border"],
              ["accent", "bg-accent"],
              ["revealer", "bg-revealer"],
            ] as const
          ).map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className={`h-16 rounded border border-border ${cls}`} />
              <span className="text-caption font-mono text-muted">
                --{name}
              </span>
            </div>
          ))}
        </div>
        <p className="text-body">
          语义类检查:<span className="text-muted">muted 次要文字</span> ·{" "}
          <span className="text-accent">accent 强调链接</span> ·{" "}
          <span className="border-b border-border">border 分隔</span>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-caption font-mono uppercase text-muted">Fonts</p>
        <p className="font-display text-subheading">
          font-display — Geist 0123456789
        </p>
        <p className="font-body text-subheading">
          font-body — Geist 0123456789 中文回退检查
        </p>
        <p className="font-mono text-subheading">
          font-mono — Geist Mono 0123456789
        </p>
      </section>
    </main>
  );
}
