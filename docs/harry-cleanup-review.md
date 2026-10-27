# 哈利灯球文件清理审核

> 2026-10-26 阅读边界：既往资产清理证据；不授权继续删除资产，不属于新Hero实施步骤。 当前Hero见[下潜规格](hero-descent-spec.md)。

状态：用户已批准仅删除 A；22 个文件全部通过 SHA-256 校验后删除，B 组两份备份校验未变。范围仅限本轮哈利/灯球工作，不处理仓库其他未提交改动。

## A：已删除的临时产物

正式工作流不依赖这些临时文件。历史台账提及诊断目录，但具体结果、原始备份和正式证据另行保留。

| 文件 | 大小 | 删除理由 |
|---|---:|---|
| `.file/harry-refine/collision-groups.py` | 1.1 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/contact-check.py` | 0.9 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/contact-lift.py` | 0.7 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/edit-pose.py` | 2.5 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/edit-tips.py` | 0.4 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/finish-ledger.py` | 1.1 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/orb-probe.py` | 0.6 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/pants-surface.py` | 0.4 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/pose-check.py` | 0.3 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/probe.py` | 0.8 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/render.py` | 0.3 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/rod-fit.py` | 0.8 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/rod-groups.py` | 1.0 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/update-ledger.py` | 2.9 KiB | 一次性诊断/姿态试验/台账迁移脚本；正式生成与验证脚本已保留 |
| `.file/harry-refine/ledger-incoming.md` | 3.1 KiB | 已写入共享台账 records-014.md 的中间草稿 |
| `.file/harry-refine/orb-ledger.md` | 0.8 KiB | 已写入共享台账 records-014.md 的中间草稿 |
| `.file/harry-refine/orb-web-ledger.md` | 1.6 KiB | 已写入共享台账 records-014.md 的中间草稿 |
| `.file/harry-refine/hands-after.png` | 993.3 KiB | 调试中间图；正式双侧手部与最终渲染图已保留 |
| `.file/harry-refine/hands-before.png` | 990.2 KiB | 调试中间图；正式双侧手部与最终渲染图已保留 |
| `.file/harry-refine/hands-side-after.png` | 968.8 KiB | 调试中间图；正式双侧手部与最终渲染图已保留 |
| `.file/harry-refine/hands-side-before.png` | 962.4 KiB | 调试中间图；正式双侧手部与最终渲染图已保留 |
| `.file/harry-refine/opaque-check.png` | 545.9 KiB | 调试中间图；正式双侧手部与最终渲染图已保留 |

小计：22 个文件，4.37 MiB。

## B：可选删除的旧自动备份

两份 `.blend1` 不是重复文件；它们包含旧中间状态。当前源文件、精修版和本轮原始备份均保留。

| 文件 | 大小 | 删除理由 |
|---|---:|---|
| `blender/harry-campfire-orb-dark.blend1` | 14397.5 KiB | 旧自动保存版本；对应主文件仍保留。非逐字节重复文件，删除会失去该中间状态 |
| `blender/harry-campfire-orbit.blend1` | 14213.4 KiB | 旧自动保存版本；对应主文件仍保留。非逐字节重复文件，删除会失去该中间状态 |

小计：2 个文件，27.94 MiB。

## 保留

- 当前/精修源场景：`harry-campfire-orb-dark.blend`、`harry-campfire-orb-finished.blend`。
- `.file/harry-refine/original.blend`、`original-build.py`、`original-renderer.ts`：本轮原始对照与恢复依据。
- `pause-a.png`、`pause-b.png`、`paused-second.png`：未解决的暂停像素差异证据。
- `blender/` 下正式渲染、网页/手机预览、手部双侧近景：保留文档与台账引用。
- 旧 `.blend` 历史场景、人物/篝火输入：保留可编辑历史与生成依赖。
- 正式生成、精修、验证、网页导出/打包脚本；`public/harry-campfire/` 下资源全部保留。包括原始 PNG/geometry.bin，避免破坏重新打包。
- 其他任务文件、SQLite、migrations、配置与密钥文件不在本清单。

## 审核选项

- **仅删除 A（建议）**：先清理确定不再用于正式流程的临时文件。
- **删除 A+B**：同时清理两份旧自动备份，失去对应中间版本。

执行完成：逐文件核对路径及 SHA-256 后删除，未递归清空目录。此清单与校验清单保留作审计记录。
