// PR 固定规则检查：只做能用规则判断的事，判断结果不依赖模型。
// CI 在 pull_request 上运行；本地可用 `npm run pr-guard` 对比 origin/main。
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = "outputs/learning-grove/";
// 勾选“只改文档 / 测试 / CI”后不应出现的路径。
const PRODUCT_PATHS = [
  "src/",
  "skills/",
  "config/",
  "android/",
  "public/",
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "capacitor.config.json",
  "tsconfig.json",
].map((p) => APP + p);
const SECRETS: Array<[string, RegExp]> = [
  ["模型 API Key（sk-…）", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["GitHub Token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["AWS Access Key", /\bAKIA[0-9A-Z]{16}\b/],
  ["私钥", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const KEY_LOG =
  /console\.(?:log|info|warn|error|debug)\([^)]*\b(?:api_?key|apiKey|secret|token|authorization)\b/i;
const DOCS_ONLY = /^\s*-\s*\[[xX]\]\s*\*\*只改文档 \/ 测试 \/ CI\*\*/m;
// 理由不能只是模板里的占位符“……”或“...”。
const TEST_REASON = /测试减少理由[:：][ \t]*(?![.…。]*[ \t]*$)\S/m;
// PR 模板里的 <!-- 提示 --> 不是作者写的内容。
const withoutComments = (body: string) => body.replace(/<!--[\s\S]*?-->/g, "");

export interface TestStats {
  tests: number;
  skipped: number;
}
export interface PullRequestInput {
  body: string;
  files: string[];
  added: Array<{ path: string; line: string }>;
  base: TestStats;
  head: TestStats;
}

export function testStats(sources: string[]): TestStats {
  let tests = 0,
    skipped = 0;
  for (const s of sources) {
    tests += (s.match(/^\s*test\(/gm) || []).length;
    // 只数行首的调用，避免把字符串里的示例算进去；选项对象可以分行书写，
    // skip 的值可以是 true 或说明字符串，false 不算。
    skipped += (
      s.match(
        /^\s*test(?:\.(?:skip|todo|only)\(|\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*\{[^}]*\b(?:skip|todo|only)\s*:(?!\s*false\b))/gm,
      ) || []
    ).length;
  }
  return { tests, skipped };
}

export function checkPullRequest(pr: PullRequestInput): string[] {
  const problems: string[] = [];
  const body = withoutComments(pr.body);
  if (DOCS_ONLY.test(body)) {
    const product = pr.files.filter((f) =>
      PRODUCT_PATHS.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)),
    );
    if (product.length)
      problems.push(
        `PR 勾选了“只改文档 / 测试 / CI”，但改动了产品文件：${product.join("、")}。请取消勾选并补充说明，或撤回这些改动。`,
      );
  }
  if (pr.head.tests < pr.base.tests && !TEST_REASON.test(body))
    problems.push(
      `测试从 ${pr.base.tests} 个减少到 ${pr.head.tests} 个。若确需删除，请在 PR 描述中写一行“测试减少理由：……”。`,
    );
  if (pr.head.skipped > pr.base.skipped)
    problems.push(
      `新增了被跳过或独占的测试（skip / todo / only），从 ${pr.base.skipped} 处增加到 ${pr.head.skipped} 处。`,
    );
  for (const { path, line } of pr.added) {
    for (const [name, pattern] of SECRETS)
      if (pattern.test(line))
        problems.push(`${path} 新增内容疑似包含${name}，请移除并作废该密钥。`);
    if (path.startsWith(APP + "src/") && KEY_LOG.test(line))
      problems.push(`${path} 新增的日志输出可能包含密钥：${line.trim()}`);
  }
  return problems;
}

function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
function statsAt(rev: string): TestStats {
  const files = git("ls-tree", "-r", "--name-only", rev, "--", APP + "tests")
    .split("\n")
    .filter((f) => f.endsWith(".test.mjs"));
  return testStats(files.map((f) => git("show", `${rev}:${f}`)));
}
function addedLines(base: string): PullRequestInput["added"] {
  const added: PullRequestInput["added"] = [];
  let path = "";
  for (const line of git("diff", "--unified=0", base, "HEAD").split("\n")) {
    if (line.startsWith("+++ ")) path = line.replace(/^\+\+\+ (?:b\/)?/, "");
    else if (line.startsWith("+") && path)
      added.push({ path, line: line.slice(1) });
  }
  return added;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.BASE_SHA || "origin/main";
  process.chdir(git("rev-parse", "--show-toplevel").trim());
  const problems = checkPullRequest({
    body: process.env.PR_BODY || "",
    files: git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean),
    added: addedLines(base),
    base: statsAt(base),
    head: statsAt("HEAD"),
  });
  if (problems.length) {
    console.error(`PR 固定规则检查发现 ${problems.length} 个问题：`);
    for (const p of problems) console.error("- " + p);
    process.exit(1);
  }
  console.log("PASS: PR 固定规则检查没有发现问题。");
}
