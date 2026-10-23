import { Capacitor, registerPlugin } from '@capacitor/core';
import { runProbe, createMockRequest, PI_VERSION } from './core.mjs';
import { openStore } from './store.mjs';

const native = Capacitor.isNativePlatform() ? registerPlugin('PiProbe') : null;
const $ = id => document.getElementById(id);
let store, active, profileRevision = 0;
const pending = new Set();

function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'status error' : 'status'; }
function render(record) {
  if (!record) return;
  $('saved-kind').textContent = record.mode === 'live' ? '真实模型结果 · 已保存' : '模拟结果 · 已保存（不能证明真实接口可用）';
  $('answer-title').textContent = record.title;
  $('answer').textContent = record.text;
  $('metadata').textContent = `${new Date(record.createdAt).toLocaleString()} · Pi ${record.piVersion} · ${record.requests} 次模型请求 / ${record.toolCount} 次工具 · ${(record.elapsedMs / 1000).toFixed(1)} 秒`;
  $('result').hidden = false;
}
function setBusy(busy) {
  for (const id of ['mock', 'live', 'save-key', 'clear-key', 'save-profile', 'topic', 'model', 'profile', 'export']) $(id).disabled = busy;
  $('cancel').hidden = !busy;
  if (!busy) $('live').disabled = !native;
}

async function requestNative(payload, { signal }) {
  if (!native) throw new Error('真实模型验证需要在安卓版运行');
  const requestId = crypto.randomUUID();
  const abort = () => { native.cancel({ requestId }).catch(() => {}); };
  if (signal?.aborted) throw new Error('已取消');
  signal?.addEventListener('abort', abort, { once: true }); pending.add(requestId);
  try {
    const data = await native.complete({ requestId, payload });
    if (signal?.aborted) throw new Error('已取消');
    return data;
  } finally { signal?.removeEventListener('abort', abort); pending.delete(requestId); }
}

async function start(mode) {
  if (active) return;
  active = new AbortController(); setBusy(true); $('events').replaceChildren();
  status(mode === 'live' ? '正在进行真实模型验证…' : '正在运行离线演练，模型回复由本机模拟…');
  try {
    const result = await runProbe({
      mode, topic: $('topic').value.trim(), model: $('model').value.trim(), signal: active.signal,
      request: mode === 'live' ? requestNative : createMockRequest(),
      readProfile: () => store.get('profile'),
      persist: record => store.put(mode === 'live' ? 'latest-live' : 'latest-mock', record),
      onEvent: e => { const li = document.createElement('li'); li.textContent = `${(e.elapsedMs / 1000).toFixed(1)}s · ${e.text}`; $('events').append(li); },
    });
    render(result);
    status(mode === 'live' ? '本次真实模型＋Pi 工具循环已完成，并保存到本机。请重开应用检验恢复。' : '离线演练完成：真实 Pi 循环与本地保存可用；真实 DeepSeek 连接仍未验证。');
  } catch (e) { status(`本次未通过：${e.message}。原有已保存结果仍保留。`, true); }
  finally { active = null; setBusy(false); }
}

async function updateKeyStatus() {
  const s = native ? await native.keyStatus() : { configured: false };
  $('key-state').textContent = native ? (s.configured ? '密钥已加密保存；尚需运行真实验证。' : '尚未设置 API Key。') : '浏览器仅提供离线演练；真实验证请安装 APK。';
}

async function main() {
  $('version').textContent = `实际打包 Pi Agent Core ${PI_VERSION}`;
  store = await openStore();
  let profile = await store.get('profile');
  if (!profile) { profile = { style: '先解释概念和用途，再用简单数字举例，不提问测验。', material: '固定验证材料：函数是一种对应规则，每个允许的输入对应唯一输出。f(x)=2x，输入3时输出6。', revision: 1 }; await store.put('profile', profile); }
  profileRevision = profile.revision || 1; $('profile').value = profile.style;
  $('save-profile').onclick = async () => { try { const style = $('profile').value.trim(); if (!style || style.length > 300) throw new Error('偏好须为 1—300 字'); await store.put('profile', { ...profile, style, revision: ++profileRevision }); profile = await store.get('profile'); status('本地偏好已保存；下次工具读取将使用它。'); } catch (e) { status(e.message, true); } };
  $('save-key').onclick = async () => { try { if (!native) throw new Error('请在安卓应用内保存'); const key = $('key').value.trim(); if (!key) throw new Error('请填写 API Key'); await native.setKey({ key }); $('key').value = ''; await updateKeyStatus(); status('密钥已加密保存。'); } catch (e) { status(e.message, true); } };
  $('clear-key').onclick = async () => { try { if (native) await native.clearKey(); $('key').value = ''; await updateKeyStatus(); status('密钥已清除，学习结果保留。'); } catch (e) { status(e.message, true); } };
  $('mock').onclick = () => start('mock'); $('live').onclick = () => start('live');
  $('cancel').onclick = () => { active?.abort(); status('已请求停止，正在结束本次任务…'); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) active.abort(); });
  $('export').onclick = async () => {
    try {
      const text = JSON.stringify({ format: 'zhizhi-pi-probe-1', piVersion: PI_VERSION, live: await store.get('latest-live') || null, mock: await store.get('latest-mock') || null }, null, 2);
      if (native) await native.exportReport({ text });
      else { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'pi-probe-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      status('验证报告已交给系统保存/分享；报告不含 API Key。');
    } catch (e) { status(e.message, true); }
  };
  render(await store.get('latest-live') || await store.get('latest-mock'));
  await updateKeyStatus(); setBusy(false);
  status('准备就绪。先运行离线演练，再用自己的 Key 做真实模型验证。');
  globalThis.__probeReady = true;
}
main().catch(e => { status(e.message, true); for (const b of document.querySelectorAll('button')) b.disabled = true; });
