import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage } from '../src/runtime.mjs';
import { validateResult } from '../src/validate.mjs';
const answer = { title: '函数', goal: '理解定义', questions: [] };
const stop = content => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });
const call = (name='read_learning_context', args={}) => ({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 't1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const base = { stage: 'intake', context: { messages: [{ role: 'user', content: '学函数' }] }, system: '测试规则' };
test('real Pi loop reads supplied context then validates JSON', async () => {
 let n=0;const result=await runStage({...base,request:async payload=>{n++;if(n===1)return call();assert.equal(JSON.parse(payload.messages.find(m=>m.role==='tool').content).messages[0].content,'学函数');return stop(answer);}});
 assert.equal(n,2);assert.deepEqual(result.result,answer);assert.equal(result.audit.toolCalls,1);
});
test('cannot bypass actual context read', async()=>assert.rejects(runStage({...base,request:async()=>stop(answer)}),/未读取/));
test('truncated response never becomes valid output', async()=>assert.rejects(runStage({...base,request:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})}),/截断/));
test('invalid result is rejected after tool loop', async()=>{let n=0;await assert.rejects(runStage({...base,request:async()=>++n===1?call():stop({title:'丢了目标'})}),/缺少/);});
test('transport error and cancellation remain errors', async()=>{
 await assert.rejects(runStage({...base,request:async()=>{throw Error('401');}}),/401/);
 const controller=new AbortController();controller.abort();await assert.rejects(runStage({...base,signal:controller.signal,request:async()=>stop(answer)}),/取消/);
});
test('bounded loop terminates repeated tool requests', async()=>{let n=0;await assert.rejects(runStage({...base,request:async()=>{n++;return call();}}),/上限/);assert.equal(n,4);});
test('empty material source reports unconfigured search', async()=>{
 let n=0;await runStage({...base,request:async p=>{n++;if(n===1)return call();if(n===2)return call('read_materials');const result=JSON.parse(p.messages.filter(m=>m.role==='tool').at(-1).content);assert.equal(result.status,'unavailable');assert.equal(result.external_search,'not_configured');return stop(answer);}});
});
test('cards reject quiz types, unknown nodes and missing definitions',()=>{
 const context={nodes:[{id:'n'}]};const valid={cards:[{node_id:'n',kind:'定义诠释',title:'是什么',text:'输入对应唯一输出'},{node_id:'n',kind:'例子',title:'例子',text:'f(x)=2x，f(3)=6'}]};
 assert.equal(validateResult('cards',valid,context),valid);
 assert.throws(()=>validateResult('cards',{cards:[{...valid.cards[0],kind:'思考问题'}]},context),/讲述/);
 assert.throws(()=>validateResult('cards',{cards:[valid.cards[1]]},context),/定义/);
 assert.throws(()=>validateResult('cards',{cards:[{...valid.cards[0],node_id:'unknown'}]},context),/无效/);
});
