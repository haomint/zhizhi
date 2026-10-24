import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { load, save } from './store';
import type { ReadingState } from './store';
import { nativeStatus, runProbe } from './probe';
import type { Scenario } from './probe';

const cards = [
  { title: '什么是函数', text: '对于允许范围内的每个输入，按照某个规则，得到唯一确定的输出。这里用固定内容检查手机阅读交互，不作为教材准确性的专项验证。' },
  { title: '用一个完整例子理解', text: '规则 f(x) = 2x。当输入 x = 3 时，输出 f(3) = 2 × 3 = 6。输入变为 4，输出为 8。每个输入对应一个确定的输出。' },
  { title: '继续之前的阅读', text: '翻页位置和讲解偏好保存在独立的本地资料库中。刷新或重新打开后，检查这些记录是否仍然存在。此验证应用不读取正式知枝的学习档案。' },
];
export default function App() {
  const [state, setState] = useState<ReadingState | null>(null);
  const [preference, setPreference] = useState('');
  const [status, setStatus] = useState('正在读取本地记录');
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [native, setNative] = useState('尚未检查');
  const current = useRef<ReadingState | null>(null);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const busyRef = useRef(false);

  useEffect(() => {
    alive.current = true;
    let valid = true;
    void load().then(value => {
      if (!valid) return;
      current.current = value; setState(value); setPreference(value.preference); setStatus('已就绪');
    }).catch(error => { if (valid) setStatus(String(error)); });
    return () => { valid = false; alive.current = false; controller.current?.abort(); };
  }, []);

  function update(change: (value: ReadingState) => ReadingState): Promise<void> {
    const operation = writes.current.then(async () => {
      if (!current.current) throw new Error('尚未加载完成');
      const next = change(current.current);
      await save(next);
      current.current = next;
      if (alive.current) setState(next);
    });
    writes.current = operation.catch(() => {});
    return operation;
  }
  function report(error: unknown) { if (alive.current) setStatus(error instanceof Error ? error.message : String(error)); }
  async function run(scenario: Scenario) {
    if (busyRef.current || !current.current) return;
    busyRef.current = true; setBusy(true); setEvents([]); setStatus('正在执行 Pi 工具循环');
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await runProbe(scenario, current.current.preference, abort.signal, event => {
        if (alive.current) setEvents(previous => [...previous, event]);
      });
      if (abort.signal.aborted || !alive.current) return;
      await update(previous => ({ ...previous, successfulRuns: previous.successfulRuns + 1, lastResult: JSON.stringify(result) }));
      if (alive.current) setStatus('Pi 验证通过，结果已保存');
    } catch (error) { report(abort.signal.aborted ? new Error('已取消，原记录保留') : error); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); controller.current = null; }
  }
  const card = cards[state?.page ?? 0]!;
  return <main>
    <header><span className="brand">知枝 <small>实验室</small></span><span className="badge">{Capacitor.getPlatform()}</span></header>
    <p className="eyebrow">REACT + TYPESCRIPT · MOBILE PROBE</p>
    <h1>一条学习流程，<br />在手机继续。</h1>
    <p className="intro">独立兼容性样例 · Pi 使用固定测试响应 · 不调用真实模型，不使用 API Key。</p>
    <section className="reading" aria-label="学习卡片">
      <div className="card-top"><span>函数 · 阅读验证</span><span data-testid="page">{(state?.page ?? 0) + 1} / 3</span></div>
      <h2>{card.title}</h2><p>{card.text}</p>
      <nav><button disabled={!state || state.page === 0} onClick={() => { void update(v => ({ ...v, page: Math.max(0, v.page - 1) })).catch(report); }}>上一页</button>
      <button disabled={!state || state.page === 2} onClick={() => { void update(v => ({ ...v, page: Math.min(2, v.page + 1) })).catch(report); }}>下一页 <span aria-hidden="true">↗</span></button></nav>
    </section>
    <section className="panel"><h2>保存讲解偏好</h2><label htmlFor="preference">下次讲解时希望怎样表达</label>
      <input id="preference" maxLength={200} value={preference} onChange={event => setPreference(event.target.value)} placeholder="例如：先讲定义，再给数字例子" />
      <button disabled={!state} onClick={() => { void update(v => ({ ...v, preference })).then(() => { if (alive.current) setStatus('偏好已保存'); }).catch(report); }}>保存偏好</button>
      <p className="muted" data-testid="saved-preference">已保存：{state?.preference || '暂无'}</p>
    </section>
    <section className="panel"><h2>运行与恢复</h2><p className="muted">真实 Pi 运行模块；模型响应为测试数据。失败与取消不增加成功次数。</p>
      <div className="actions"><button className="primary" disabled={!state || busy} onClick={() => { void run('success'); }}>运行 Pi 验证</button>
      <button disabled={!state || busy} onClick={() => { void run('failure'); }}>模拟网络失败</button>
      <button disabled={!state || busy} onClick={() => { void run('slow'); }}>启动慢任务</button>
      <button disabled={!busy} onClick={() => controller.current?.abort()}>取消任务</button></div>
      <p role="status" data-testid="status">{status}</p>
      <p className="muted">成功次数：<strong data-testid="runs">{state?.successfulRuns ?? 0}</strong> · 当前轨迹：<span data-testid="trace">{events.join(' → ') || '暂无'}</span></p>
      <details><summary>最近一次成功结果</summary><pre data-testid="result">{state?.lastResult || '暂无'}</pre></details>
    </section>
    <section className="panel"><h2>Android 原生桥接</h2><p className="muted">在 APK 内执行回传检查，并读取 Android API 与 WebView 版本。</p>
      <button onClick={() => { void nativeStatus().then(setNative).catch(report); }}>检查原生桥接</button><p data-testid="native">{native}</p>
    </section>
    <footer>技术可行性验证 · 正式 App 的真机性能、模型服务与后台恢复需单独验收。</footer>
  </main>;
}
