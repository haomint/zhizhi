import { Agent } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

export const PI_VERSION = '1.4.0';
const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });

// A transport adapter, not an implementation of the Agent loop. Pi owns tool
// execution, transcript ordering, and follow-up requests.
export function toPayload(context, model) {
  const system = getCurrentSystemPrompt(context.messages);
  const messages = system ? [{ role: 'system', content: system }] : [];
  for (const m of context.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') messages.push({ role: 'user', content: typeof m.content === 'string' ? m.content : m.content.filter(x => x.type === 'text').map(x => x.text).join('\n') });
    else if (m.role === 'assistant') {
      const calls = m.content.filter(x => x.type === 'toolCall').map(x => ({ id: x.id, type: 'function', function: { name: x.name, arguments: JSON.stringify(x.arguments) } }));
      messages.push({ role: 'assistant', content: m.content.filter(x => x.type === 'text').map(x => x.text).join('\n') || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (m.role === 'toolResult') {
      messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content.filter(x => x.type === 'text').map(x => x.text).join('\n') });
    } else throw new Error('不支持的消息类型');
  }
  const tools = getCurrentTools(context.messages).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  return { model, messages, tools, tool_choice: 'auto', stream: false, max_tokens: 6000, thinking: { type: 'disabled' } };
}

export function fromCompletion(data, model) {
  const choice = data?.choices?.[0];
  if (!choice?.message) throw new Error('模型返回缺少 message');
  if (choice.finish_reason === 'length') throw new Error('模型输出被截断，请重试');
  if (!['stop', 'tool_calls'].includes(choice.finish_reason)) throw new Error('模型返回了不支持的结束状态');
  const content = [];
  if (typeof choice.message.content === 'string' && choice.message.content) content.push({ type: 'text', text: choice.message.content });
  const calls = choice.message.tool_calls || [];
  if (!Array.isArray(calls) || calls.length > 3) throw new Error('单轮最多三个只读工具调用');
  for (const t of calls) {
    if (!t.id || t.type !== 'function' || !t.function?.name) throw new Error('工具调用格式无效');
    let args;
    try { args = JSON.parse(t.function.arguments); } catch { throw new Error('工具参数不是有效 JSON'); }
    if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('工具参数必须是对象');
    content.push({ type: 'toolCall', id: t.id, name: t.function.name, arguments: args });
  }
  if (!content.length) throw new Error('模型返回内容为空');
  const usage = zeroUsage();
  if (data.usage) { usage.input = data.usage.prompt_tokens || 0; usage.output = data.usage.completion_tokens || 0; usage.totalTokens = data.usage.total_tokens || usage.input + usage.output; }
  return { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model, usage, stopReason: calls.length ? 'toolUse' : 'stop', timestamp: Date.now() };
}

