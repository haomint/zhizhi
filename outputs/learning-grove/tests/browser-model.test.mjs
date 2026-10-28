import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  MODEL_ENDPOINT,
  createBrowserModel,
} from "../src/platform/browser-model.ts";
import { LearningService } from "../src/application/service.ts";
import { IndexedDBRepository } from "../src/platform/repository.ts";

const KEY = "sk-browser-test-key";
const ok = { choices: [{ finish_reason: "stop", message: { content: "OK" } }] };
const payload = {
  model: "deepseek-flash",
  messages: [{ role: "user", content: "你好" }],
  tools: [
    {
      type: "function",
      function: { name: "read_materials", description: "", parameters: {} },
    },
  ],
  tool_choice: "auto",
  stream: true,
  max_tokens: 1,
  thinking: { type: "enabled" },
};
function storage() {
  const items = new Map();
  return {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => items.set(k, v),
    removeItem: (k) => items.delete(k),
  };
}
function respond(status, body) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
  });
}
function model(fetcher, timeoutMs) {
  const store = storage(),
    calls = [];
  const browser = createBrowserModel(
    () => store,
    async (url, init) => {
      calls.push({ url, init });
      return fetcher(init);
    },
    timeoutMs,
  );
  return { browser, store, calls };
}

test("browser model posts the checked payload to the configured endpoint", async () => {
  const m = model(() => respond(200, ok));
  await m.browser.configure("  " + KEY + "  ");
  assert.deepEqual(await m.browser.complete(payload), ok);
  const [{ url, init }] = m.calls;
  assert.equal(url, MODEL_ENDPOINT);
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer " + KEY);
  const sent = JSON.parse(init.body);
  assert.equal(sent.stream, false);
  assert.equal(sent.max_tokens, 6000);
  assert.deepEqual(sent.thinking, { type: "disabled" });
  assert.deepEqual(sent.messages, payload.messages);
});

test("browser model rejects payloads the Android plugin would reject", async () => {
  const m = model(() => respond(200, ok));
  await m.browser.configure(KEY);
  const bad = [
    { ...payload, model: "bad model" },
    { ...payload, messages: [] },
    {
      ...payload,
      tools: [{ type: "function", function: { name: "write_file" } }],
    },
  ];
  for (const p of bad)
    await assert.rejects(m.browser.complete(p), /模型消息或工具定义格式无效/);
  assert.equal(m.calls.length, 0);
});

test("HTTP failures map to the same messages as the Android plugin", async () => {
  const expected = {
    401: "API Key 无效（401）。",
    402: "API 账户余额不足（402）。",
    404: "模型或接口不存在（404），请检查模型名称。",
    429: "请求限流（429），请稍后重试。",
    500: "DeepSeek 请求失败（HTTP 500）。",
  };
  for (const [code, message] of Object.entries(expected)) {
    const m = model(() => respond(Number(code), { error: "x" }));
    await m.browser.configure(KEY);
    await assert.rejects(m.browser.test("deepseek-flash"), { message });
  }
  const offline = model(() => {
    throw new TypeError("Failed to fetch");
  });
  await offline.browser.configure(KEY);
  await assert.rejects(offline.browser.complete(payload), /请检查网络后重试/);
  const garbage = model(() => respond(200, "<html>"));
  await garbage.browser.configure(KEY);
  await assert.rejects(garbage.browser.complete(payload), /返回格式异常/);
});

test("cancel and timeout stop the request with distinct messages", async () => {
  const hang = (init) =>
    new Promise((_, reject) =>
      init.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      ),
    );
  const m = model(hang);
  await m.browser.configure(KEY);
  const controller = new AbortController(),
    pending = m.browser.complete(payload, controller.signal);
  controller.abort();
  await assert.rejects(pending, { message: "已取消" });
  const early = new AbortController();
  early.abort();
  await assert.rejects(m.browser.complete(payload, early.signal), {
    message: "已取消",
  });
  const slow = model(hang, 5);
  await slow.browser.configure(KEY);
  await assert.rejects(slow.browser.complete(payload), /网络请求超时/);
});

test("missing or invalid keys never reach the network", async () => {
  const m = model(() => respond(200, ok));
  assert.deepEqual(await m.browser.status(), { configured: false });
  await assert.rejects(m.browser.complete(payload), /请先在个人中心填写/);
  await assert.rejects(m.browser.configure("含中文的key"), /有效 API Key/);
  await m.browser.configure(KEY);
  assert.deepEqual(await m.browser.status(), { configured: true });
  await m.browser.clearKey();
  assert.deepEqual(await m.browser.status(), { configured: false });
  assert.equal(m.calls.length, 0);
});

test("web settings accept a key, test it, and keep it out of the archive", async () => {
  const m = model(() => respond(200, ok));
  const service = new LearningService(
    new IndexedDBRepository(new IDBFactory()),
    {
      native: false,
      ...m.browser,
      search: async () => [],
      loadRule: async () => "",
      loadDemo: async () => ({}),
      exportArchive: async () => {},
    },
  );
  let { settings } = await service.read();
  assert.equal(settings.can_remember, true);
  assert.equal(settings.has_key, false);
  assert.equal(settings.enabled, false);
  assert.match(settings.notice, /明文保存在本浏览器/);
  await service.dispatch({
    type: "configure_test",
    key: KEY,
    model: "deepseek-flash",
    enabled: true,
  });
  ({ settings } = await service.read());
  assert.equal(settings.has_key, true);
  assert.equal(settings.enabled, true);
  assert.equal(settings.test_status, "passed");
  assert(!JSON.stringify(await service.export()).includes(KEY));
  await service.dispatch({ type: "configure", clear_key: true, enabled: true });
  ({ settings } = await service.read());
  assert.equal(settings.has_key, false);
  assert.equal(settings.enabled, false);
});

test("a failed connection test keeps the model name and records the failure", async () => {
  const m = model(() => respond(401, { error: "bad key" }));
  const service = new LearningService(
    new IndexedDBRepository(new IDBFactory()),
    {
      native: false,
      ...m.browser,
      search: async () => [],
      loadRule: async () => "",
      loadDemo: async () => ({}),
      exportArchive: async () => {},
    },
  );
  await assert.rejects(
    service.dispatch({
      type: "configure_test",
      key: "sk-wrong",
      model: "deepseek-chat",
      enabled: true,
    }),
    { message: "API Key 无效（401）。" },
  );
  const { settings } = await service.read();
  assert.equal(settings.model, "deepseek-chat");
  assert.equal(settings.test_status, "failed");
});
