import test from "node:test";
import assert from "node:assert/strict";
import {
  migrate,
  event,
  forget,
  material,
  importArchive,
  validateArchive,
  activeEvents,
} from "../src/core/domain.ts";
import {
  generate,
  featureAction,
  selectPassages,
} from "../src/core/learning.ts";
import { validateResult } from "../src/core/validate.ts";
function state() {
  return migrate({
    trees: [
      {
        id: "t",
        title: "函数",
        goal: "理解",
        preferences: {},
        nodes: [
          {
            id: "n",
            title: "函数",
            description: "基础",
            status: "unseen",
            ready: false,
            cards: [],
            messages: [],
            links: [],
            page: 0,
          },
        ],
        materials: [
          material({ title: "教材", text: "每个输入对应唯一输出。f(3)=6。" }),
        ],
      },
    ],
    memories: [],
    revision: 0,
  });
}
const checks = Object.fromEntries(
  [
    "goal",
    "prerequisites",
    "definitions",
    "examples",
    "sequence",
    "sources",
    "burden",
  ].map((k) => [k, true]),
);
const long = (text) => text + "函数把每个输入对应到唯一输出。".repeat(12);
function model(record, fail = false, thin = false) {
  return async (stage, c) => {
    record.push(stage);
    const short = thin && !c.repair;
    const results = {
      knowledge: {
        decision: "ready",
        claims: [
          {
            id: "c",
            text: "函数",
            status: "supported",
            material_ids: [c.materials[0].id],
          },
        ],
        gaps: [],
      },
      "page-plan": {
        node_id: "n",
        pages: [
          { kind: "定义诠释", purpose: "定义", claim_ids: ["c"] },
          { kind: "例子", purpose: "演示", claim_ids: ["c"] },
        ],
        uncovered_claim_ids: [],
      },
      cards: {
        cards: [
          {
            node_id: "n",
            kind: "定义诠释",
            title: "函数",
            text: short ? "唯一输出" : long("唯一输出"),
          },
          {
            node_id: "n",
            kind: "例子",
            title: "例子",
            text: short ? "f(3)=6" : long("f(3)=6"),
          },
        ],
      },
      quality: {
        decision: fail ? "revise" : "pass",
        checks,
        issues: fail ? [{ severity: "core", reason: "需修订" }] : [],
      },
    };
    return results[stage];
  };
}
test("node pipeline commits complete source-backed content and retains one previous version", async () => {
  const s = state(),
    t = s.trees[0],
    n = t.nodes[0],
    calls = [];
  await generate(s, t, n, model(calls), async () => []);
  assert.deepEqual(calls, ["knowledge", "page-plan", "cards", "quality"]);
  assert.equal(n.content_version, 1);
  await generate(s, t, n, model([]), async () => []);
  assert.equal(n.content_version, 2);
  assert.equal(n.content_history.length, 1);
});
test("quality revision is bounded and leaves old node untouched", async () => {
  const s = state(),
    t = s.trees[0],
    n = t.nodes[0],
    before = JSON.stringify(n),
    calls = [];
  await assert.rejects(
    generate(s, t, n, model(calls, true), async () => []),
    /修订后/,
  );
  assert.equal(calls.filter((x) => x === "cards").length, 2);
  assert.equal(JSON.stringify(n), before);
});
test("thin pages get one program-side repair that does not use up the model revision", async () => {
  const s = state(),
    t = s.trees[0],
    n = t.nodes[0],
    calls = [],
    contexts = [];
  const base = model(calls, false, true);
  await generate(
    s,
    t,
    n,
    async (stage, c) => {
      contexts.push(c);
      return base(stage, c);
    },
    async () => [],
  );
  assert.deepEqual(calls, [
    "knowledge",
    "page-plan",
    "cards",
    "cards",
    "quality",
  ]);
  assert.match(contexts[3].repair.issues[0].reason, /只有 4 字/);
  assert.ok(n.cards.every((c) => c.text.length >= 150));
});
test("material selection reads passages relevant to the node, not the opening", () => {
  const filler = "这一段讲的是天气和饮食，与主题无关。".repeat(60);
  const m = material({
    title: "长教材",
    text: [
      filler,
      "导数描述函数在某一点的瞬时变化率，是切线斜率。",
      filler,
    ].join("\n"),
  });
  const [picked] = selectPassages([m], "导数 变化率");
  assert.match(picked.text, /瞬时变化率/);
  assert.ok(picked.text.length < m.text.length);
  assert.match(picked.location, /按相关性节选/);
  assert.equal(selectPassages([m], "量子力学").length, 0);
});
test("no material and failed retrieval blocks publishing", async () => {
  const s = state(),
    t = s.trees[0];
  t.materials = [];
  await assert.rejects(
    generate(
      s,
      t,
      t.nodes[0],
      () => {
        throw Error("must not call");
      },
      async () => {
        throw Error("offline");
      },
    ),
    /没有可读取/,
  );
});
test("claims cannot cite fabricated sources; quality cannot contradict failed checks", () => {
  assert.throws(
    () =>
      validateResult(
        "knowledge",
        {
          decision: "ready",
          claims: [
            {
              id: "x",
              text: "fact",
              status: "supported",
              material_ids: ["fake"],
            },
          ],
          gaps: [],
        },
        { materials: [] },
      ),
    /不存在/,
  );
  assert.throws(
    () =>
      validateResult("quality", {
        decision: "pass",
        checks: { ...checks, sources: false },
        issues: [],
      }),
    /核心问题/,
  );
});
test("settlement cannot invent evidence or infer strategy from one question", () => {
  const ctx = {
    event_range: { after: 0, through: 1 },
    events: [{ id: "q", type: "question" }],
  };
  assert.throws(
    () =>
      validateResult(
        "settlement",
        {
          event_range: ctx.event_range,
          observations: [],
          strategy_proposals: [
            { change: "短例子", reason: "猜测", event_ids: ["q"] },
          ],
        },
        ctx,
      ),
    /明确偏好/,
  );
});
test("settlement sorts concurrently merged events before selecting its processed range", async () => {
  const s = state(),
    t = s.trees[0];
  const first = event(s, "read", "t", "n", "第一个内容版本");
  const second = event(s, "read", "t", "n", "第二个内容版本");
  const third = event(s, "read", "t", "n", "第三个内容版本");
  s.events = [first, third, second];
  assert.deepEqual(
    activeEvents(s, t).map((e) => e.seq),
    [1, 2, 3],
  );
  await featureAction({ state: s }, { type: "settle", tree_id: t.id }, {});
  assert.equal(t.settled_through, 3);
  assert.equal(s.memories.length, 3);
  const result = await featureAction(
    { state: s },
    { type: "settle", tree_id: t.id },
    {},
  );
  assert.match(result.message, /没有待整理/);
  assert.equal(s.memories.length, 3);
});
test("forgetting redacts evidence and invalidates derived strategies", () => {
  const s = state();
  const e = event(s, "feedback", "t", "n", "喜欢游戏例子");
  const m = { id: "m", content: e.content, event_ids: [e.id] };
  s.memories.push(m);
  s.strategies.push({ event_ids: [e.id] });
  s.trees[0].nodes[0].messages.push({
    role: "user",
    content: e.content,
    event_id: e.id,
  });
  forget(s, m);
  assert.equal(s.memories.length, 0);
  assert.equal(s.strategies.length, 0);
  assert(s.events[0].redacted);
  assert(s.trees[0].nodes[0].messages[0].excluded_from_context);
});
test("import rejects hostile IDs and unsupported formats without mutation", () => {
  const s = state(),
    before = JSON.stringify(s),
    bad = structuredClone(s);
  bad.trees[0].id = 'x" onclick="evil';
  assert.throws(() =>
    importArchive(s, { format: "zhizhi-personal-2", state: bad }, "merge"),
  );
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => validateArchive({ format: "future", state: s }));
});
test("merge remaps IDs while replacement validates content", () => {
  const s = state();
  const result = importArchive(
    s,
    { format: "zhizhi-personal-2", state: structuredClone(s) },
    "merge",
  );
  assert.equal(result.trees.length, 2);
  assert.notEqual(result.trees[0].id, result.trees[1].id);
  assert.notEqual(result.trees[0].nodes[0].id, result.trees[1].nodes[0].id);
});
test("archive merge preserves evidence, settlement watermarks and strategies for later forgetting", () => {
  const original = state(),
    tree = original.trees[0],
    node = tree.nodes[0];
  const feedback = event(
    original,
    "feedback",
    tree.id,
    node.id,
    "请使用速度例子",
  );
  node.messages.push({
    role: "user",
    content: feedback.content,
    event_id: feedback.id,
  });
  original.memories.push({
    id: "preference",
    content: feedback.content,
    tree_id: tree.id,
    node_id: node.id,
    event_ids: [feedback.id],
  });
  original.strategies.push({
    id: "strategy",
    tree_id: tree.id,
    content: feedback.content,
    reason: "用户明确要求",
    event_ids: [feedback.id],
  });
  tree.settled_through = feedback.seq;
  original.settlements.push({
    id: "settlement",
    tree_id: tree.id,
    through: feedback.seq,
  });
  const unread = event(original, "read", tree.id, node.id, "阅读了函数");
  const current = state();
  event(current, "read", "t", "n", "已有经历");
  importArchive(
    current,
    { format: "zhizhi-personal-2", state: original },
    "merge",
  );
  const imported = current.trees[1],
    memory = current.memories.find((m) => m.tree_id === imported.id);
  const evidence = current.events.find((e) => e.id === memory.event_ids[0]);
  assert(evidence);
  assert.notEqual(evidence.id, feedback.id);
  assert.equal(imported.nodes[0].messages[0].event_id, evidence.id);
  assert.equal(current.strategies[0].event_ids[0], evidence.id);
  assert.equal(imported.settled_through, evidence.seq);
  assert.equal(current.settlements[0].through, evidence.seq);
  assert.deepEqual(
    current.events
      .filter(
        (e) => e.tree_id === imported.id && e.seq > imported.settled_through,
      )
      .map((e) => e.content),
    [unread.content],
  );
  forget(current, memory);
  assert(evidence.redacted);
  assert.equal(current.strategies.length, 0);
  assert(imported.nodes[0].messages[0].excluded_from_context);
});
test("duplicate archive event sequences are rejected before changing the current library", () => {
  const current = state(),
    incoming = state();
  event(incoming, "read", "t", "n", "第一条");
  event(incoming, "read", "t", "n", "第二条");
  incoming.events[1].seq = incoming.events[0].seq;
  const before = JSON.stringify(current);
  assert.throws(
    () =>
      importArchive(
        current,
        { format: "zhizhi-personal-2", state: incoming },
        "merge",
      ),
    /序号重复/,
  );
  assert.equal(JSON.stringify(current), before);
});
test("reinforcement is voluntary and requires matching content version", async () => {
  const s = state(),
    t = s.trees[0],
    n = t.nodes[0];
  n.ready = true;
  n.content_version = 1;
  t.demo = true;
  await featureAction(
    { state: s },
    { type: "strengthen", tree_id: "t", node_id: "n" },
    {},
  );
  assert.equal(n.status, "unseen");
  let out = await featureAction(
    { state: s },
    {
      type: "strengthen_answer",
      tree_id: "t",
      node_id: "n",
      answer: "3乘2等于6",
    },
    {},
  );
  assert(out.assessment.passed);
  n.content_version++;
  await assert.rejects(
    featureAction(
      { state: s },
      { type: "strengthen_answer", tree_id: "t", node_id: "n", answer: "6" },
      {},
    ),
    /版本/,
  );
});
test("a later incorrect attempt retains earlier same-version reinforcement evidence through export and import", async () => {
  const s = state(),
    t = s.trees[0],
    n = t.nodes[0],
    doc = { state: s };
  n.ready = true;
  n.content_version = 1;
  t.demo = true;
  await featureAction(
    doc,
    { type: "strengthen", tree_id: "t", node_id: "n" },
    {},
  );
  await featureAction(
    doc,
    {
      type: "strengthen_answer",
      tree_id: "t",
      node_id: "n",
      answer: "3乘2等于6",
    },
    {},
  );
  const first = n.reinforcement.id;
  await featureAction(
    doc,
    { type: "strengthen", tree_id: "t", node_id: "n" },
    {},
  );
  assert.equal(n.reinforcement.id, first);
  assert.equal(n.reinforcement.attempts.length, 1);
  const result = await featureAction(
    doc,
    { type: "strengthen_answer", tree_id: "t", node_id: "n", answer: "不知道" },
    {},
  );
  assert.equal(result.assessment.passed, false);
  assert.equal(n.reinforcement.passed, true);
  const imported = validateArchive({ format: "zhizhi-personal-2", state: s });
  assert.equal(imported.trees[0].nodes[0].reinforcement.passed, true);
  assert.equal(imported.trees[0].nodes[0].reinforcement.attempts.length, 2);
});
test("a route proposal requires explicit acceptance and preserves old nodes", async () => {
  const s = state(),
    t = s.trees[0];
  const result = {
    description: "建议",
    chapters: [
      { title: "新方向", nodes: [{ title: "极限", description: "基础" }] },
    ],
  };
  await featureAction(
    { state: s },
    { type: "revise_route", tree_id: "t", reason: "补极限" },
    { ask: async () => result },
  );
  assert.equal(t.nodes.length, 1);
  await featureAction(
    { state: s },
    { type: "accept_route", tree_id: "t", proposal_id: t.route_proposal.id },
    {},
  );
  assert.equal(t.nodes.length, 2);
  assert(t.nodes.some((x) => x.id === "n"));
});
test("full teaching pipeline runs actual Pi tools and stage validation with a simulated transport", async () => {
  const { runStage } = await import("../src/core/runtime.ts");
  const s = state(),
    t = s.trees[0],
    n = t.nodes[0];
  let tools = 0;
  const ask = async (stage, context) => {
    const response = await model([])(stage, context);
    const { result, audit } = await runStage({
      stage,
      context,
      system: "固定测试规则，非真实模型",
      request: async (payload) => {
        if (!payload.messages.some((m) => m.role === "tool"))
          return {
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  tool_calls: [
                    {
                      id: "test-context",
                      type: "function",
                      function: {
                        name: "read_learning_context",
                        arguments: "{}",
                      },
                    },
                  ],
                },
              },
            ],
          };
        return {
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(response) },
            },
          ],
        };
      },
    });
    tools += audit.toolCalls;
    return result;
  };
  await generate(s, t, n, ask, async () => []);
  assert.equal(tools, 4);
  assert.equal(n.quality.decision, "pass");
  assert(n.ready);
});
