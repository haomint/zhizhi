import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkPullRequest, testStats } from "../scripts/pr-guard.ts";

const stats = { tests: 10, skipped: 0 };
const pr = (over = {}) => ({
  body: "",
  files: [],
  added: [],
  base: stats,
  head: stats,
  ...over,
});
const docsOnly = "- [x] **只改文档 / 测试 / CI**";
// 拼接生成，避免测试文件本身被识别为泄露的密钥。
const fakeKey = "sk-" + "a1B2".repeat(8);

test("a clean pull request passes", () => {
  assert.deepEqual(
    checkPullRequest(pr({ body: docsOnly, files: ["README.md", "docs/a.md"] })),
    [],
  );
});
test("docs-only box checked while product code changed is reported", () => {
  const [problem] = checkPullRequest(
    pr({
      body: docsOnly,
      files: ["docs/a.md", "outputs/learning-grove/src/core/learning.ts"],
    }),
  );
  assert.match(problem, /只改文档/);
  assert.match(problem, /src\/core\/learning\.ts/);
  assert.deepEqual(
    checkPullRequest(
      pr({
        body: "- [ ] **只改文档 / 测试 / CI**",
        files: ["outputs/learning-grove/src/core/learning.ts"],
      }),
    ),
    [],
  );
});
test("fewer tests need a written reason, new skips are always reported", () => {
  const fewer = { tests: 9, skipped: 0 };
  assert.match(checkPullRequest(pr({ head: fewer }))[0], /10 个减少到 9 个/);
  assert.deepEqual(
    checkPullRequest(pr({ head: fewer, body: "测试减少理由：合并重复用例" })),
    [],
  );
  assert.match(
    checkPullRequest(pr({ head: { tests: 10, skipped: 1 } }))[0],
    /skip/,
  );
});
test("added secrets and key logging are reported", () => {
  const problems = checkPullRequest(
    pr({
      added: [
        { path: "outputs/learning-grove/tests/x.test.mjs", line: fakeKey },
        {
          path: "outputs/learning-grove/src/platform/platform.ts",
          line: "console.log('key', apiKey);",
        },
        {
          path: "outputs/learning-grove/src/ui/App.tsx",
          line: "console.log(items.length);",
        },
      ],
    }),
  );
  assert.equal(problems.length, 2);
  assert.match(problems[0], /API Key/);
  assert.match(problems[1], /日志输出/);
});
test("test statistics count tests and skips", () => {
  assert.deepEqual(
    testStats([
      'test("a", () => {});\n  test("b", () => {});',
      'test.skip("c", () => {});\ntest("d", { skip: true }, () => {});',
    ]),
    { tests: 3, skipped: 2 },
  );
});
test("the unfilled PR template does not count as a test-reduction reason", () => {
  const template = readFileSync(
    resolve(import.meta.dirname, "../../../.github/pull_request_template.md"),
    "utf8",
  );
  const fewer = { tests: 9, skipped: 0 };
  assert.match(
    checkPullRequest(pr({ body: template, head: fewer }))[0],
    /10 个减少到 9 个/,
  );
  assert.equal(
    checkPullRequest(pr({ body: "测试减少理由：……", head: fewer })).length,
    1,
  );
});
test("skip options on their own line are counted", () => {
  assert.deepEqual(
    testStats([
      [
        "test(",
        '  "multi-line skip",',
        "  { skip: true },",
        "  () => {},",
        ");",
        'test("reasoned", { skip: "flaky on CI" }, () => {});',
        'test("kept", { skip: false }, () => {});',
      ].join("\n"),
    ]),
    { tests: 3, skipped: 2 },
  );
});
