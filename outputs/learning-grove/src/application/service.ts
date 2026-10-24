import { errorMessage, record, requireThat } from "../contracts.ts";
import type {
  Action,
  ActionReply,
  ActionResult,
  AppDocument,
  Archive,
  Ask,
  Card,
  Conversation,
  LearningNode,
  LearningState,
  LearningTask,
  LearningTree,
  Memory,
  ModelSettings,
  Preferences,
  PublicSettings,
  Snapshot,
  Stage,
  StageContext,
  StageResults,
} from "../contracts.ts";
import {
  event,
  material,
  migrate,
  now,
  remembered,
  uid,
} from "../core/domain.ts";
import { featureAction, generate } from "../core/learning.ts";
import { runStage } from "../core/runtime.ts";
import type { Platform } from "../platform/platform.ts";
import type { Repository } from "../platform/repository.ts";

const clean = (value: unknown, max = 4000) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
function required(value: unknown, max = 4000): string {
  const text = clean(value, max);
  requireThat(text, "必要内容为空，请补充后重试。");
  return text;
}
const defaults: ModelSettings = {
  provider: "deepseek",
  base_url: "https://api.deepseek.com",
  model: "deepseek-flash",
  enabled: true,
  remember: true,
  test_status: "untested",
};
export function createNode(
  title: string,
  description: string,
  chapter: string,
  parent = "",
): LearningNode {
  return {
    id: uid(),
    title,
    description,
    chapter,
    parent_id: parent,
    status: "unseen",
    cards: [],
    ready: false,
    messages: [],
    links: [],
    page: 0,
    content_version: 0,
    reinforcement: null,
  };
}
export function createTree(
  title: string,
  goal: string,
  preferences: Preferences,
  nodes: LearningNode[],
  description = "",
): LearningTree {
  return {
    id: uid(),
    title,
    goal,
    preferences,
    nodes,
    description,
    created: now(),
    updated: now(),
    demo: false,
    sources: [],
    materials: [],
    source_status: "模型组织的初步路线；尚未联网检索与核验",
    contract_version: 1,
    material_version: 0,
    strategy_version: 0,
    settled_through: 0,
    auto_prepare: true,
    search_enabled: true,
    route_history: [],
  };
}
const generationActions = new Set([
  "summarize",
  "create_tree",
  "refill",
  "chat",
  "material_search",
  "settle",
  "strengthen",
  "strengthen_answer",
  "revise_route",
  "regenerate",
]);
const readingActions = new Set(["visit", "set_page", "advance"]);

export class LearningService {
  readonly ready: Promise<void>;
  private repository: Repository;
  private platform: Platform;
  private document!: AppDocument;
  private keyConfigured = false;
  private writes: Promise<void> = Promise.resolve();
  private generations: Promise<void> = Promise.resolve();
  private running: {
    id: string;
    controller: AbortController;
    background: boolean;
  } | null = null;
  private listeners = new Set<(snapshot: Snapshot) => void>();
  private rules = new Map<string, string>();
  constructor(repository: Repository, platform: Platform) {
    this.repository = repository;
    this.platform = platform;
    this.ready = this.initialize();
  }
  private async initialize() {
    const raw = await this.repository.read();
    if (raw !== undefined && raw !== null) {
      const stored = record(raw);
      const settings = record(stored.settings || {});
      this.document = {
        state: migrate(stored.state),
        settings: {
          ...defaults,
          provider: clean(settings.provider) || defaults.provider,
          model: clean(settings.model, 100) || defaults.model,
          enabled: settings.enabled !== false,
          base_url: defaults.base_url,
          remember: true,
          test_status: ["passed", "failed"].includes(
            String(settings.test_status),
          )
            ? (settings.test_status as "passed" | "failed")
            : "untested",
        },
        ...(stored.previous_state
          ? { previous_state: migrate(stored.previous_state) }
          : {}),
      };
    } else {
      this.document = {
        state: migrate({ trees: [], memories: [], revision: 0 }),
        settings: { ...defaults },
      };
      const previous = await this.repository.legacyCard?.();
      if (previous) {
        const card = record(previous);
        if (typeof card.content === "string" && card.content) {
          const node = createNode(
            clean(card.topic, 60) || "之前的学习卡片",
            "独立运行验证阶段保存的内容",
            "已保存",
          );
          node.cards = [
            {
              id: uid(),
              kind: "已保存",
              title: node.title,
              text: card.content,
              image: "",
            },
          ];
          node.ready = true;
          node.content_version = 1;
          const tree = createTree(
            node.title,
            "回顾之前保存的学习内容",
            {},
            [node],
            "从安卓验证版保留的卡片",
          );
          tree.source_status = "历史生成内容，未联网核验";
          this.document.state.trees.push(tree);
        }
      }
    }
    for (const task of this.document.state.tasks)
      if (["running", "queued"].includes(task.status)) {
        task.status = "paused";
        task.stage = "应用重开，等待手动重试";
      }
    this.keyConfigured = (await this.platform.status()).configured;
    await this.commit(this.document);
  }
  private settings(): PublicSettings {
    return {
      ...this.document.settings,
      has_key: this.keyConfigured,
      can_remember: this.platform.native,
      enabled: this.document.settings.enabled && this.keyConfigured,
      remember: this.platform.native,
      ...(!this.platform.native
        ? { notice: "浏览器本地预览；真实模型与密钥在安卓应用中使用。" }
        : {}),
    };
  }
  private snapshot(): Snapshot {
    return {
      state: structuredClone(this.document.state),
      settings: this.settings(),
    };
  }
  async read(): Promise<Snapshot> {
    await this.ready;
    return this.snapshot();
  }
  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private async commit(document: AppDocument) {
    await this.repository.write(document);
    this.document = structuredClone(document);
    if (this.listeners.size) {
      const snapshot = this.snapshot();
      for (const listener of this.listeners) listener(snapshot);
    }
  }
  private shortWrite<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  private async rule(name: string) {
    let text = this.rules.get(name);
    if (text === undefined) {
      text = await this.platform.loadRule(name);
      this.rules.set(name, text);
    }
    return text;
  }
  private async ask<S extends Stage>(
    stage: S,
    context: StageContext,
    document: AppDocument,
  ): Promise<StageResults[S]> {
    requireThat(document.settings.enabled, "请先启用模型。");
    const topic = JSON.stringify(context.tree || {});
    const subject = /历史|朝代|文明/.test(topic)
      ? "history"
      : /数学|高数|函数|导数|线性|积分|代数/.test(topic)
        ? "math"
        : null;
    const system =
      (await this.rule("agent")) +
      "\n" +
      (await this.rule(stage)) +
      (subject ? "\n" + (await this.rule(subject)) : "");
    const response = await runStage({
      stage,
      context,
      system,
      model: document.settings.model,
      request: (payload, options) =>
        this.platform.complete(payload, options?.signal),
      signal: this.running?.controller.signal,
    });
    return response.result;
  }
  private remember(
    state: LearningState,
    category: string,
    content: string,
    tree = "",
    node = "",
    source = "用户明确表达",
    key = "",
  ) {
    content = clean(content, 900);
    if (!content) return;
    const old = key ? state.memories.find((m) => m.key === key) : undefined;
    const item: Memory = {
      id: old?.id || uid(),
      category,
      content,
      tree_id: tree,
      node_id: node,
      source,
      key,
      event_ids: old?.event_ids || [],
      updated: now(),
    };
    if (old) Object.assign(old, item);
    else state.memories.push(item);
  }
  private progress = (label: string) => {
    const id = this.running?.id;
    if (!id) return;
    void this.shortWrite(async () => {
      const doc = structuredClone(this.document);
      const task = doc.state.tasks.find((t) => t.id === id);
      if (task) {
        task.stage = label;
        await this.commit(doc);
      }
    }).catch(() => {});
  };
  private async prepare(
    document: AppDocument,
    tree: LearningTree,
    priority?: string,
  ): Promise<ActionResult> {
    const missing = tree.nodes.filter(
        (n) => (!n.ready || n.needs_refresh) && n.status !== "skipped",
      ),
      node = missing.find((n) => n.id === priority) || missing[0];
    if (!node) return {};
    const ask: Ask = (stage, context) => this.ask(stage, context, document);
    return generate(
      document.state,
      tree,
      node,
      ask,
      (query) => this.platform.search(query),
      this.progress,
    );
  }
  private related(
    state: LearningState,
    tree: LearningTree,
    node: LearningNode,
    card: Card | undefined,
    message: string,
  ) {
    const terms = new Set(
      message.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]/g) || [],
    );
    const chinese = [...message]
      .filter((x) => /[\u4e00-\u9fff]/.test(x))
      .join("");
    for (let i = 0; i < chinese.length - 1; i++)
      terms.add(chinese.slice(i, i + 2));
    const rows: Array<{
      score: number;
      at: string;
      tree_title: string;
      node_title: string;
      card_title?: string;
      messages: Conversation[];
    }> = [];
    let target = "";
    const match = message.match(/第([一二三四五六七八九十]|\d+)(?:个|张|页)/);
    if (match) {
      const index = /\d/.test(match[1])
        ? Number(match[1])
        : "一二三四五六七八九十".indexOf(match[1]) + 1;
      target = node.cards[index - 1]?.id || "";
    } else if (/上一[张页]|前一张/.test(message))
      target =
        node.cards[node.cards.findIndex((c) => c.id === card?.id) - 1]?.id ||
        "";
    for (const t of state.trees)
      for (const n of t.nodes)
        n.messages.forEach((m, index) => {
          if (m.role !== "user" || m.excluded_from_context) return;
          const pair = n.messages
            .slice(index, index + 2)
            .filter((x) => !x.excluded_from_context);
          const text = (
            n.title +
            (m.card_title || "") +
            pair.map((x) => x.content).join("")
          ).toLowerCase();
          const same = t.id === tree.id && n.id === node.id;
          const score =
            [...terms].filter((x) => text.includes(x)).length +
            (same ? 3 : 0) +
            (same && target && m.card_id === target ? 100 : 0);
          if (score > (same ? 0 : 3))
            rows.push({
              score,
              at: m.at || "",
              tree_title: t.title,
              node_title: n.title,
              card_title: m.card_title,
              messages: pair.map((x) => ({
                role: x.role,
                content: x.content.slice(0, 1800),
              })),
            });
        });
    return rows
      .sort((a, b) => b.score - a.score || b.at.localeCompare(a.at))
      .slice(0, 8);
  }
  private async action(doc: AppDocument, d: Action): Promise<ActionResult> {
    const s = migrate(doc.state),
      k = d.type;
    if (k === "import_archive") doc.previous_state = structuredClone(s);
    const ask: Ask = (stage, context) => this.ask(stage, context, doc);
    const feature = await featureAction(doc, d, {
      ask,
      search: (query) => this.platform.search(query),
      progress: this.progress,
    });
    if (feature !== null) return feature;
    if (k === "configure" || k === "configure_test" || k === "test_model") {
      if (k !== "test_model") {
        requireThat(
          !d.base_url || d.base_url.replace(/\/$/, "") === defaults.base_url,
          "目前仅支持 DeepSeek 官方地址。",
        );
        if (d.clear_key) await this.platform.clearKey();
        if (clean(d.key)) await this.platform.configure(required(d.key, 1000));
        this.keyConfigured = (await this.platform.status()).configured;
        Object.assign(doc.settings, {
          enabled: d.enabled !== false,
          model: clean(d.model, 100) || doc.settings.model,
          remember: true,
          test_status: "untested",
        });
        await this.commit(doc);
      }
      if (k !== "configure") {
        try {
          await this.platform.test(doc.settings.model);
          doc.settings.test_status = "passed";
        } catch (error) {
          doc.settings.test_status = "failed";
          await this.commit(doc);
          throw error;
        }
      }
      return { message: k === "configure" ? "设置已保存。" : "连接成功。" };
    }
    if (k === "draft_message") {
      s.draft.messages.push({ role: "user", content: required(d.message) });
      s.draft.summary = null;
      return {};
    }
    if (k === "clear_draft") {
      s.draft = { messages: [], summary: null };
      return {};
    }
    if (k === "draft_unsummarize") {
      s.draft.summary = null;
      return {};
    }
    if (k === "summarize") {
      requireThat(s.draft.messages.length, "先说说你想学什么吧。");
      const r = await ask("intake", {
        messages: s.draft.messages,
        memories: remembered(
          s,
          null,
          s.draft.messages.map((m) => m.content).join(" "),
        ),
      });
      s.draft.summary = {
        title: required(r.title, 80),
        goal: required(r.goal, 900),
        notes: clean(r.notes, 600),
        preferences: r.preferences || {},
        information: r.information || {},
        questions: r.questions.slice(0, 1).map((q) => ({
          question: clean(q.question, 160),
          required: q.required === true,
          options: q.options.slice(0, 4).map((x) => clean(x, 80)),
        })),
      };
      return {};
    }
    if (k === "demo") {
      let tree = s.trees.find((t) => t.demo);
      if (!tree) {
        const raw = await this.platform.loadDemo();
        const migrated = migrate({ trees: [raw], memories: [], revision: 0 });
        tree = migrated.trees[0];
        tree.id = uid();
        tree.created = tree.updated = now();
        for (const node of tree.nodes) {
          node.id = uid();
          for (const card of node.cards) {
            card.id = uid();
            card.node_id = node.id;
          }
        }
        tree.current_node_id = tree.nodes[0]?.id;
        s.trees.unshift(tree);
      }
      return { tree_id: tree.id };
    }
    if (k === "create_tree") {
      requireThat(
        !s.draft.summary?.questions.some((q) => q.required) ||
          (d.notes && !d.notes.includes("未补充")),
        "先补充这一个关键问题，我们再确定学习路线。",
      );
      const title = required(d.title, 80),
        goal = required(d.goal, 900),
        preferences = d.preferences || {};
      const result = await ask("roadmap", {
        title,
        goal,
        preferences,
        notes: clean(d.notes, 3000),
        conversation: s.draft.messages,
        memories: remembered(s, null, title),
        past_trees: s.trees.map((t) => ({ title: t.title, goal: t.goal })),
      });
      const nodes = result.chapters.flatMap((ch) =>
        ch.nodes.map((n) =>
          createNode(
            required(n.title, 60),
            clean(n.description, 400),
            required(ch.title, 50),
          ),
        ),
      );
      requireThat(
        nodes.length > 0 && nodes.length <= 24,
        "路线过于简略，请重试。",
      );
      const tree = createTree(
        title,
        goal,
        preferences,
        nodes,
        clean(result.description, 500),
      );
      s.trees.unshift(tree);
      this.remember(
        s,
        "长期目标",
        title + "：" + goal,
        tree.id,
        "",
        "用户明确表达",
        tree.id + ":goal",
      );
      s.draft = { messages: [], summary: null };
      return { tree_id: tree.id };
    }
    if (k === "memory_add") {
      this.remember(
        s,
        clean(d.category, 30) || "个人背景",
        required(d.content, 900),
      );
      s.memory_version++;
      return {};
    }
    const tree = s.trees.find((t) => t.id === d.tree_id);
    requireThat(tree, "找不到学习树。");
    tree.updated = now();
    if (k === "delete_tree") {
      s.events = s.events.filter((e) => e.tree_id !== tree.id);
      s.strategies = s.strategies.filter((e) => e.tree_id !== tree.id);
      s.tasks = s.tasks.filter((e) => e.tree_id !== tree.id);
      s.memory_version++;
      s.trees = s.trees.filter((t) => t !== tree);
      s.memories = s.memories.filter((m) => m.tree_id !== tree.id);
      for (const t of s.trees)
        for (const n of t.nodes)
          n.links = n.links.filter((l) => l.tree_id !== tree.id);
      return {};
    }
    if (k === "preferences") {
      tree.contract_version++;
      for (const n of tree.nodes)
        if (n.status === "unseen") n.needs_refresh = true;
      event(s, "preference", tree.id, "", JSON.stringify(d.preferences));
      tree.goal = required(d.goal, 900);
      tree.preferences = d.preferences;
      this.remember(
        s,
        "长期目标",
        tree.title + "：" + tree.goal,
        tree.id,
        "",
        "用户明确表达",
        tree.id + ":goal",
      );
      return {};
    }
    if (k === "refill")
      return tree.demo ? {} : this.prepare(doc, tree, d.node_id);
    const node = tree.nodes.find((n) => n.id === d.node_id);
    requireThat(node, "找不到知识点。");
    tree.current_node_id = node.id;
    if (k === "visit") return {};
    if (k === "set_page") {
      node.page = Math.max(
        0,
        Math.min(Number(d.page) || 0, node.cards.length - 1),
      );
      return {};
    }
    if (k === "advance") {
      requireThat(
        node.cards.length && node.page === node.cards.length - 1,
        "先读到本节最后一页。",
      );
      if (node.status !== "done") node.status = "read";
      node.read_at = now();
      if (
        !s.events.some(
          (e) =>
            e.type === "read" &&
            e.node_id === node.id &&
            e.content_version === node.content_version,
        )
      ) {
        const e = event(
          s,
          "read",
          tree.id,
          node.id,
          "已阅读「" + node.title + "」，不代表掌握。",
        );
        e.content_version = node.content_version;
      }
      this.remember(
        s,
        "学习经历",
        tree.title +
          "：已浏览 " +
          tree.nodes
            .filter((n) => ["read", "done"].includes(n.status))
            .map((n) => n.title)
            .join("、") +
          "。阅读不等于经过测评掌握。",
        tree.id,
        "",
        "阅读进度汇总",
        tree.id + ":reading",
      );
      const next = tree.nodes[tree.nodes.indexOf(node) + 1];
      if (next) tree.current_node_id = next.id;
      return { next_node_id: next?.id || "" };
    }
    if (k === "status") {
      requireThat(
        ["unseen", "learning", "done", "skipped"].includes(d.status),
        "未知状态。",
      );
      node.status = d.status;
      return {};
    }
    if (k === "chat") {
      const message = required(d.message),
        card = d.card_id
          ? node.cards.find((c) => c.id === d.card_id)
          : node.cards[node.page || 0];
      requireThat(!d.card_id || card, "卡片不属于当前节点。");
      const r = tree.demo
        ? {
            answer:
              "【演示回答】" +
              (card?.text || node.description) +
              "\n创建正式学习树后，回答将根据你的问题生成。",
            memories: [],
          }
        : await ask("tutor", {
            message,
            tree: {
              title: tree.title,
              goal: tree.goal,
              preferences: tree.preferences,
            },
            node: {
              title: node.title,
              description: node.description,
              cards: node.cards.map(({ title, text, kind }) => ({
                title,
                text,
                kind,
              })),
            },
            current_card: card,
            history: node.messages
              .filter((m) => !m.excluded_from_context)
              .slice(-12),
            related_learning_records: this.related(
              s,
              tree,
              node,
              card,
              message,
            ),
            memories: remembered(s, tree, message),
            strategies: s.strategies.filter((x) => x.tree_id === tree.id),
            materials: tree.materials.filter((m) =>
              node.material_ids?.includes(m.id),
            ),
          });
      const answer = required(r.answer, 5000),
        e = event(s, "question", tree.id, node.id, message);
      for (const entry of [
        { role: "user" as const, content: message },
        { role: "assistant" as const, content: answer },
      ])
        node.messages.push({
          ...entry,
          at: now(),
          card_id: card?.id || "",
          card_title: card?.title || "",
          event_id: e.id,
        });
      return {};
    }
    if (k === "branch") {
      requireThat(tree.nodes.length < 40, "单棵树最多40个节点。");
      const child = createNode(
        required(d.title, 60),
        "从「" + node.title + "」延伸的探索。",
        "探索支线",
        node.id,
      );
      tree.nodes.push(child);
      return { node_id: child.id };
    }
    if (k === "link") {
      const other = s.trees.find((t) => t.id === d.other_tree_id);
      requireThat(
        other &&
          other !== tree &&
          other.nodes.some((n) => n.id === d.other_node_id),
        "请选择另一棵树的有效节点。",
      );
      if (
        !node.links.some(
          (l) => l.tree_id === other.id && l.node_id === d.other_node_id,
        )
      )
        node.links.push({ tree_id: other.id, node_id: d.other_node_id });
      return {};
    }
    if (k === "image") {
      const card = node.cards.find((c) => c.id === d.card_id);
      requireThat(card, "卡片不存在。");
      const image = clean(d.image, 1500000);
      requireThat(
        !image ||
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image),
        "图片格式无效。",
      );
      card.image = image;
      return {};
    }
    throw Error("未知操作。");
  }
  private preserveReading(doc: AppDocument) {
    const saved = this.document.state;
    for (const tree of doc.state.trees) {
      const latest = saved.trees.find((t) => t.id === tree.id);
      if (!latest) continue;
      tree.current_node_id = latest.current_node_id;
      for (const node of tree.nodes) {
        const old = latest.nodes.find((n) => n.id === node.id);
        if (old) {
          if (node.content_version === old.content_version)
            node.page = old.page;
          node.status = old.status;
          if (old.read_at) node.read_at = old.read_at;
        }
      }
    }
    doc.state.memories = doc.state.memories
      .filter((m) => m.source !== "阅读进度汇总")
      .concat(
        structuredClone(
          saved.memories.filter((m) => m.source === "阅读进度汇总"),
        ),
      );
    const ids = new Set(doc.state.events.map((e) => e.id));
    for (const e of saved.events)
      if (!ids.has(e.id)) doc.state.events.push(structuredClone(e));
    const sequences = new Set<number>();
    let seq = Math.max(doc.state.event_seq, saved.event_seq);
    for (const e of doc.state.events) {
      if (sequences.has(e.seq)) e.seq = ++seq;
      sequences.add(e.seq);
    }
    doc.state.event_seq = seq;
    doc.state.tasks = structuredClone(saved.tasks);
  }
  private async execute(
    action: Action,
    queued?: LearningTask,
  ): Promise<ActionReply> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: typeof this.running = null;
    if (queued) {
      await this.shortWrite(async () => {
        const doc = structuredClone(this.document),
          task = doc.state.tasks.find((t) => t.id === queued.id);
        requireThat(task && task.status !== "cancelled", "已取消排队任务");
        task.status = "running";
        task.stage = "准备任务";
        await this.commit(doc);
      });
      active = {
        id: queued.id,
        controller: new AbortController(),
        background: !!action.background,
      };
      this.running = active;
      timer = setTimeout(() => active?.controller.abort(), 360000);
    }
    try {
      const doc = await this.shortWrite(async () =>
          structuredClone(this.document),
        ),
        base = doc.state.semantic_revision || 0;
      const result = await this.action(doc, action);
      const publish = async () => {
        if (queued) {
          requireThat(
            !active?.controller.signal.aborted,
            "已取消，已保存内容不受影响",
          );
          requireThat(
            (this.document.state.semantic_revision || 0) === base,
            "目标或资料已变化，本次旧结果未保存，请重试。",
          );
          this.preserveReading(doc);
          const task = doc.state.tasks.find((t) => t.id === queued.id);
          if (task) {
            task.status = "completed";
            task.stage = "已保存";
          }
        }
        doc.state.revision = (this.document.state.revision || 0) + 1;
        doc.state.semantic_revision =
          base + (readingActions.has(action.type) ? 0 : 1);
        await this.commit(doc);
        return { ...result, ...this.snapshot() };
      };
      return queued ? await this.shortWrite(publish) : await publish();
    } catch (error) {
      if (queued)
        await this.shortWrite(async () => {
          const doc = structuredClone(this.document),
            task = doc.state.tasks.find((t) => t.id === queued.id);
          if (task) {
            task.status = active?.controller.signal.aborted
              ? "cancelled"
              : "failed";
            task.error = errorMessage(error);
            task.stage = "已停止";
            await this.commit(doc);
          }
        });
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (queued && this.running?.id === queued.id) this.running = null;
    }
  }
  async dispatch(action: Action): Promise<ActionReply> {
    await this.ready;
    if (action.type === "cancel_task") {
      if (this.running && (!action.id || action.id === this.running.id))
        this.running.controller.abort();
      if (action.id)
        await this.shortWrite(async () => {
          const doc = structuredClone(this.document),
            task = doc.state.tasks.find((t) => t.id === action.id);
          if (task?.status === "queued") {
            task.status = "cancelled";
            task.stage = "已取消";
            await this.commit(doc);
          }
        });
      return { message: "正在停止生成", ...this.snapshot() };
    }
    if (generationActions.has(action.type)) {
      const task: LearningTask = {
        id: uid(),
        type: action.type,
        tree_id: action.tree_id || "",
        node_id: action.node_id || "",
        status: "queued",
        stage: "等待处理",
        payload: action,
        at: now(),
      };
      await this.shortWrite(async () => {
        const doc = structuredClone(this.document);
        doc.state.tasks = doc.state.tasks
          .filter((t) => ["running", "queued"].includes(t.status))
          .concat(
            doc.state.tasks
              .filter((t) => !["running", "queued"].includes(t.status))
              .slice(-18),
          );
        doc.state.tasks.push(task);
        await this.commit(doc);
      });
      if (!action.background && this.running?.background)
        this.running.controller.abort();
      const operation = () => this.execute(action, task),
        result = this.generations.then(operation, operation);
      this.generations = result.then(
        () => {},
        () => {},
      );
      return result;
    }
    return this.shortWrite(async () => {
      const doc = structuredClone(this.document),
        result = await this.action(doc, action);
      doc.state.revision = (this.document.state.revision || 0) + 1;
      doc.state.semantic_revision =
        (this.document.state.semantic_revision || 0) +
        (readingActions.has(action.type) ? 0 : 1);
      await this.commit(doc);
      return { ...result, ...this.snapshot() };
    });
  }
  async export(): Promise<Archive> {
    await this.ready;
    return {
      state: structuredClone(this.document.state),
      exported_at: now(),
      format: "zhizhi-personal-2",
    };
  }
  async share(): Promise<void> {
    await this.platform.exportArchive(
      JSON.stringify(await this.export(), null, 2),
    );
  }
}
