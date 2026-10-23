import test from 'node:test';
import assert from 'node:assert/strict';
import { runProbe, createMockRequest, fromCompletion, toPayload } from '../src/core.mjs';

const base = () => ({ topic: '函数是什么', mode: 'mock', readProfile: async () => ({ style: '先定义，再举例，不提问', revision: 1 }), request: createMockRequest(), persist: async () => {} });

test('real Pi loop executes tool and sends its result in second request', async () => {
  const config = base(), seen = [], events = []; let saved;
  const mock = config.request;
  const record = await runProbe({ ...config, request: async (p, o) => { seen.push(p); return mock(p, o); }, persist: async r => { saved = structuredClone(r); }, onEvent: e => events.push(e.type) });
  assert.equal(record.requests, 2); assert.equal(record.toolCount, 1);
  assert.equal(seen.length, 2); assert.equal(seen[0].tool_choice.function.name, 'read_learning_context');
  assert.equal(seen[1].tool_choice, 'none');
  const assistant = seen[1].messages.find(m => m.role === 'assistant');
  const result = seen[1].messages.find(m => m.role === 'tool');
  assert.equal(assistant.tool_calls[0].id, result.tool_call_id);
  assert.equal(JSON.parse(result.content).verification_token, record.verificationToken);
  assert.match(record.text, /先定义，再举例/); assert.equal(saved.mode, 'mock');
  assert(events.indexOf('tool_start') < events.indexOf('tool_end'));
  assert(events.indexOf('tool_end') < events.lastIndexOf('request'));
  assert.equal(events.at(-1), 'saved');
});

test('local profile update is read at run time', async () => {
  const record = await runProbe({ ...base(), readProfile: async () => ({ style: '先生活例子，再解释定义', revision: 2 }) });
  assert.match(record.text, /先生活例子/); assert.equal(record.profile.revision, 2);
});

test('model refusing to use tool never passes', async () => {
  let saved = false;
  await assert.rejects(runProbe({ ...base(), request: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"title":"假回答","text":"无工具","context_token":"fake"}' } }] }), persist: async () => { saved = true; } }), /工具循环/);
  assert.equal(saved, false);
});

test('transport failure does not persist a fake success', async () => {
  let saved = false;
  await assert.rejects(runProbe({ ...base(), request: async () => { throw new Error('HTTP 401'); }, persist: async () => { saved = true; } }), /401/);
  assert.equal(saved, false);
});

test('invalid arguments do not execute tool or get marked passed', async () => {
  let reads = 0;
  await assert.rejects(runProbe({ ...base(), readProfile: async () => { reads++; return {}; }, request: async () => ({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'bad', type: 'function', function: { name: 'read_learning_context', arguments: '{' } }] } }] }) }), /JSON/);
  assert.equal(reads, 0);
});

test('database write failure is surfaced and not saved', async () => {
  await assert.rejects(runProbe({ ...base(), persist: async () => { throw new Error('写入失败'); } }), /写入失败/);
});

test('wrong verification token is not accepted', async () => {
  const mock = createMockRequest();
  await assert.rejects(runProbe({ ...base(), request: async (p, o) => { const r = await mock(p, o); if (r.choices[0].finish_reason === 'stop') r.choices[0].message.content = '{"title":"test","text":"test","context_token":"wrong"}'; return r; } }), /标记/);
});

test('cancellation stops a pending request without saving', async () => {
  const controller = new AbortController(); let saved = false;
  const promise = runProbe({ ...base(), signal: controller.signal, request: (_p, { signal }) => new Promise((yes, no) => signal.addEventListener('abort', () => no(new Error('cancelled')), { once: true })), persist: async () => { saved = true; } });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(promise, /取消/); assert.equal(saved, false);
});

test('model output truncation is an explicit failure', () => {
  assert.throws(() => fromCompletion({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }, 'test'), /截断/);
});
