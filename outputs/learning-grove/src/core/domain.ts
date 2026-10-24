import { requireThat, record } from "../contracts.ts";
export { requireThat } from "../contracts.ts";
import type {
  LearningState,
  LearningTree,
  LearningNode,
  LearningEvent,
  Memory,
  Material,
  MaterialInput,
} from "../contracts.ts";
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const string = (s: unknown, max = 2000): s is string =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max;
export function migrate(raw: unknown): LearningState {
  const s = raw as LearningState;
  requireThat(
    s && Array.isArray(s.trees) && Array.isArray(s.memories),
    "档案缺少学习树或个人记录",
  );
  s.schema_version = 2;
  s.semantic_revision ??= 0;
  s.events ??= [];
  s.tombstones ??= [];
  s.strategies ??= [];
  s.tasks ??= [];
  s.settlements ??= [];
  s.event_seq ??= Math.max(0, ...s.events.map((e) => e.seq || 0));
  s.memory_version ??= 0;
  s.draft ??= { messages: [], summary: null };
  for (const t of s.trees) {
    t.materials ??= [];
    t.contract_version ??= 1;
    t.material_version ??= 0;
    t.strategy_version ??= 0;
    t.settled_through ??= 0;
    t.auto_prepare ??= true;
    t.search_enabled ??= true;
    t.route_history ??= [];
    t.sources ??= [];
    for (const n of t.nodes) {
      n.chapter ??= "学习路线";
      n.parent_id ??= "";
      n.content_version ??= n.ready ? 1 : 0;
      n.reinforcement ??= null;
      n.messages ??= [];
      n.links ??= [];
      n.page ??= 0;
    }
  }
  return s;
}
export function event(
  s: LearningState,
  type: string,
  tree_id: string,
  node_id: string,
  content = "",
): LearningEvent {
  const e = {
    id: uid(),
    seq: ++s.event_seq,
    type,
    tree_id,
    node_id,
    content: String(content).slice(0, 5000),
    at: now(),
  };
  s.events.push(e);
  return e;
}
export const activeEvents = (s: LearningState, t: LearningTree) =>
  s.events
    .filter(
      (e) => e.tree_id === t.id && e.seq > t.settled_through && !e.redacted,
    )
    .sort((a, b) => a.seq - b.seq);
export function forget(s: LearningState, m: Memory) {
  const ids = new Set(m.event_ids || []);
  s.tombstones.push({
    id: uid(),
    memory_id: m.id,
    event_ids: [...ids],
    text: m.content,
    at: now(),
  });
  // Redact associated original events from future model context; keep conversation locally visible.
  for (const e of s.events)
    if (ids.has(e.id) || e.content === m.content) e.redacted = true;
  s.memories = s.memories.filter(
    (x) => x.id !== m.id && !(x.event_ids || []).some((id) => ids.has(id)),
  );
  s.strategies = s.strategies.filter(
    (x) => !(x.event_ids || []).some((id) => ids.has(id)),
  );
  for (const t of s.trees) {
    t.strategy_version++;
    t.route_proposal = null;
    for (const n of t.nodes) {
      if (n.status === "unseen") n.needs_refresh = true;
      for (const msg of n.messages)
        if (ids.has(msg.event_id || "")) msg.excluded_from_context = true;
    }
  }
  s.memory_version++;
}
export function remembered(
  s: LearningState,
  t: LearningTree | null,
  query = "",
) {
  const terms = [
    ...new Set<string>([
      ...(query.match(/[\p{L}\p{N}]{2,}/gu) || []),
      ...[...query].filter((x) => /[\u4e00-\u9fff]/.test(x)),
    ]),
  ];
  return s.memories
    .filter((m) => !s.tombstones.some((x) => x.text === m.content))
    .map((m) => ({
      m,
      score:
        (m.tree_id === t?.id ? 10 : 0) +
        (!m.tree_id ? 4 : 0) +
        terms.filter((x) => m.content.includes(x)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ m }) => m);
}
export function stamp(s: LearningState, t?: LearningTree, n?: LearningNode) {
  return JSON.stringify([
    s.memory_version,
    t?.contract_version,
    t?.material_version,
    t?.strategy_version,
    n?.content_version,
  ]);
}
export function material(input: MaterialInput): Material {
  requireThat(
    string(input.title, 160) && string(input.text, 24000),
    "材料需要标题和正文，正文最多 24000 字",
  );
  const url = input.url || "";
  requireThat(!url || /^https:\/\//.test(url), "来源链接只支持 HTTPS");
  return {
    id: uid(),
    title: input.title.trim(),
    text: input.text.trim(),
    url,
    location: String(input.location || "用户提供的正文").slice(0, 300),
    kind: input.kind || "user",
    license: input.license || "用户提供，请确认使用权限",
    at: now(),
  };
}
export function validateArchive(raw: unknown): LearningState {
  const data = record(raw);
  requireThat(
    data &&
      ["zhizhi-personal-1", "zhizhi-personal-2"].includes(String(data.format)),
    "不支持的档案格式",
  );
  const s = migrate(structuredClone(data.state));
  const safeId = (x: unknown): x is string =>
    typeof x === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
  s.strategies = s.strategies.filter(
    (x) =>
      x &&
      string(x.content, 900) &&
      string(x.reason, 900) &&
      Array.isArray(x.event_ids) &&
      x.event_ids.every(safeId) &&
      safeId(x.tree_id),
  );
  s.settlements = s.settlements.filter(
    (x) =>
      x && safeId(x.id) && safeId(x.tree_id) && Number.isInteger(x.through),
  );
  requireThat(
    s.trees.length <= 100 &&
      s.memories.length <= 5000 &&
      s.events.length <= 50000,
    "档案超过本机版本的容量限制",
  );
  const ids = new Set<string>();
  const id = (x: string) => {
    requireThat(
      string(x, 100) && /^[a-zA-Z0-9_-]+$/.test(x) && !ids.has(x),
      "档案 ID 无效或重复",
    );
    ids.add(x);
  };
  for (const t of s.trees) {
    id(t.id);
    t.route_proposal = null;
    t.route_history = [];
    t.description = String(t.description || "").slice(0, 2000);
    t.preferences = Object.fromEntries(
      ["target", "difficulty", "detail", "style", "guidance"].map((k) => [
        k,
        String(t.preferences?.[k as keyof typeof t.preferences] || "").slice(
          0,
          500,
        ),
      ]),
    );
    requireThat(
      string(t.title, 160) &&
        string(t.goal, 3000) &&
        Array.isArray(t.nodes) &&
        t.nodes.length <= 100,
      "学习树格式无效",
    );
    for (const n of t.nodes) {
      id(n.id);
      n.description = String(n.description || "").slice(0, 2000);
      n.chapter = String(n.chapter || "学习路线").slice(0, 200);
      n.parent_id = safeId(n.parent_id) ? n.parent_id : "";
      requireThat(
        Array.isArray(n.links) && n.links.length <= 100,
        "关联格式无效",
      );
      for (const l of n.links)
        requireThat(
          l && safeId(l.tree_id) && safeId(l.node_id),
          "关联目标无效",
        );
      n.content_history = [];
      requireThat(
        string(n.title, 160) &&
          Array.isArray(n.cards) &&
          n.cards.length <= 32 &&
          Array.isArray(n.messages) &&
          n.messages.length <= 5000,
        "知识节点格式无效",
      );
      requireThat(
        ["unseen", "learning", "read", "done", "skipped"].includes(n.status),
        "节点状态无效",
      );
      for (const c of n.cards) {
        id(c.id);
        c.kind = String(c.kind || "讲解").slice(0, 100);
        c.node_id = n.id;
        requireThat(
          string(c.title, 200) && string(c.text, 10000),
          "卡片格式无效",
        );
        requireThat(
          !c.image ||
            (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
              c.image,
            ) &&
              c.image.length <= 1500000),
          "图片格式无效",
        );
      }
      for (const m of n.messages) {
        requireThat(
          ["user", "assistant"].includes(m.role) && string(m.content, 10000),
          "问答格式无效",
        );
        m.card_id = n.cards.some((c) => c.id === m.card_id) ? m.card_id : "";
        m.card_title = String(m.card_title || "").slice(0, 200);
        m.at = String(m.at || "");
      }
      n.page = Math.max(0, Math.min(Number(n.page) || 0, n.cards.length - 1));
      if (n.reinforcement) {
        const x = n.reinforcement;
        requireThat(
          Number.isInteger(x.version) &&
            typeof x.passed === "boolean" &&
            Array.isArray(x.questions) &&
            x.questions.length === 1 &&
            Array.isArray(x.attempts) &&
            x.attempts.length <= 100,
          "加强记录格式无效",
        );
        for (const q of x.questions)
          requireThat(
            string(q.question, 600) &&
              string(q.criterion, 1000) &&
              string(q.example_answer, 1500),
            "加强问题格式无效",
          );
        for (const a of x.attempts)
          requireThat(
            string(a.answer, 4000) &&
              typeof a.passed === "boolean" &&
              string(a.evidence, 1500) &&
              string(a.explanation, 2000),
            "加强证据格式无效",
          );
        requireThat(
          !x.passed ||
            (x.version === n.content_version &&
              x.attempts.some((a) => a.passed === true)),
          "通过标记缺少对应版本证据",
        );
      }
    }
    requireThat(
      Array.isArray(t.materials) && t.materials.length <= 50,
      "资料集合无效",
    );
    for (const m of t.materials) {
      requireThat(
        string(m.id, 100) &&
          string(m.title, 160) &&
          string(m.text, 24000) &&
          (!m.url || /^https:\/\//.test(m.url)),
        "材料格式无效",
      );
    }
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
    for (const n of t.nodes) {
      requireThat(
        !n.knowledge ||
          (Array.isArray(n.knowledge.claims) &&
            n.knowledge.claims.every(
              (c) =>
                string(c.text, 2000) &&
                Array.isArray(c.material_ids) &&
                c.material_ids.every(safeId),
            )),
        "知识依据格式无效",
      );
      n.material_ids = (
        Array.isArray(n.material_ids) ? n.material_ids : []
      ).filter(safeId);
      if (n.plan && !Array.isArray(n.plan.pages)) n.plan = null;
    }
  }
  for (const m of s.memories) {
    id(m.id);
    requireThat(string(m.content, 3000), "个人记录格式无效");
    m.category = String(m.category || "个人记录").slice(0, 100);
    m.source = String(m.source || "导入记录").slice(0, 200);
    m.tree_id = safeId(m.tree_id) ? m.tree_id : "";
    m.node_id = safeId(m.node_id) ? m.node_id : "";
    m.event_ids = (Array.isArray(m.event_ids) ? m.event_ids : []).filter(
      safeId,
    );
  }
  const eventSequences = new Set<number>();
  for (const e of s.events) {
    requireThat(
      safeId(e.id) &&
        Number.isSafeInteger(e.seq) &&
        e.seq > 0 &&
        !eventSequences.has(e.seq) &&
        typeof e.content === "string",
      "事件格式无效或序号重复",
    );
    id(e.id);
    eventSequences.add(e.seq);
  }
  requireThat(
    s.tombstones.every(
      (e) => typeof e.text === "string" && Array.isArray(e.event_ids),
    ),
    "遗忘记录格式无效",
  );
  s.event_seq = s.events.reduce((max, e) => Math.max(max, e.seq), 0);
  s.memory_version =
    Number.isSafeInteger(s.memory_version) && s.memory_version >= 0
      ? s.memory_version
      : 0;
  for (const t of s.trees) {
    for (const k of [
      "contract_version",
      "material_version",
      "strategy_version",
      "settled_through",
    ] as const)
      requireThat(
        Number.isSafeInteger(t[k]) && t[k] >= 0,
        "学习版本或结算位置无效",
      );
    for (const n of t.nodes)
      requireThat(
        Number.isSafeInteger(n.content_version) &&
          n.content_version >= 0 &&
          typeof n.ready === "boolean",
        "内容版本无效",
      );
  }
  s.tasks = [];
  s.draft = { messages: [], summary: null };
  return s;
}
export function importArchive(
  current: LearningState,
  data: unknown,
  mode: string,
): LearningState {
  const incoming = validateArchive(data);
  requireThat(["merge", "replace"].includes(mode), "请选择合并或替换");
  if (mode === "replace") {
    incoming.revision = current.revision;
    incoming.semantic_revision = current.semantic_revision;
    return incoming;
  }
  // Remap evidence as well as objects: forgetting an imported memory must still
  // invalidate its original events, strategies, and conversation context.
  const map = new Map<string, string>();
  const newId = (x: string | undefined): string => {
    if (!x) return "";
    if (!map.has(x)) map.set(x, uid());
    return map.get(x)!;
  };
  const sequences = new Map<number, number>();
  let nextSequence = current.event_seq;
  for (const e of [...incoming.events].sort((a, b) => a.seq - b.seq))
    sequences.set(e.seq, ++nextSequence);
  const through = (old: number) =>
    Math.max(
      0,
      ...[...sequences].filter(([seq]) => seq <= old).map(([, seq]) => seq),
    );
  for (const t of incoming.trees) {
    t.id = newId(t.id);
    t.title += "（导入）";
    t.current_node_id = newId(t.current_node_id);
    t.settled_through = through(t.settled_through);
    t.route_history = [];
    for (const n of t.nodes) {
      n.id = newId(n.id);
      n.parent_id = newId(n.parent_id);
      n.content_history = [];
      if (n.plan) n.plan.node_id = n.id;
      if (n.material_ids) n.material_ids = n.material_ids.map(newId);
      if (n.knowledge)
        for (const c of n.knowledge.claims || [])
          c.material_ids = (c.material_ids || []).map(newId);
      n.cards.forEach((c) => {
        c.id = newId(c.id);
        if (c.node_id) c.node_id = n.id;
      });
      n.messages.forEach((m) => {
        m.card_id = newId(m.card_id);
        m.event_id = newId(m.event_id);
      });
      n.links = (n.links || []).map((l) => ({
        tree_id: newId(l.tree_id),
        node_id: newId(l.node_id),
      }));
    }
    t.materials.forEach((m) => (m.id = newId(m.id)));
    t.sources = (t.sources || []).map((m) => ({ ...m, id: newId(m.id) }));
  }
  for (const m of incoming.memories) {
    m.id = newId(m.id);
    m.tree_id = newId(m.tree_id);
    m.node_id = newId(m.node_id);
    m.event_ids = (m.event_ids || []).map(newId);
  }
  for (const e of incoming.events) {
    e.id = newId(e.id);
    e.tree_id = newId(e.tree_id);
    e.node_id = newId(e.node_id);
    e.seq = sequences.get(e.seq)!;
  }
  for (const strategy of incoming.strategies) {
    strategy.id = newId(strategy.id || uid());
    strategy.tree_id = newId(strategy.tree_id);
    strategy.event_ids = strategy.event_ids.map(newId);
  }
  for (const settlement of incoming.settlements) {
    settlement.id = newId(settlement.id);
    settlement.tree_id = newId(settlement.tree_id);
    settlement.through = through(settlement.through);
  }
  for (const x of incoming.tombstones) {
    x.id = uid();
    x.memory_id = newId(x.memory_id);
    x.event_ids = x.event_ids.map(newId);
  }
  current.trees.push(...incoming.trees);
  current.memories.push(...incoming.memories);
  current.events.push(...incoming.events);
  current.tombstones.push(...incoming.tombstones);
  current.strategies.push(...incoming.strategies);
  current.settlements.push(...incoming.settlements);
  current.event_seq = nextSequence;
  current.memory_version++;
  return current;
}
