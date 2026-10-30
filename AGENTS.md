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
| [docs/依赖安全记录.md](docs/依赖安全记录.md) | `npm audit` 提醒的评估结论与复查条件 |
| [outputs/learning-grove/README.md](outputs/learning-grove/README.md) | 正式应用的模块清单与运行方式 |
| `outputs/知枝-*.md` | 历史策划与验收记录，只作参考；与最新策划冲突时以最新策划为准 |

### v3 参考版本（用户验收确认的体验）

网页 1.0.1（“连续阅读版”）是用户确认的体验基准：居中单输入框、选择题补问、
无测验的连续阅读、“上一张”与跨已读小节回看。它是**打包后的单个 HTML 文件**，
存放在 `chore/upload-web-main-1.0.1` 分支，源码不在仓库里。它只作效果参考：
把其中的体验迁移进 `learning-grove`，不在它上面继续开发，也不复制它的代码。

在仓库根目录取出并打开（`.v3-reference/` 已被忽略）：

```bash
git fetch origin chore/upload-web-main-1.0.1
mkdir -p .v3-reference
git show "origin/chore/upload-web-main-1.0.1:outputs/网页原型/知枝-v3/release/index.html" > .v3-reference/index.html
cd outputs/learning-grove && npx vite ../../.v3-reference --host 127.0.0.1 --port 4184 --strictPort
```

浏览器打开 `http://localhost:4184/`。

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
PR Guard（`.github/workflows/pr-guard.yml`，脚本 `scripts/pr-guard.ts`）另外检查：勾选“只改文档 / 测试 / CI”
却改了产品文件、测试数量减少且没写“测试减少理由”、新增 skip/only、新增内容含密钥或把密钥写进日志。
本地可运行 `node scripts/pr-guard.ts` 对比 `origin/main`。

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
- **密钥**：API Key 不进入档案、日志、测试数据和 Git。模型端点和模型名只在 `config/providers.json` 配置。
- **真实与演示分开**：演示数据在界面上明确标注“演示”；模型生成、搜索结果、实际读取、核对通过是不同状态，不能混用。
- **失败可恢复**：等待、失败、取消、重试都有用户能理解的状态，并保留用户输入和已保存内容。

## 工作流程

1. **先有任务再动手**。任务就是 Issue，用「任务」模板开，写清要做什么、**验收条件**
   （用户怎么操作、看到什么结果）、不做什么、难度和依赖。新任务不设 Assignee，加 `待认领`，
   并放进 [知枝开发看板](https://github.com/users/haomint/projects/1) 的「待认领」列。
2. **认领**（只由人认领）：
   - 从带 `待认领` 的任务里挑，依赖都完成了再领；带 `需要讨论` 的先在评论里讨论，不领。
   - 把自己设为 Assignee，去掉 `待认领`，在看板上移到「进行中」。已有 Assignee 的任务不要做。
   - 开了 PR 后移到「待合并」；PR 合并后任务关闭，移到「已完成」。
   - 每人同时最多领 **2** 个；领了做不了，取消自己的 Assignee 并加回 `待认领`，在评论里说明进度。
   - 认领人可以把任务交给 AI agent 做，但 Assignee 仍是这个人，由他检查结果并负责；
     这样的 PR 加 `agent` 标签。
3. **一个 Issue 一个分支一个 PR**。开工前同步 `main`，分支名带 Issue 编号：
   `类型/编号-简述`，类型为 `feat`、`fix`、`refactor`、`docs`、`chore`，例如 `feat/12-web-model`。
4. 新功能和 bug 修复都要带测试；修 bug 先写一个在修复前失败的测试。
5. 每次只做一段已经讨论过的体验，不顺手做无关的大重构。
6. 提交前在 `outputs/learning-grove` 跑 `npm run check`，全部通过再提交。
7. 按 `.github/pull_request_template.md` 开 PR，描述第一行写 `Fixes #编号`，填好 AI 使用说明。
8. 改了架构或开发规则，同一个 PR 里更新本文件和 `docs/工程架构与开发规范.md`；
   改了用户能看到的行为，同步更新 `outputs/learning-grove/README.md`。

## 多人协作

团队 4 人，另有多个 AI agent 参与。`main` 只能通过 PR 合入，`web` 和 `guard` 检查
都通过、代码审查讨论已处理后才能合并（GitHub 规则强制；不强制批准人数）。合并由有权限的成员（haomint、G-meng965）执行；
AI agent 开的 PR，合并前由人类成员实际试用验收条件里的操作。

避免冲突：

- 开工前看一眼进行中的 PR，同一模块已有人在改时，先在 Issue 里沟通再动手。
- 共享文件（`src/contracts.ts`、`AGENTS.md`、`package.json`）的改动尽量小、尽快合并。
- PR 合并后删除分支，本地切回 `main` 并 `git pull`。

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
- 不运行 `npm audit fix --force`；安全提醒按 `docs/依赖安全记录.md` 评估。
- AI agent 不认领任务，只做认领人明确交给它的任务；不合并、不批准 PR，不修改仓库设置和分支规则。
  被要求整理任务时，只开 Issue（不设 Assignee、加 `待认领`），不自己去做。
