import { Capacitor, registerPlugin } from '@capacitor/core';
import { runStage } from '../vendor/runtime.mjs';
import type { Completion, RuntimeResult } from '../vendor/runtime.mjs';

export type Scenario = 'success' | 'failure' | 'slow';
interface NativeProbe {
  echo(input: { value: string }): Promise<{ value: string; sdk: number; webview: string }>;
}
const native = registerPlugin<NativeProbe>('Probe');
export async function nativeStatus(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return '浏览器模式：尚未执行 Android 原生桥接';
  const value = 'zhizhi-react-typescript';
  const result = await native.echo({ value });
  if (result.value !== value) throw new Error('原生桥接回传不一致');
  return `原生桥接通过 · Android API ${result.sdk} · WebView ${result.webview}`;
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('已取消')); return; }
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new Error('已取消')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
export async function runProbe(scenario: Scenario, preference: string, signal: AbortSignal, onEvent: (type: string) => void): Promise<RuntimeResult> {
  let count = 0;
  return runStage({
    stage: 'intake',
    context: { messages: [{ role: 'user', content: '学习函数，' + preference }] },
    system: '兼容性验证。使用测试模型响应；必须读取任务上下文。',
    signal, timeoutMs: 15000, onEvent,
    request: async (_payload: unknown, options?: { signal?: AbortSignal }): Promise<Completion> => {
      await delay(scenario === 'slow' ? 3000 : 40, options?.signal);
      if (scenario === 'failure') throw new Error('测试网络异常');
      count++;
      if (count === 1) return { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'probe-context', type: 'function', function: { name: 'read_learning_context', arguments: '{}' } }] } }] };
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: '函数', goal: '理解输入与唯一输出的关系。偏好：' + preference, questions: [] }) } }] };
    },
  });
}
