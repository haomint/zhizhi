const requireValue = (ok, message) => { if (!ok) throw Error(message); };
const text = (s, max = 6000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
export function validateResult(stage, result, context = {}) {
  requireValue(result && typeof result === 'object' && !Array.isArray(result), '结果必须为对象');
  if (stage === 'intake') {
    requireValue(text(result.title, 80) && text(result.goal, 900), '需求摘要缺少主题或目标');
    requireValue(Array.isArray(result.questions) && result.questions.length <= 1, '一轮最多一个核心补问');
    for (const q of result.questions) requireValue(text(q.question, 160) && Array.isArray(q.options) && q.options.length <= 4 && q.options.every(o => text(o, 80)), '补问格式无效');
  } else if (stage === 'roadmap') {
    requireValue(Array.isArray(result.chapters) && result.chapters.length > 0 && result.chapters.length <= 6, '路线章节数量无效');
    const nodes = result.chapters.flatMap(c => c.nodes || []);
    requireValue(nodes.length > 0 && nodes.length <= 24, '路线应包含 1—24 个节点');
    for (const c of result.chapters) requireValue(text(c.title, 50) && Array.isArray(c.nodes) && c.nodes.length > 0, '章节缺少内容');
    for (const n of nodes) requireValue(text(n.title, 60) && text(n.description, 400), '节点缺少学习价值说明');
  } else if (stage === 'cards') {
    requireValue(Array.isArray(result.cards) && result.cards.length > 0 && result.cards.length <= 8, '单节点须为 1—8 页');
    const ids = new Set((context.nodes || []).map(n => n.id));
    requireValue(ids.size === 1, '每批只生成一个完整节点');
    for (const c of result.cards) {
      requireValue(ids.has(c.node_id) && text(c.title, 70) && text(c.text, 600), '卡片节点、标题或正文无效');
      requireValue(['定义诠释', '例子', '区分', '用途', '拓展', '衔接'].includes(c.kind), '主线只接受讲述卡片类型');
    }
    requireValue(result.cards[0].kind === '定义诠释' && result.cards.some(c => c.kind === '例子'), '缺少开头定义或完整例子');
    // These are structural gates, not proof of factual correctness.
  } else if (stage === 'tutor') {
    requireValue(text(result.answer, 5000) && Array.isArray(result.memories) && result.memories.length <= 2, '答疑格式无效');
    for (const m of result.memories) requireValue(text(m.content, 900) && ['用户明确表达', '助手暂时推测'].includes(m.source), '记忆缺少来源');
  } else throw Error('阶段尚未接入业务校验：' + stage);
  return result;
}
