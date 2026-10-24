import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentTool, StreamFn } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { errorMessage } from "../contracts.ts";
import type {
  ModelRequest,
  RuntimeAudit,
  Stage,
  StageContext,
  StageResults,
} from "../contracts.ts";
import { toPayload, fromCompletion, zeroUsage } from "./transport.ts";
import { validateResult } from "./validate.ts";

export async function runStage<S extends Stage>({
  stage,
  context,
  system,
  request,
  model = "deepseek-flash",
  signal,
  timeoutMs = 150000,
  onEvent = () => {},
}: {
  stage: S;
  context: StageContext;
  system: string;
  request: ModelRequest;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (type: string) => void;
}): Promise<{ result: StageResults[S]; audit: RuntimeAudit }> {
  const snapshot = structuredClone(context),
    trace: string[] = [];
  let requests = 0,
    calls = 0,
    stopped = false;
  const emit = (type: string) => {
    trace.push(type);
    onEvent(type);
  };
  const values: Record<string, unknown> = {
    read_learning_context: Object.fromEntries(
      Object.entries(snapshot).filter(
        ([k]) =>
          !["memories", "materials", "related_learning_records"].includes(k),
      ),
    ),
    read_learning_memory: {
      memories: snapshot.memories || [],
      related_learning_records: snapshot.related_learning_records || [],
      evidence_note: "阅读进度不代表掌握",
    },
    read_materials: {
      materials: snapshot.materials || [],
      status: snapshot.materials?.length ? "provided" : "unavailable",
      external_search: snapshot.retrieval_status || "program-managed-wikipedia",
    },
  };
  const descriptions: Record<string, string> = {
    read_learning_context: "读取本次任务、目标、当前卡片或节点。",
    read_learning_memory: "读取此次任务已筛选的学习经历；未知不推测。",
    read_materials:
      "读取本次实际提供的材料，空列表表示没有材料，不代表已联网。",
  };
  const tools: AgentTool[] = Object.entries(values).map(([name, data]) => ({
    name,
    label: name,
    description: descriptions[name],
    parameters: Type.Object({}, { additionalProperties: false }),
    executionMode: "sequential",
    execute: async (_id, _args, toolSignal) => {
      if (stopped || toolSignal?.aborted) throw Error("任务已停止");
      if (++calls > 6) throw Error("达到工具调用上限");
      emit(name);
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        details: { source: "task-snapshot" },
      };
    },
  }));
  const piModel: Model<"openai-completions"> = {
    id: model,
    name: model,
    api: "openai-completions",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32000,
    maxTokens: 6000,
  };
  const streamFn: StreamFn = (_model, ctx, options = {}) => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(async () => {
      try {
        if (stopped || options.signal?.aborted) throw Error("任务已停止");
        if (++requests > 4) throw Error("达到模型请求上限");
        emit("request");
        const payload = toPayload(ctx, model);
        if (requests === 1)
          payload.tool_choice = {
            type: "function",
            function: { name: "read_learning_context" },
          };
        const message = fromCompletion(
          await request(payload, { signal: options.signal }),
          model,
        );
        if (stopped || options.signal?.aborted) throw Error("任务已停止");
        stream.push({ type: "start", partial: message });
        stream.push({
          type: "done",
          reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
          message,
        });
      } catch (error) {
        const message: AssistantMessage = {
          role: "assistant",
          content: [],
          api: piModel.api,
          provider: piModel.provider,
          model,
          stopReason: stopped ? "aborted" : "error",
          errorMessage: errorMessage(error),
          timestamp: Date.now(),
          usage: zeroUsage(),
        };
        stream.push({
          type: "error",
          reason: stopped ? "aborted" : "error",
          error: message,
        });
      }
    });
    return stream;
  };
  const agent = new Agent({
    initialState: { model: piModel, systemPrompt: system, tools },
    streamFn,
    toolExecution: "sequential",
    beforeToolCall: async ({ toolCall }) => {
      if (!(toolCall.name in values) || calls >= 6)
        return {
          block: true,
          reason: "工具超出任务范围或预算",
          terminate: true,
        };
      return undefined;
    },
  });
  const cancel = () => {
    stopped = true;
    agent.abort();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    if (signal?.aborted) throw Error("已取消");
    await agent.prompt(
      `阶段：${stage}。先调用 read_learning_context；如需个人经历或材料，调用对应只读工具。按阶段契约返回 JSON，不声称保存成功。`,
    );
    if (stopped || signal?.aborted) throw Error("已取消或超时");
    const last = agent.state.messages
      .filter((m): m is AssistantMessage => m.role === "assistant")
      .at(-1);
    if (!last || ["error", "aborted"].includes(last.stopReason))
      throw Error(last?.errorMessage || "模型未完成");
    if (!trace.includes("read_learning_context"))
      throw Error("模型未读取任务上下文");
    const raw = last.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*|\s*```$/g, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw Error("模型结果不是完整 JSON");
    }
    return {
      result: validateResult(stage, parsed, snapshot),
      audit: { stage, requests, toolCalls: calls, trace, piVersion: "1.4.0" },
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
