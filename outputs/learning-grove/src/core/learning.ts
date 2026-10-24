import { errorMessage } from "../contracts.ts";
import type {
  LearningState,
  LearningTree,
  LearningNode,
  Ask,
  Material,
  AppDocument,
  Action,
  ActionResult,
  FeatureDependencies,
  Memory,
  QualityResult,
  Reinforcement,
  Assessment,
  StageResults,
  KnowledgeResult,
  Card,
} from "../contracts.ts";
import {
  uid,
  now,
  migrate,
  event,
  remembered,
  activeEvents,
  forget,
  material,
  requireThat,
  string,
  importArchive,
} from "./domain.ts";
export async function generate(
  s: LearningState,
  t: LearningTree,
  n: LearningNode,
  ask: Ask,
  search: (query: string) => Promise<Material[]>,
  progress: (label: string) => void = () => {},
): Promise<ActionResult> {
  const brief = {
    tree: { title: t.title, goal: t.goal, preferences: t.preferences },
    nodes: [{ id: n.id, title: n.title, description: n.description }],
    memories: remembered(s, t, n.title + " " + t.title),
    strategies: s.strategies.filter((x) => x.tree_id === t.id),
    materials: t.materials.slice(-3).map((m) => ({
      ...m,
      text: m.text.slice(0, 4000),
      location:
        m.location + (m.text.length > 4000 ? "（本次读取前 4000 字）" : ""),
    })),
  };
  let retrieval = "provided";
  if (!brief.materials.length && t.search_enabled) {
    progress("正在查找资料");
    try {
      brief.materials = await search(n.title);
      retrieval = "wikipedia";
    } catch (e) {
      retrieval = "检索失败：" + errorMessage(e);
    }
  }
  requireThat(
    brief.materials.length > 0,
    "当前节点没有可读取的材料。请在“学习资料”中检索或添加教材片段后重试。",
  );
  progress("正在整理知识依据");
  let knowledge = await ask("knowledge", brief);
  if (
    knowledge.decision === "blocked" &&
    t.search_enabled &&
    retrieval !== "wikipedia"
  ) {
    progress("正在补查核心缺口");
    try {
      const extra = await search(
        (knowledge.gaps.find((g) => g.critical)?.question || n.title).slice(
          0,
          160,
        ),
      );
      brief.materials = [...brief.materials, ...extra].slice(-3);
      retrieval = "wikipedia-gap";
      knowledge = await ask("knowledge", brief);
    } catch (e) {
      retrieval = "补查失败：" + errorMessage(e);
    }
  }
  requireThat(
    knowledge.decision === "ready" && !knowledge.gaps.some((g) => g.critical),
    "核心知识依据不足：" + knowledge.gaps.map((g) => g.question).join("；"),
  );
  progress("正在安排讲解顺序");
  const plan = await ask("page-plan", { ...brief, knowledge, node_id: n.id });
  requireThat(
    !plan.uncovered_claim_ids.length,
    "页序没有覆盖核心要点，请补充材料或缩小范围。",
  );
  let cards: StageResults["cards"]["cards"] = [],
    quality: QualityResult | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    progress(attempt ? "正在修正讲解" : "正在编写定义与例子");
    cards = (
      await ask("cards", { ...brief, knowledge, plan, repair: quality || null })
    ).cards;
    progress("正在检查内容");
    quality = await ask("quality", { ...brief, knowledge, plan, cards });
    if (quality.decision === "pass") break;
    if (quality.decision === "blocked")
      throw Error(
        "内容检查未通过：" + quality?.issues.map((x) => x.reason).join("；"),
      );
  }
  requireThat(
    quality && quality.decision === "pass",
    "修订后仍未通过检查：" + quality?.issues.map((x) => x.reason).join("；"),
  );
  n.content_history ??= [];
  if (n.cards.length)
    n.content_history.push({
      cards: n.cards,
      version: n.content_version,
      knowledge: n.knowledge,
      plan: n.plan,
      quality: n.quality,
      at: now(),
    });
  n.content_history = n.content_history.slice(-3);
  n.needs_refresh = false;
  n.cards = cards.map((c) => ({ ...c, id: uid(), image: "" }));
  n.ready = true;
  n.page = 0;
  n.content_version++;
  n.reinforcement = null;
  n.knowledge = knowledge;
  n.plan = plan;
  n.quality = quality;
  n.generated_at = now();
  n.basis = {
    contract_version: t.contract_version,
    material_version: t.material_version,
    strategy_version: t.strategy_version,
  };
  for (const m of brief.materials)
    if (!t.materials.some((x) => x.id === m.id)) t.materials.push(m);
  n.material_readings = brief.materials.map((m) => ({
    id: m.id,
    location: m.location,
    characters: m.text.length,
  }));
  n.material_ids = brief.materials.map((m) => m.id);
  t.sources = t.materials.map(
    ({ id, title, url, location, kind, license }) => ({
      id,
      title,
      url,
      location,
      kind,
      license,
    }),
  );
  t.source_status = "依据已读取材料生成；AI 检查不等于专业审定";
  n.retrieval = retrieval;
  event(s, "generated", t.id, n.id, "完成小节：" + n.title);
  return { node_id: n.id };
}
export async function featureAction(
  doc: AppDocument,
  d: Action,
  { ask, search, progress }: FeatureDependencies,
): Promise<ActionResult | null> {
  const s = migrate(doc.state);
  const t = s.trees.find((x) => x.id === d.tree_id),
    n = t?.nodes.find((x) => x.id === d.node_id);
  const k = d.type;
  if (k === "import_archive") {
    doc.state = importArchive(s, d.archive, d.mode);
    return { message: "档案已导入；模型密钥保持当前设备设置。" };
  }
  if (k === "restore_import") {
    requireThat(doc.previous_state, "没有可恢复的导入前档案");
    const prev = doc.previous_state;
    doc.previous_state = structuredClone(s);
    doc.state = migrate(prev);
    return { message: "已恢复上一次导入前的档案。" };
  }
  if (k === "memory_delete" || k === "memory_edit") {
    const m = s.memories.find((x) => x.id === d.id);
    requireThat(m, "找不到记录");
    const original = structuredClone(m);
    forget(s, m);
    if (k === "memory_edit") {
      requireThat(string(d.content, 900), "记忆正文无效");
      const e = event(
        s,
        "preference",
        original.tree_id,
        original.node_id,
        d.content,
      );
      s.memories.push({
        ...original,
        id: uid(),
        content: d.content,
        source: "用户已修正",
        event_ids: [e.id],
        updated: now(),
      });
    }
    return {};
  }
  if (
    ![
      "material_add",
      "material_search",
      "material_remove",
      "feedback",
      "settle",
      "strengthen",
      "strengthen_answer",
      "revise_route",
      "accept_route",
      "rollback_content",
      "learning_options",
      "regenerate",
    ].includes(k)
  )
    return null;
  requireThat(t, "找不到学习树");
  if (k === "material_add") {
    requireThat(t.materials.length < 50, "单棵树最多 50 份资料");
    t.materials.push(material(d));
    t.material_version++;
    return { message: "材料已保存，后续生成将参考。" };
  }
  if (k === "material_search") {
    const results = await search(d.query || t.title);
    requireThat(results.length, "未找到可读取正文，请换关键词或粘贴材料。");
    for (const m of results)
      if (!t.materials.some((x) => x.url === m.url)) t.materials.push(m);
    t.material_version++;
    return {
      message:
        "已保存 " + results.length + " 份百科摘要，请核对与学习目标的相关性。",
    };
  }
  if (k === "material_remove") {
    t.materials = t.materials.filter((m) => m.id !== d.id);
    t.sources = t.sources.filter((m) => m.id !== d.id);
    t.material_version++;
    for (const node of t.nodes)
      if (node.material_ids?.includes(d.id))
        node.source_warning = "原材料已移除，现有内容待重新核验";
    return {};
  }
  if (k === "learning_options") {
    t.auto_prepare = d.auto_prepare === true;
    t.search_enabled = d.search_enabled === true;
    return {};
  }
  if (k === "feedback") {
    requireThat(string(d.message, 1000), "请填写想调整的地方");
    const e = event(s, "feedback", t.id, n?.id || "", d.message);
    s.memories.push({
      id: uid(),
      category: "学习偏好",
      content: d.message,
      tree_id: t.id,
      node_id: n?.id || "",
      source: "用户明确表达",
      event_ids: [e.id],
      updated: now(),
    });
    s.memory_version++;
    t.strategy_version++;
    for (const node of t.nodes)
      if (node.status === "unseen" && node.id !== n?.id)
        node.needs_refresh = true;
    return { message: "已记下，将用于后续讲解；现有内容不会自动被替换。" };
  }
  if (k === "settle") {
    const events = activeEvents(s, t).slice(0, 100);
    if (!events.length) return { message: "本次没有待整理的新经历。" };
    const end = events.at(-1)!.seq;
    const observations: Memory[] = events
      .filter((e) => e.type === "read")
      .map((e) => ({
        id: uid(),
        category: "学习经历",
        content: e.content,
        tree_id: t.id,
        node_id: e.node_id,
        source: "阅读记录（不代表掌握）",
        event_ids: [e.id],
        updated: now(),
      }));
    const contextual = events.filter((e) =>
      ["feedback", "question", "preference", "reinforcement"].includes(e.type),
    );
    let proposals: StageResults["settlement"]["strategy_proposals"] = [];
    if (contextual.length && !t.demo) {
      const result = await ask("settlement", {
        events: contextual,
        event_range: { after: t.settled_through, through: end },
        memories: remembered(s, t, t.title),
      });
      proposals = result.strategy_proposals;
    }
    for (const p of proposals) {
      if (s.tombstones.some((x) => x.text === p.change)) continue;
      s.strategies.push({
        id: uid(),
        tree_id: t.id,
        content: p.change,
        reason: p.reason,
        event_ids: p.event_ids,
        at: now(),
      });
    }
    s.strategies = s.strategies.slice(-200);
    s.memories.push(...observations);
    t.settled_through = end;
    if (proposals.length) {
      t.strategy_version++;
      for (const node of t.nodes)
        if (node.status === "unseen") node.needs_refresh = true;
    }
    s.settlements.push({
      id: uid(),
      tree_id: t.id,
      through: end,
      observations: observations.length,
      strategies: proposals.length,
      at: now(),
    });
    return {
      message: `本次整理了 ${observations.length} 条阅读经历、${proposals.length} 条讲解策略。`,
      settlement: { observations, proposals },
    };
  }
  if (k === "strengthen") {
    requireThat(n?.ready, "先准备好这个小节");
    let result: { questions: Reinforcement["questions"] };
    if (n.reinforcement?.version === n.content_version) return {};
    if (t.demo) {
      requireThat(
        n.id === t.nodes[0].id,
        "固定示例只在第一节提供加强演示；正式学习树会按当前小节生成。",
      );
      result = {
        questions: [
          {
            question: "规则 f(x)=2x 中，输入 3 的输出是多少？请简单说明。",
            criterion: "答案为 6，说明将 3 乘以 2。",
            example_answer: "f(3)=2×3=6。",
          },
        ],
      };
    } else {
      const generated = await ask("reinforcement", {
        mode: "generate",
        node_version: n.content_version,
        node: { id: n.id, title: n.title, cards: n.cards },
        materials: t.materials.filter((m) => n.material_ids?.includes(m.id)),
      });
      requireThat("questions" in generated, "加强问题格式无效");
      result = generated;
    }
    n.reinforcement = {
      id: uid(),
      version: n.content_version,
      questions: result.questions,
      passed: false,
      attempts: [],
      created: now(),
    };
    return {};
  }
  if (k === "strengthen_answer") {
    requireThat(
      n?.reinforcement && n.reinforcement.version === n.content_version,
      "讲解版本已变化，请重新开始加强学习",
    );
    requireThat(string(d.answer, 4000), "写下一点想法即可");
    const q = n.reinforcement.questions[0];
    let result: Assessment;
    if (t.demo)
      result = {
        passed: /(?:6|六)/.test(d.answer) && /(?:2|二|两|乘|×)/.test(d.answer),
        evidence: "固定示例规则检查，仅适用于当前函数演示题。",
        explanation: q.example_answer,
      };
    else {
      const assessed = await ask("reinforcement", {
        mode: "evaluate",
        node_version: n.content_version,
        question: q,
        answer: d.answer,
        node: { title: n.title, cards: n.cards },
      });
      requireThat("passed" in assessed, "加强判定格式无效");
      result = assessed;
    }
    n.reinforcement.passed = n.reinforcement.passed || result.passed;
    n.reinforcement.attempts.push({ answer: d.answer, ...result, at: now() });
    event(
      s,
      "reinforcement",
      t.id,
      n.id,
      `${n.title}：${result.passed ? "加强检查通过" : "尝试加强学习"}，${result.evidence}`,
    );
    return { assessment: result };
  }
  if (k === "revise_route") {
    requireThat(string(d.reason, 1000), "请说明希望怎样调整");
    const result = await ask("roadmap", {
      title: t.title,
      goal: t.goal,
      preferences: t.preferences,
      reason: d.reason,
      existing_nodes: t.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        status: n.status,
      })),
      materials: t.materials,
      memories: remembered(s, t, t.title),
    });
    t.route_proposal = {
      id: uid(),
      reason: d.reason,
      result,
      base: t.contract_version,
      memory_version: s.memory_version,
      material_version: t.material_version,
      created: now(),
    };
    return {};
  }
  if (k === "accept_route") {
    const p = t.route_proposal;
    requireThat(
      p &&
        p.id === d.proposal_id &&
        p.base === t.contract_version &&
        p.memory_version === s.memory_version &&
        p.material_version === t.material_version,
      "建议已过期，请重新生成",
    );
    t.route_history.push({
      id: uid(),
      description: t.description,
      node_ids: t.nodes.map((n) => n.id),
      at: now(),
    });
    const matched = new Set<string>();
    const route: LearningNode[] = [];
    for (const ch of p.result.chapters)
      for (const entry of ch.nodes) {
        let existing = t.nodes.find(
          (n) => n.title === entry.title && !matched.has(n.id),
        );
        if (existing) {
          matched.add(existing.id);
          existing.chapter = ch.title;
          route.push(existing);
        } else
          route.push({
            id: uid(),
            title: entry.title,
            description: entry.description,
            chapter: ch.title,
            parent_id: "",
            status: "unseen",
            cards: [],
            ready: false,
            messages: [],
            links: [],
            page: 0,
            content_version: 0,
            reinforcement: null,
          });
      }
    for (const old of t.nodes)
      if (!matched.has(old.id)) {
        old.chapter = "保留的旧路线";
        route.push(old);
      }
    requireThat(route.length <= 100, "路线过大，请缩小范围");
    t.nodes = route;
    t.description = p.result.description;
    t.contract_version++;
    t.route_proposal = null;
    return { message: "路线建议已应用，旧节点及记录保留。" };
  }
  if (k === "rollback_content") {
    requireThat(n?.content_history?.length, "没有上一版内容");
    const previous = n.content_history.pop()!;
    Object.assign(n, {
      cards: previous.cards,
      knowledge: previous.knowledge,
      plan: previous.plan,
      quality: previous.quality,
      content_version: n.content_version + 1,
      reinforcement: null,
      page: 0,
    });
    return { message: "已恢复上一版讲解，原问答记录保留。" };
  }
  if (k === "regenerate") {
    requireThat(n, "找不到节点");
    return generate(s, t, n, ask, search, progress);
  }
  return null;
}
