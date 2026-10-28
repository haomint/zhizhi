import providers from "../../config/providers.json" with { type: "json" };
import { record, requireThat } from "../contracts.ts";
import type { ModelPayload } from "../contracts.ts";

// Browser counterpart of the Android plugin's model calls: same validation and
// error wording, key kept in browser storage (never in the learning archive).
export const MODEL_ENDPOINT =
  providers.model.baseUrl.replace(/\/$/, "") + "/chat/completions";
const KEY = "zhizhi-model-key";
const TOOLS = [
  "read_learning_context",
  "read_learning_memory",
  "read_materials",
];
const NETWORK = "网络或返回格式异常，请检查网络后重试。";

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function statusMessage(code: number): string {
  if (code === 401) return "API Key 无效（401）。";
  if (code === 402) return "API 账户余额不足（402）。";
  if (code === 404) return "模型或接口不存在（404），请检查模型名称。";
  if (code === 429) return "请求限流（429），请稍后重试。";
  return "DeepSeek 请求失败（HTTP " + code + "）。";
}

export function checkPayload(payload: ModelPayload): ModelPayload {
  const tools = payload.tools.map((tool) => record(record(tool).function).name);
  requireThat(
    JSON.stringify(payload).length <= 120000 &&
      /^[a-zA-Z0-9_.:-]{1,100}$/.test(payload.model) &&
      payload.messages.length >= 1 &&
      payload.messages.length <= 32 &&
      tools.length <= 3 &&
      tools.every((name) => TOOLS.includes(String(name))),
    "模型消息或工具定义格式无效。",
  );
  return {
    ...payload,
    stream: false,
    max_tokens: 6000,
    thinking: { type: "disabled" },
  };
}

export function createBrowserModel(
  storage: () => KeyStorage,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 65000,
) {
  const key = () => storage().getItem(KEY) ?? "";
  async function post(body: unknown, signal?: AbortSignal): Promise<unknown> {
    const token = key();
    requireThat(token, "请先在个人中心填写自己的 DeepSeek API Key。");
    if (signal?.aborted) throw Error("已取消");
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    let text: string;
    try {
      const response = await fetcher(MODEL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: "error",
      });
      requireThat(response.ok, statusMessage(response.status));
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw Error("已取消");
      if (timedOut) throw Error("网络请求超时，已保存结果仍保留，请重试。");
      if (error instanceof Error && /（(HTTP )?\d+）/.test(error.message))
        throw error;
      throw Error(NETWORK);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
    requireThat(text.length <= 1000000, NETWORK);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw Error(NETWORK);
    }
    requireThat(Array.isArray(record(data).choices), NETWORK);
    return data;
  }
  return {
    status: async () => ({ configured: Boolean(key()) }),
    configure: async (value: string) => {
      const trimmed = value.trim();
      requireThat(/^[!-~]{1,1000}$/.test(trimmed), "请填写有效 API Key");
      storage().setItem(KEY, trimmed);
    },
    clearKey: async () => storage().removeItem(KEY),
    complete: async (payload: ModelPayload, signal?: AbortSignal) =>
      post(checkPayload(payload), signal),
    test: async (model: string) => {
      requireThat(/^[a-zA-Z0-9_.:-]{1,100}$/.test(model), "请填写有效模型名称");
      await post({
        model,
        stream: false,
        max_tokens: 16,
        messages: [
          { role: "system", content: "只回复OK" },
          { role: "user", content: "连接测试" },
        ],
      });
    },
  };
}
