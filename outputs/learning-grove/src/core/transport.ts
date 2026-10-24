import { getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai";
import type {
  AssistantMessage,
  TranscriptContext,
  Usage,
  JsonObject,
} from "@earendil-works/pi-ai";
import { list, record, requireThat } from "../contracts.ts";
import type { ModelPayload } from "../contracts.ts";

export const PI_VERSION = "1.4.0";
export const zeroUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});
export function toPayload(
  context: TranscriptContext,
  model: string,
): ModelPayload {
  const system = getCurrentSystemPrompt(context.messages);
  const messages: ModelPayload["messages"] = system
    ? [{ role: "system", content: system }]
    : [];
  for (const message of context.messages) {
    if (message.role === "system") continue;
    if (message.role === "user")
      messages.push({
        role: "user",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((x) => x.type === "text")
                .map((x) => x.text)
                .join("\n"),
      });
    else if (message.role === "assistant") {
      const calls = message.content
        .filter((x) => x.type === "toolCall")
        .map((x) => ({
          id: x.id,
          type: "function",
          function: { name: x.name, arguments: JSON.stringify(x.arguments) },
        }));
      messages.push({
        role: "assistant",
        content:
          message.content
            .filter((x) => x.type === "text")
            .map((x) => x.text)
            .join("\n") || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      });
    } else if (message.role === "toolResult")
      messages.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content
          .filter((x) => x.type === "text")
          .map((x) => x.text)
          .join("\n"),
      });
    else throw new Error("不支持的消息类型");
  }
  const tools = getCurrentTools(context.messages).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  return {
    model,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
    max_tokens: 6000,
    thinking: { type: "disabled" },
  };
}
export function fromCompletion(data: unknown, model: string): AssistantMessage {
  const root = record(data),
    choice = record(list(root.choices)[0]),
    message = record(choice.message);
  requireThat(choice.finish_reason !== "length", "模型输出被截断，请重试");
  requireThat(
    choice.finish_reason === "stop" || choice.finish_reason === "tool_calls",
    "模型返回了不支持的结束状态",
  );
  const content: AssistantMessage["content"] = [];
  if (typeof message.content === "string" && message.content)
    content.push({ type: "text", text: message.content });
  const calls = list(message.tool_calls ?? []);
  requireThat(calls.length <= 3, "单轮最多三个只读工具调用");
  for (const raw of calls) {
    const call = record(raw),
      fn = record(call.function);
    requireThat(
      typeof call.id === "string" &&
        call.type === "function" &&
        typeof fn.name === "string" &&
        typeof fn.arguments === "string",
      "工具调用格式无效",
    );
    let args: unknown;
    try {
      args = JSON.parse(fn.arguments);
    } catch {
      throw new Error("工具参数不是有效 JSON");
    }
    content.push({
      type: "toolCall",
      id: call.id,
      name: fn.name,
      arguments: record(args) as JsonObject,
    });
  }
  requireThat(content.length, "模型返回内容为空");
  const usage = zeroUsage();
  if (root.usage) {
    const u = record(root.usage);
    usage.input = Number(u.prompt_tokens) || 0;
    usage.output = Number(u.completion_tokens) || 0;
    usage.totalTokens = Number(u.total_tokens) || usage.input + usage.output;
  }
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "deepseek",
    model,
    usage,
    stopReason: calls.length ? "toolUse" : "stop",
    timestamp: Date.now(),
  };
}
