#!/usr/bin/env node
/**
 * golden/w3/sweep.mjs —— 扫参小工具:一行一个配置,只打关键指标。
 *   node golden/w3/sweep.mjs <preset> "uA=1 uB=2" "uA=3 uB=4" ...
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const [preset, ...combos] = process.argv.slice(2);
console.log("  config".padEnd(46) + "总分  flat  coh  corr peak cov%  dash");
for (const c of combos) {
  const sets = c.split(/\s+/).filter(Boolean).flatMap((s) => ["--set", s]);
  const out = `/tmp/sw-${preset}.png`;
  const r = spawnSync("node", ["golden/w3/run.mjs", preset, "--out", out, ...sets],
    { cwd: ROOT, encoding: "utf8" });
  const t = r.stdout;
  const g = (re) => { const m = t.match(re); return m ? m[1] : "?"; };
  console.log(
    ("  " + c).padEnd(46) +
      g(/加权总分\s+([\d.]+)/).padStart(5) +
      g(/前景平坦度[^\n]*?\s([\d.]+)\s+0\.065/).padStart(6) +
      g(/相干度\s+([\d.-]+)/).padStart(6) +
      g(/曲线相关\s+([\d.-]+)/).padStart(6) +
      g(/峰值所在带\s+(\d+)/).padStart(5) +
      g(/覆盖率 %\s+([\d.]+)/).padStart(6) +
      g(/长宽比\s+([\d.]+)/).padStart(6)
  );
}
