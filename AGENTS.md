# AGENTS.md

本文件是所有 AI 编程助手（Claude Code、Codex、Copilot 等）的共同规则来源。
`CLAUDE.md` 只导入本文件；规则改动写在这里，不写进 `CLAUDE.md`。

## 知枝是什么

知枝是围绕个人学习目标组织内容的学习助手：用户表达目标 → 必要补问 → 学习约定 →
路线 → 按节生成卡片 → 连续阅读与提问 → 保存进度 → 下次继续。

当前阶段：先做网页版供用户验收，**本轮不做 APK 打包、安卓原生开发或移动端适配**。
最终形态是 Capacitor 打包的手机 App，所以业务代码不能依赖只有浏览器才有的能力。

## 先读哪份文档

| 文档 | 用途 |
| --- | --- |
| [docs/知枝-产品策划与网页迭代方案.md](docs/知枝-产品策划与网页迭代方案.md) | **最新产品策划（以此为准）**：体验流程、本轮范围、开发关键点 |
| [docs/工程架构与开发规范.md](docs/工程架构与开发规范.md) | 模块职责、数据兼容、验证证据 |
| [outputs/learning-grove/README.md](outputs/learning-grove/README.md) | 正式应用的模块清单与运行方式 |
| `outputs/知枝-*.md` | 历史策划与验收记录，只作参考；与最新策划冲突时以最新策划为准 |

## 目录

```
zhizhi/
├── outputs/learning-grove/   # 正式应用（唯一在开发的代码），所有命令在这里执行
│   ├── src/                  # 见下方分层规则
│   ├── tests/                # node:test 回归测试（*.test.mjs）
│   ├── skills/               # 教学规则 Markdown，构建时复制到 public/skills/
│   ├── config/providers.json # 模型端点与模型名，集中在这一处
│   ├── android/              # Capacitor 安卓工程（本轮不改）
│   └── legacy/               # 旧 Python 实现，已归档，不改
├── experiments/、outputs/pi-mobile-probe/  # 历史验证项目，不改
└── docs/                     # 当前有效的策划与架构文档
```

`dist/`、`static/`、`public/skills/` 是生成目录，不手改、不提交。

## 命令

```bash
cd outputs/learning-grove
npm ci              # 安装依赖（Node.js 24+）
npm run dev         # 开发服务器
npm run format      # Prettier 自动格式化
npm run check       # 提交前必跑：格式 + 测试 + 类型检查 + 构建 + doctor
node --test tests/architecture.test.mjs   # 只跑一个测试文件
```

CI（`.github/workflows/check.yml`）在每个 PR 上执行同一条 `npm run check`，不通过不能合并。

## 分层规则（由 `tests/architecture.test.mjs` 强制）

```
ui/  ──▶  application/service.ts  ──▶  core/
 │                │                     ▲
 └──▶ contracts.ts ◀──────── platform/ ─┘(仅 domain.ts)
```

- `ui/` 只能通过 `LearningService` 的 `dispatch()` / `read()` / `subscribe()` 工作，
  不直接导入 `core/` 或 `platform/`。
- `core/` 是纯业务逻辑：只导入 `contracts.ts` 和 `core/` 内部文件，
  不导入 React、Capacitor，不使用 `window`、`localStorage` 等浏览器全局对象。
- `application/` 不导入 `ui/` 和 React。
- `platform/` 不导入 `ui/` 和 `application/`。
- 新增跨层能力时，先在 `contracts.ts` 定义类型，再由下层实现、上层调用。
  确实需要新的依赖方向时，同时修改本节和架构测试，并在 PR 里说明原因。

## 硬性规则

- **类型**：`src/` 内禁止 `any`、`@ts-ignore`、`@ts-nocheck`、`@ts-expect-error`（架构测试检查）。
  模型返回、导入档案等外部 JSON 必须经过 `core/validate.ts` 的运行时校验。
- **结果提交**：模型和工具不直接写档案；结果经 `LearningService` 校验输入版本后原子提交，
  版本已变化的旧结果必须被拒绝，取消不发布半成品。
- **数据兼容**：不改 IndexedDB 名 `zhizhi-app`、store `state`、key `document`、
  档案格式 `zhizhi-personal-2`、应用 ID `app.zhizhi.personal`，除非同一改动提供迁移和测试。
- **密钥**：API Key 不进入档案、日志、测试数据和 Git。安卓存于 Keystore，网页版存于浏览器本地存储（`platform/browser-model.ts`），只由 `platform/` 读写。模型端点和模型名只在 `config/providers.json` 配置。
- **真实与演示分开**：演示数据在界面上明确标注“演示”；模型生成、搜索结果、实际读取、核对通过是不同状态，不能混用。
- **失败可恢复**：等待、失败、取消、重试都有用户能理解的状态，并保留用户输入和已保存内容。

## 工作流程

1. 每个任务开一个分支：`feat/…`、`fix/…`、`refactor/…`、`docs/…`、`chore/…`。
2. 动手前先写下**验收条件**：用户怎么操作、看到什么结果。
3. 新功能和 bug 修复都要带测试；修 bug 先写一个在修复前失败的测试。
4. 每次只做一段已经讨论过的体验，不顺手做无关的大重构。
5. 提交前在 `outputs/learning-grove` 跑 `npm run check`，全部通过再提交。
6. 通过 PR 合入 `main`，按 `.github/pull_request_template.md` 填写，包括 AI 使用说明。
7. 改了架构或开发规则，同一个 PR 里更新本文件和 `docs/工程架构与开发规范.md`；
   改了用户能看到的行为，同步更新 `outputs/learning-grove/README.md`。

## 策划案维护

- 日常讨论只在对话里推进，不逐条改策划案。
- 完成一版、准备实装测试时，才修订 `docs/知枝-产品策划与网页迭代方案.md`，
  写入实际做出的内容、确定的规则和验证结果。
- 策划案正文用简洁陈述句，只写已经确定和已经完成的内容。

## 不要做

- 不编辑 `CLAUDE.md`（只含 `@AGENTS.md`）。
- 不修改 `legacy/`、`experiments/`、`outputs/pi-mobile-probe/`、`android/`（本轮）。
- 不为了让检查通过而删测试、放宽类型或改架构测试；先修代码，确需改规则时在 PR 里写明理由。
- 不提交 `node_modules/`、`dist/`、签名文件、数据库和安装包。
