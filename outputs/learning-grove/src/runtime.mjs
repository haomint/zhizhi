import { Agent } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { toPayload, fromCompletion } from './transport.mjs';
import { validateResult } from './validate.mjs';

// One scoped Agent per task. Tools are read-only; the business layer commits once.
export async function runStage({ stage, context, system, request, model = 'deepseek-flash', signal, timeoutMs = 150000, onEvent = () => {} }) {
  const snapshot = structuredClone(context);
  const trace = []; let requests = 0, calls = 0, stopped = false;
  const emit = type => { trace.push(type); onEvent(type); };
  const values = {
    read_learning_context: Object.fromEntries(Object.entries(snapshot).filter(([k]) => !['memories', 'materials', 'related_learning_records'].includes(k))),
    read_learning_memory: { memories: snapshot.memories || [], related_learning_records: snapshot.related_learning_records || [], evidence_note: '阅读进度不代表掌握' },
    read_materials: { materials: snapshot.materials || [], status: snapshot.materials?.length ? 'provided' : 'unavailable', external_search: 'not_configured' },
  };
  const tools = Object.entries(values).map(([name, data]) => ({
    name, label: name, description: { read_learning_context: '读取本次任务、目标、当前卡片或节点。', read_learning_memory: '读取此次任务已筛选的学习经历；未知不推测。', read_materials: '读取本次实际提供的材料，空列表表示没有材料，不代表已联网。' }[name],
    parameters: Type.Object({}, { additionalProperties: false }), executionMode: 'sequential',
    execute: async (_id, _args, toolSignal) => {
      if (stopped || toolSignal?.aborted) throw Error('任务已停止');
      if (++calls > 6) throw Error('达到工具调用上限');
      emit(name);
      return { content: [{ type: 'text', text: JSON.stringify(data) }], details: { source: 'task-snapshot' } };
    },
  }));
  const piModel = { id: model, name: model, api: 'openai-completions', provider: 'deepseek', baseUrl: 'https://api.deepseek.com', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 6000 };
  const streamFn = (_m, ctx, options = {}) => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(async () => {
      try {
        if (stopped || options.signal?.aborted) throw Error('任务已停止');
        if (++requests > 4) throw Error('达到模型请求上限');
        emit('request');
        // Force task context once, then let Pi manage optional read tools.
        const payload = toPayload(ctx, model);
        if (requests === 1) payload.tool_choice = { type: 'function', function: { name: 'read_learning_context' } };
        const message = fromCompletion(await request(payload, { signal: options.signal }), model);
        if (stopped || options.signal?.aborted) throw Error('任务已停止');
        stream.push({ type: 'start', partial: message });
        stream.push({ type: 'done', reason: message.stopReason, message });
      } catch (e) {
        const message = { role: 'assistant', content: [], api: piModel.api, provider: piModel.provider, model, stopReason: stopped ? 'aborted' : 'error', errorMessage: e.message, timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
        stream.push({ type: 'error', reason: message.stopReason, error: message });
      }
    });
    return stream;
  };
  const agent = new Agent({ initialState: { model: piModel, systemPrompt: system, tools }, streamFn, toolExecution: 'sequential', beforeToolCall: ({ toolCall }) => {
    if (!(toolCall.name in values) || calls >= 6) return { block: true, reason: '工具超出任务范围或预算', terminate: true };
  } });
  const cancel = () => { stopped = true; agent.abort(); };
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    if (signal?.aborted) throw Error('已取消');
    await agent.prompt(`阶段：${stage}。先调用 read_learning_context；如需个人经历或材料，调用对应只读工具。按阶段契约返回 JSON，不声称保存成功。`);
    if (stopped || signal?.aborted) throw Error('已取消或超时');
    const last = agent.state.messages.filter(m => m.role === 'assistant').at(-1);
    if (!last || ['error', 'aborted'].includes(last.stopReason)) throw Error(last?.errorMessage || '模型未完成');
    if (!trace.includes('read_learning_context')) throw Error('模型未读取任务上下文');
    const raw = last.content.filter(c => c.type === 'text').map(c => c.text).join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let result; try { result = JSON.parse(raw); } catch { throw Error('模型结果不是完整 JSON'); }
    validateResult(stage, result, snapshot);
    return { result, audit: { stage, requests, toolCalls: calls, trace, piVersion: '1.4.0' } };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
