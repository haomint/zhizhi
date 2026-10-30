import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { LearningService } from "../src/application/service.ts";
import { IndexedDBRepository } from "../src/platform/repository.ts";
import { material } from "../src/core/domain.ts";
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
function environment() {
  const repository = new IndexedDBRepository(new IDBFactory()),
    control = { failWrite: false, failModel: false, gate: null, started: null };
  const storage = {
    read: () => repository.read(),
    legacyCard: () => repository.legacyCard(),
    write: (doc) => {
      if (control.failWrite) throw Error("模拟磁盘写入失败");
      return repository.write(doc);
    },
  };
  const platform = {
    native: true,
    status: async () => ({ configured: true }),
    configure: async () => {},
    clearKey: async () => {},
    test: async () => {},
    loadRule: async () => "",
    loadDemo: async () =>
      JSON.parse(
        fs.readFileSync(new URL("../public/demo.json", import.meta.url)),
      ),
    exportArchive: async () => {},
    search: async () => [
      material({ title: "测试教材", text: "每个允许的输入有唯一确定的输出。" }),
    ],
    complete: async (payload, signal) => {
      control.started?.();
      if (control.gate) await control.gate;
      if (signal?.aborted) throw Error("已取消");
      if (control.failModel) throw Error("模拟断网");
      const stage = payload.messages
          .find((m) => m.role === "user")
          .content.match(/阶段：([^。]+)/)[1],
        tools = payload.messages.filter((m) => m.role === "tool");
      const call = (name) => ({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              tool_calls: [
                {
                  id: "tool-" + tools.length,
                  type: "function",
                  function: { name, arguments: "{}" },
                },
              ],
            },
          },
        ],
      });
      if (!tools.length) return call("read_learning_context");
      const context = JSON.parse(tools[0].content);
      if (stage === "knowledge" && tools.length === 1)
        return call("read_materials");
      const results = {
        intake: {
          title: "函数",
          goal: "理解函数",
          questions: [],
          preferences: {},
        },
        roadmap: {
          description: "从基础起步",
          chapters: [
            {
              title: "基础",
              nodes: [
                { title: "函数", description: "理解定义" },
                { title: "线性函数", description: "建立联系" },
              ],
            },
          ],
        },
        knowledge: {
          decision: "ready",
          claims: [
            {
              id: "claim",
              text: "每个输入有唯一输出",
              status: "supported",
              material_ids:
                tools.length > 1
                  ? [JSON.parse(tools[1].content).materials[0].id]
                  : [],
            },
          ],
          gaps: [],
        },
        "page-plan": {
          node_id: context.node_id,
          pages: [
            { purpose: "定义", claim_ids: ["claim"] },
            { purpose: "例子", claim_ids: ["claim"] },
          ],
          uncovered_claim_ids: [],
        },
        cards: {
          cards: [
            {
              node_id: context.nodes?.[0].id,
              kind: "定义诠释",
              title: "函数",
              text:
                "每个允许输入有唯一输出" +
                "。函数把定义域里的每个输入对应到唯一的输出".repeat(8),
            },
            {
              node_id: context.nodes?.[0].id,
              kind: "例子",
              title: "数字例子",
              text:
                "f(3)=2×3=6" + "。规则 f(x)=2x 把输入乘以 2 得到输出".repeat(8),
            },
          ],
        },
        quality: { decision: "pass", checks, issues: [] },
        tutor: { answer: "针对当前卡片的解释", memories: [] },
        settlement: {
          event_range: context.event_range,
          observations: [],
          strategy_proposals: [],
        },
      };
      return {
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(results[stage]) },
          },
        ],
      };
    },
  };
  return {
    service: new LearningService(storage, platform),
    repository,
    control,
    platform,
    storage,
  };
}
async function learning(e) {
  await e.service.ready;
  await e.service.dispatch({ type: "draft_message", message: "学习函数" });
  await e.service.dispatch({ type: "summarize" });
  const r = await e.service.dispatch({
      type: "create_tree",
      title: "函数",
      goal: "理解定义",
    }),
    tree_id = r.tree_id,
    node_id = r.state.trees[0].nodes[0].id;
  await e.service.dispatch({
    type: "material_add",
    tree_id,
    title: "教材",
    text: "每个输入有唯一输出",
  });
  const out = await e.service.dispatch({ type: "refill", tree_id, node_id });
  return { tree_id, node_id, card_id: out.state.trees[0].nodes[0].cards[0].id };
}
function gate(e) {
  let release;
  e.control.gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (e.control.started = resolve));
  return {
    started,
    release: () => {
      release();
      e.control.gate = null;
      e.control.started = null;
    },
  };
}
test("typed service runs real Pi, preserves reading during generation and rejects stale results", async () => {
  const e = environment(),
    ids = await learning(e);
  assert.equal(
    (await e.service.read()).state.trees[0].nodes[0].quality.decision,
    "pass",
  );
  let g = gate(e);
  const chat = e.service.dispatch({ type: "chat", ...ids, message: "解释" });
  await g.started;
  await e.service.dispatch({ type: "set_page", ...ids, page: 1 });
  g.release();
  await chat;
  assert.equal((await e.service.read()).state.trees[0].nodes[0].page, 1);
  g = gate(e);
  const stale = assert.rejects(
    e.service.dispatch({ type: "chat", ...ids, message: "旧目标问题" }),
    /目标或资料已变化/,
  );
  await g.started;
  await e.service.dispatch({
    type: "preferences",
    tree_id: ids.tree_id,
    goal: "新目标",
    preferences: {},
  });
  g.release();
  await stale;
  assert(
    !(await e.service.read()).state.trees[0].nodes[0].messages.some(
      (m) => m.content === "旧目标问题",
    ),
  );
});
test("active and queued cancellation preserve committed messages", async () => {
  const e = environment(),
    ids = await learning(e),
    g = gate(e);
  const first = e.service.dispatch({
      type: "chat",
      ...ids,
      message: "取消当前",
    }),
    firstRejected = assert.rejects(first, /取消/);
  await g.started;
  const second = e.service.dispatch({
      type: "chat",
      ...ids,
      message: "取消排队",
    }),
    secondRejected = assert.rejects(second, /取消排队/);
  let queued;
  for (let i = 0; i < 100 && !queued; i++) {
    queued = (await e.service.read()).state.tasks.find(
      (t) => t.status === "queued",
    );
    await new Promise(setImmediate);
  }
  assert(queued);
  await e.service.dispatch({ type: "cancel_task", id: queued.id });
  await e.service.dispatch({ type: "cancel_task" });
  g.release();
  await firstRejected;
  await secondRejected;
  const s = (await e.service.read()).state;
  assert.equal(s.trees[0].nodes[0].messages.length, 0);
  assert(
    s.tasks
      .filter((t) => t.type === "chat")
      .every((t) => t.status === "cancelled"),
  );
});
test("transport errors and failed IndexedDB writes do not replace committed learning content", async () => {
  const e = environment(),
    ids = await learning(e),
    before = JSON.stringify((await e.service.read()).state.trees);
  e.control.failModel = true;
  await assert.rejects(
    e.service.dispatch({ type: "chat", ...ids, message: "断网问题" }),
    /模拟断网/,
  );
  e.control.failModel = false;
  assert.equal(JSON.stringify((await e.service.read()).state.trees), before);
  e.control.failWrite = true;
  await assert.rejects(
    e.service.dispatch({ type: "draft_message", message: "失败写入" }),
    /磁盘/,
  );
  e.control.failWrite = false;
  assert.equal(JSON.stringify((await e.service.read()).state.trees), before);
});
test("settlement deduplicates; archives merge and restore; interrupted tasks pause on reopen", async () => {
  const e = environment(),
    ids = await learning(e);
  await e.service.dispatch({ type: "set_page", ...ids, page: 1 });
  await e.service.dispatch({ type: "advance", ...ids });
  await e.service.dispatch({ type: "settle", tree_id: ids.tree_id });
  const count = (await e.service.read()).state.memories.length;
  await e.service.dispatch({ type: "settle", tree_id: ids.tree_id });
  assert.equal((await e.service.read()).state.memories.length, count);
  const archive = await e.service.export();
  assert.equal(archive.format, "zhizhi-personal-2");
  assert(!("settings" in archive));
  await e.service.dispatch({ type: "import_archive", archive, mode: "merge" });
  assert.equal((await e.service.read()).state.trees.length, 2);
  await e.service.dispatch({ type: "restore_import" });
  assert.equal((await e.service.read()).state.trees.length, 1);
  const old = await e.repository.read();
  old.state.tasks.push({
    id: "interrupted",
    type: "refill",
    tree_id: ids.tree_id,
    node_id: ids.node_id,
    status: "running",
    stage: "旧任务",
    payload: { type: "refill", ...ids },
    at: "",
  });
  await e.repository.write(old);
  const reopened = new LearningService(e.storage, e.platform);
  assert.equal((await reopened.read()).state.tasks.at(-1).status, "paused");
});
test("old IndexedDB document retains IDs, cards, feedback and reading position after migration", async () => {
  const e = environment(),
    ids = await learning(e);
  await e.service.dispatch({ type: "set_page", ...ids, page: 1 });
  await e.service.dispatch({
    type: "feedback",
    ...ids,
    message: "保留计算过程",
  });
  const old = await e.repository.read();
  delete old.state.schema_version;
  delete old.state.semantic_revision;
  await e.repository.write(old);
  const migrated = new LearningService(e.storage, e.platform),
    next = await migrated.read();
  assert.equal(next.state.schema_version, 2);
  assert.equal(next.state.trees[0].id, ids.tree_id);
  assert.equal(next.state.trees[0].nodes[0].page, 1);
  assert(next.state.memories.some((m) => m.content === "保留计算过程"));
});
