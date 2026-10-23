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
  } else if (stage === 'knowledge') {
    requireValue(['ready','blocked'].includes(result.decision)&&Array.isArray(result.claims)&&result.claims.length<=16&&Array.isArray(result.gaps), '知识整理格式无效');
    const ids=new Set((context.materials||[]).map(m=>m.id));const seen=new Set();
    for(const c of result.claims){requireValue(text(c.id,100)&&!seen.has(c.id)&&text(c.text,1500)&&['supported','uncertain'].includes(c.status)&&Array.isArray(c.material_ids)&&c.material_ids.every(id=>ids.has(id)), '要点引用了不存在的材料或格式无效');seen.add(c.id);if(c.status==='supported')requireValue(c.material_ids.length>0,'有依据的要点必须引用材料');}
    for(const g of result.gaps)requireValue(text(g.question,500)&&typeof g.critical==='boolean','知识缺口格式无效');
    if(result.decision==='ready')requireValue(result.claims.length>0&&result.claims.every(c=>c.status==='supported')&&!result.gaps.some(g=>g.critical),'仍有核心不确定性，不能进入正文生成');
  } else if (stage === 'page-plan') {
    requireValue(result.node_id===context.node_id&&Array.isArray(result.pages)&&result.pages.length>=2&&result.pages.length<=8&&Array.isArray(result.uncovered_claim_ids),'页序格式无效');
    const claims=new Set(context.knowledge.claims.map(c=>c.id));const covered=new Set();
    for(const p of result.pages){requireValue(text(p.purpose,500)&&Array.isArray(p.claim_ids)&&p.claim_ids.every(x=>claims.has(x)),'页序引用无效');p.claim_ids.forEach(x=>covered.add(x));}
    requireValue([...claims].every(x=>covered.has(x)||result.uncovered_claim_ids.includes(x)),'页序遗漏要点且未说明');
  } else if (stage === 'quality') {
    requireValue(['pass','revise','blocked'].includes(result.decision)&&Array.isArray(result.issues)&&result.checks,'质检格式无效');
    const keys=['goal','prerequisites','definitions','examples','sequence','sources','burden'];
    requireValue(keys.every(k=>typeof result.checks[k]==='boolean'),'质检缺少检查项');
    for(const i of result.issues)requireValue(text(i.reason,1000)&&['core','optional'].includes(i.severity),'质检问题格式无效');
    if(result.decision==='pass')requireValue(keys.every(k=>result.checks[k])&&!result.issues.some(i=>i.severity==='core'),'存在核心问题，不能发布');
  } else if (stage === 'settlement') {
    requireValue(Array.isArray(result.observations)&&Array.isArray(result.strategy_proposals)&&result.strategy_proposals.length<=3,'结算格式无效');
    requireValue(result.event_range?.after===context.event_range.after&&result.event_range?.through===context.event_range.through,'结算事件范围不匹配');
    const events=new Map(context.events.map(e=>[e.id,e]));
    for(const p of result.strategy_proposals){requireValue(text(p.change,900)&&text(p.reason,900)&&Array.isArray(p.event_ids)&&p.event_ids.length>0&&p.event_ids.every(id=>events.has(id)&&!events.get(id).redacted),'策略缺少有效事件证据');requireValue(p.event_ids.some(id=>['feedback','preference'].includes(events.get(id).type)),'策略更新需明确偏好或反馈，不从单次提问推断');}
  } else if (stage === 'reinforcement') {
    if(context.mode==='generate') {requireValue(Array.isArray(result.questions)&&result.questions.length===1,'每次加强一个小问题');for(const q of result.questions)requireValue(text(q.question,600)&&text(q.criterion,1000)&&text(q.example_answer,1500),'加强问题缺少判据或参考回答');}
    else requireValue(typeof result.passed==='boolean'&&text(result.evidence,1500)&&text(result.explanation,2000),'加强判定缺少证据');
  } else throw Error('未知阶段：' + stage);
  return result;
}
