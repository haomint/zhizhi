export type NodeStatus = "unseen" | "learning" | "read" | "done" | "skipped";
export interface Conversation {
  role: "user" | "assistant";
  content: string;
  at?: string;
  card_id?: string;
  card_title?: string;
  event_id?: string;
  excluded_from_context?: boolean;
}
export type Preferences = Partial<
  Record<"target" | "difficulty" | "detail" | "style" | "guidance", string>
>;
export interface Card {
  id: string;
  node_id?: string;
  kind: string;
  title: string;
  text: string;
  image?: string;
}
export interface Material {
  id: string;
  title: string;
  text: string;
  url: string;
  location: string;
  kind: string;
  license: string;
  at: string;
}
export type MaterialInput = Pick<Material, "title" | "text"> &
  Partial<Omit<Material, "id" | "title" | "text" | "at">>;
export interface IntakeResult {
  title: string;
  goal: string;
  questions: Array<{ question: string; required?: boolean; options: string[] }>;
  notes?: string;
  preferences?: Preferences;
  information?: Record<string, unknown>;
}
export interface RoadmapResult {
  description: string;
  chapters: Array<{
    title: string;
    nodes: Array<{ title: string; description: string }>;
  }>;
}
export interface KnowledgeResult {
  decision: "ready" | "blocked";
  claims: Array<{
    id: string;
    text: string;
    status: "supported" | "uncertain";
    material_ids: string[];
  }>;
  gaps: Array<{ question: string; critical: boolean }>;
}
export interface PagePlan {
  node_id: string;
  pages: Array<{ kind?: string; purpose: string; claim_ids: string[] }>;
  uncovered_claim_ids: string[];
}
export interface QualityResult {
  decision: "pass" | "revise" | "blocked";
  checks: Record<
    | "goal"
    | "prerequisites"
    | "definitions"
    | "examples"
    | "sequence"
    | "sources"
    | "burden",
    boolean
  >;
  issues: Array<{
    severity: "core" | "optional";
    reason: string;
    page_id?: string;
    repair?: string;
  }>;
}
export interface StrategyProposal {
  change: string;
  reason: string;
  event_ids: string[];
}
export interface Assessment {
  passed: boolean;
  evidence: string;
  explanation: string;
}
export interface Reinforcement {
  id: string;
  version: number;
  questions: Array<{
    question: string;
    criterion: string;
    example_answer: string;
  }>;
  passed: boolean;
  attempts: Array<Assessment & { answer: string; at: string }>;
  created: string;
}
export interface ContentHistory {
  cards: Card[];
  version: number;
  knowledge?: KnowledgeResult | null;
  plan?: PagePlan | null;
  quality?: QualityResult | null;
  at: string;
}
export interface LearningNode {
  id: string;
  title: string;
  description: string;
  chapter: string;
  parent_id: string;
  status: NodeStatus;
  cards: Card[];
  ready: boolean;
  messages: Conversation[];
  links: Array<{ tree_id: string; node_id: string }>;
  page: number;
  content_version: number;
  reinforcement: Reinforcement | null;
  content_history?: ContentHistory[];
  needs_refresh?: boolean;
  read_at?: string;
  generated_at?: string;
  source_warning?: string;
  material_ids?: string[];
  knowledge?: KnowledgeResult | null;
  plan?: PagePlan | null;
  quality?: QualityResult | null;
  basis?: {
    contract_version: number;
    material_version: number;
    strategy_version: number;
  };
  material_readings?: Array<{
    id: string;
    location: string;
    characters: number;
  }>;
  retrieval?: string;
}
export interface LearningTree {
  id: string;
  title: string;
  goal: string;
  description: string;
  preferences: Preferences;
  nodes: LearningNode[];
  materials: Material[];
  sources: Array<Partial<Material>>;
  source_status?: string;
  contract_version: number;
  material_version: number;
  strategy_version: number;
  settled_through: number;
  auto_prepare: boolean;
  search_enabled: boolean;
  current_node_id?: string;
  demo: boolean;
  created: string;
  updated: string;
  route_history: Array<{
    id: string;
    description: string;
    node_ids: string[];
    at: string;
  }>;
  route_proposal?: {
    id: string;
    reason: string;
    result: RoadmapResult;
    base: number;
    memory_version: number;
    material_version: number;
    created: string;
  } | null;
}
export interface Memory {
  id: string;
  category: string;
  content: string;
  tree_id: string;
  node_id: string;
  source: string;
  key?: string;
  updated: string;
  event_ids?: string[];
}
export interface LearningEvent {
  id: string;
  seq: number;
  type: string;
  tree_id: string;
  node_id: string;
  content: string;
  at: string;
  content_version?: number;
  redacted?: boolean;
}
export interface Strategy {
  id: string;
  tree_id: string;
  content: string;
  reason: string;
  event_ids: string[];
  at: string;
}
export interface Settlement {
  id: string;
  tree_id: string;
  through: number;
  observations?: number;
  strategies?: number;
  at?: string;
}
export interface Tombstone {
  id: string;
  memory_id: string;
  event_ids: string[];
  text: string;
  at: string;
}
export interface LearningState {
  schema_version: number;
  trees: LearningTree[];
  memories: Memory[];
  events: LearningEvent[];
  tombstones: Tombstone[];
  strategies: Strategy[];
  tasks: LearningTask[];
  settlements: Settlement[];
  event_seq: number;
  memory_version: number;
  revision: number;
  semantic_revision: number;
  draft: { messages: Conversation[]; summary: IntakeResult | null };
}
export interface ModelSettings {
  provider: string;
  base_url: string;
  model: string;
  enabled: boolean;
  remember: boolean;
  test_status: "untested" | "passed" | "failed";
}
export interface PublicSettings extends ModelSettings {
  has_key: boolean;
  can_remember: boolean;
  notice?: string;
}
export interface AppDocument {
  state: LearningState;
  settings: ModelSettings;
  previous_state?: LearningState;
}
export interface Snapshot {
  state: LearningState;
  settings: PublicSettings;
}
export interface Archive {
  format: "zhizhi-personal-2";
  state: LearningState;
  exported_at: string;
}

interface ActionFields {
  configure: Partial<ModelSettings> & { key?: string; clear_key?: boolean };
  configure_test: Partial<ModelSettings> & {
    key?: string;
    clear_key?: boolean;
  };
  test_model: object;
  demo: object;
  clear_draft: object;
  draft_unsummarize: object;
  summarize: object;
  draft_message: { message: string };
  create_tree: {
    title: string;
    goal: string;
    preferences?: Preferences;
    notes?: string;
  };
  memory_add: { category?: string; content: string };
  memory_edit: { id: string; content: string };
  memory_delete: { id: string };
  delete_tree: { tree_id: string };
  preferences: { tree_id: string; goal: string; preferences: Preferences };
  refill: { tree_id: string; node_id?: string };
  visit: { tree_id: string; node_id: string };
  set_page: { tree_id: string; node_id: string; page: number };
  advance: { tree_id: string; node_id: string };
  status: { tree_id: string; node_id: string; status: NodeStatus };
  chat: { tree_id: string; node_id: string; card_id?: string; message: string };
  branch: { tree_id: string; node_id: string; title: string };
  link: {
    tree_id: string;
    node_id: string;
    other_tree_id: string;
    other_node_id: string;
  };
  image: { tree_id: string; node_id: string; card_id: string; image: string };
  material_add: { tree_id: string } & MaterialInput;
  material_remove: { tree_id: string; id: string };
  material_search: { tree_id: string; query: string };
  learning_options: {
    tree_id: string;
    auto_prepare: boolean;
    search_enabled: boolean;
  };
  feedback: { tree_id: string; node_id?: string; message: string };
  settle: { tree_id: string };
  strengthen: { tree_id: string; node_id: string };
  strengthen_answer: { tree_id: string; node_id: string; answer: string };
  revise_route: { tree_id: string; reason: string };
  accept_route: { tree_id: string; proposal_id: string };
  rollback_content: { tree_id: string; node_id: string };
  regenerate: { tree_id: string; node_id: string };
  import_archive: { archive: unknown; mode: "merge" | "replace" };
  restore_import: object;
  cancel_task: { id?: string };
}
export type ActionType = keyof ActionFields;
export type Action = {
  [K in ActionType]: {
    type: K;
    background?: boolean;
    tree_id?: string;
    node_id?: string;
  } & ActionFields[K];
}[ActionType];
export interface LearningTask {
  id: string;
  type: ActionType;
  tree_id: string;
  node_id: string;
  status:
    "queued" | "running" | "completed" | "failed" | "paused" | "cancelled";
  stage: string;
  payload: Action;
  at: string;
  error?: string;
}
export interface ActionResult {
  message?: string;
  tree_id?: string;
  node_id?: string;
  next_node_id?: string;
  assessment?: Assessment;
  settlement?: { observations: Memory[]; proposals: StrategyProposal[] };
}
export type ActionReply = ActionResult & Snapshot;

export interface StageResults {
  intake: IntakeResult;
  roadmap: RoadmapResult;
  knowledge: KnowledgeResult;
  "page-plan": PagePlan;
  cards: { cards: Array<Omit<Card, "id">> };
  quality: QualityResult;
  tutor: {
    answer: string;
    memories: Array<{ content: string; source: string }>;
  };
  settlement: {
    event_range: { after: number; through: number };
    observations: unknown[];
    strategy_proposals: StrategyProposal[];
  };
  reinforcement: { questions: Reinforcement["questions"] } | Assessment;
}
export type Stage = keyof StageResults;
export interface StageContext {
  [key: string]: unknown;
  memories?: Memory[];
  materials?: Material[];
  related_learning_records?: unknown[];
  nodes?: Array<{ id: string }>;
  node_id?: string;
  knowledge?: KnowledgeResult;
  event_range?: { after: number; through: number };
  events?: LearningEvent[];
  mode?: string;
}
export type Ask = <S extends Stage>(
  stage: S,
  context: StageContext,
) => Promise<StageResults[S]>;
export interface FeatureDependencies {
  ask: Ask;
  search: (query: string) => Promise<Material[]>;
  progress?: (label: string) => void;
}
export interface ModelPayload {
  model: string;
  messages: Array<{
    role: string;
    content: string | null;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  }>;
  tools: unknown[];
  tool_choice: string | { type: string; function: { name: string } };
  stream: boolean;
  max_tokens: number;
  thinking: { type: string };
}
export type ModelRequest = (
  payload: ModelPayload,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;
export interface RuntimeAudit {
  stage: Stage;
  requests: number;
  toolCalls: number;
  trace: string[];
  piVersion: string;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function requireThat(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}
export function record(value: unknown): Record<string, unknown> {
  requireThat(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "数据必须为对象",
  );
  return value as Record<string, unknown>;
}
export function list(value: unknown): unknown[] {
  requireThat(Array.isArray(value), "数据必须为数组");
  return value;
}
