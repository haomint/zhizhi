import { list, record, requireThat } from "../contracts.ts";
import type { Stage, StageContext, StageResults } from "../contracts.ts";
const text = (value: unknown, max = 6000): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const objects = (value: unknown) => list(value).map(record);
export function validateResult<S extends Stage>(
  stage: S,
  raw: unknown,
  context: StageContext = {},
): StageResults[S] {
  const r = record(raw);
  if (stage === "intake") {
    requireThat(
      text(r.title, 80) && text(r.goal, 900),
      "需求摘要缺少主题或目标",
    );
    const questions = objects(r.questions);
    requireThat(questions.length <= 1, "一轮最多一个核心补问");
    for (const q of questions)
      requireThat(
        text(q.question, 160) &&
          Array.isArray(q.options) &&
          q.options.length <= 4 &&
          q.options.every((o) => text(o, 80)),
        "补问格式无效",
      );
  } else if (stage === "roadmap") {
    const chapters = objects(r.chapters);
    requireThat(
      chapters.length > 0 && chapters.length <= 6,
      "路线章节数量无效",
    );
    const nodes = chapters.flatMap((c) => objects(c.nodes));
    requireThat(
      nodes.length > 0 && nodes.length <= 24,
      "路线应包含 1—24 个节点",
    );
    for (const c of chapters)
      requireThat(text(c.title, 50) && list(c.nodes).length, "章节缺少内容");
    for (const n of nodes)
      requireThat(
        text(n.title, 60) && text(n.description, 400),
        "节点缺少学习价值说明",
      );
    requireThat(text(r.description, 2000), "路线缺少说明");
  } else if (stage === "cards") {
    const cards = objects(r.cards),
      ids = new Set((context.nodes || []).map((n) => n.id));
    requireThat(cards.length > 0 && cards.length <= 8, "单节点须为 1—8 页");
    requireThat(ids.size === 1, "每批只生成一个完整节点");
    for (const c of cards) {
      requireThat(
        typeof c.node_id === "string" &&
          ids.has(c.node_id) &&
          text(c.title, 70) &&
          text(c.text, 600),
        "卡片节点、标题或正文无效",
      );
      requireThat(
        ["定义诠释", "例子", "区分", "用途", "拓展", "衔接"].includes(
          String(c.kind),
        ),
        "主线只接受讲述卡片类型",
      );
    }
    requireThat(
      cards[0]?.kind === "定义诠释" && cards.some((c) => c.kind === "例子"),
      "缺少开头定义或完整例子",
    );
  } else if (stage === "tutor") {
    const memories = objects(r.memories);
    requireThat(text(r.answer, 5000) && memories.length <= 2, "答疑格式无效");
    for (const m of memories)
      requireThat(
        text(m.content, 900) &&
          ["用户明确表达", "助手暂时推测"].includes(String(m.source)),
        "记忆缺少来源",
      );
  } else if (stage === "knowledge") {
    const claims = objects(r.claims),
      gaps = objects(r.gaps);
    requireThat(
      ["ready", "blocked"].includes(String(r.decision)) && claims.length <= 16,
      "知识整理格式无效",
    );
    const ids = new Set((context.materials || []).map((m) => m.id)),
      seen = new Set<string>();
    for (const c of claims) {
      requireThat(
        text(c.id, 100) &&
          !seen.has(c.id) &&
          text(c.text, 1500) &&
          ["supported", "uncertain"].includes(String(c.status)) &&
          Array.isArray(c.material_ids) &&
          c.material_ids.every((id) => typeof id === "string" && ids.has(id)),
        "要点引用了不存在的材料或格式无效",
      );
      seen.add(c.id);
      if (c.status === "supported")
        requireThat(c.material_ids.length, "有依据的要点必须引用材料");
    }
    for (const g of gaps)
      requireThat(
        text(g.question, 500) && typeof g.critical === "boolean",
        "知识缺口格式无效",
      );
    if (r.decision === "ready")
      requireThat(
        claims.length &&
          claims.every((c) => c.status === "supported") &&
          !gaps.some((g) => g.critical),
        "仍有核心不确定性，不能进入正文生成",
      );
  } else if (stage === "page-plan") {
    const pages = objects(r.pages);
    requireThat(
      r.node_id === context.node_id &&
        pages.length >= 2 &&
        pages.length <= 8 &&
        Array.isArray(r.uncovered_claim_ids),
      "页序格式无效",
    );
    const claims = new Set(context.knowledge?.claims.map((c) => c.id)),
      covered = new Set<string>();
    for (const p of pages) {
      requireThat(
        text(p.purpose, 500) &&
          Array.isArray(p.claim_ids) &&
          p.claim_ids.every((x) => typeof x === "string" && claims.has(x)),
        "页序引用无效",
      );
      for (const id of p.claim_ids) covered.add(String(id));
    }
    const uncovered = r.uncovered_claim_ids;
    requireThat(
      [...claims].every((x) => covered.has(x) || uncovered.includes(x)),
      "页序遗漏要点且未说明",
    );
  } else if (stage === "quality") {
    const issues = objects(r.issues),
      checks = record(r.checks),
      keys = [
        "goal",
        "prerequisites",
        "definitions",
        "examples",
        "sequence",
        "sources",
        "burden",
      ];
    requireThat(
      ["pass", "revise", "blocked"].includes(String(r.decision)) &&
        keys.every((k) => typeof checks[k] === "boolean"),
      "质检缺少检查项",
    );
    for (const i of issues)
      requireThat(
        text(i.reason, 1000) &&
          ["core", "optional"].includes(String(i.severity)),
        "质检问题格式无效",
      );
    if (r.decision === "pass")
      requireThat(
        keys.every((k) => checks[k]) &&
          !issues.some((i) => i.severity === "core"),
        "存在核心问题，不能发布",
      );
  } else if (stage === "settlement") {
    list(r.observations);
    const proposals = objects(r.strategy_proposals),
      range = record(r.event_range);
    requireThat(
      proposals.length <= 3 &&
        range.after === context.event_range?.after &&
        range.through === context.event_range?.through,
      "结算事件范围不匹配",
    );
    const events = new Map(context.events?.map((e) => [e.id, e]));
    for (const p of proposals) {
      requireThat(
        text(p.change, 900) &&
          text(p.reason, 900) &&
          Array.isArray(p.event_ids) &&
          p.event_ids.length &&
          p.event_ids.every(
            (id) =>
              typeof id === "string" &&
              events.has(id) &&
              !events.get(id)?.redacted,
          ),
        "策略缺少有效事件证据",
      );
      requireThat(
        p.event_ids.some((id) =>
          ["feedback", "preference"].includes(
            events.get(String(id))?.type || "",
          ),
        ),
        "策略更新需明确偏好或反馈，不从单次提问推断",
      );
    }
  } else if (stage === "reinforcement") {
    if (context.mode === "generate") {
      const questions = objects(r.questions);
      requireThat(questions.length === 1, "每次加强一个小问题");
      for (const q of questions)
        requireThat(
          text(q.question, 600) &&
            text(q.criterion, 1000) &&
            text(q.example_answer, 1500),
          "加强问题缺少判据或参考回答",
        );
    } else
      requireThat(
        typeof r.passed === "boolean" &&
          text(r.evidence, 1500) &&
          text(r.explanation, 2000),
        "加强判定缺少证据",
      );
  } else throw new Error("未知阶段：" + stage);
  return raw as StageResults[S];
}
