import { useState } from "react";
import { errorMessage } from "../contracts.ts";
import type { LearningTree, Memory } from "../contracts.ts";
import { Field, go, useLearning, value } from "./context.tsx";
import { ImportArchive, Settings, Tasks } from "./Dialogs.tsx";

function TreeCard({ tree }: { tree: LearningTree }) {
  const read = tree.nodes.filter((n) =>
    ["read", "done"].includes(n.status),
  ).length;
  return (
    <a className="tree-card" href={"#tree/" + tree.id}>
      <span className="tree-art" aria-hidden="true">
        ♧
      </span>
      <span className="badge">{tree.demo ? "固定演示" : "个人学习"}</span>
      <h2>{tree.title}</h2>
      <p>{tree.goal}</p>
      <progress
        value={read}
        max={Math.max(1, tree.nodes.length)}
        aria-label="浏览进度"
      />
      <small>
        {read} / {tree.nodes.length} 节已浏览 · 阅读不等于掌握
      </small>
    </a>
  );
}
export function Home() {
  const { snapshot, act, open, busy } = useLearning();
  const recent = snapshot.state.trees.slice(0, 3);
  return (
    <div className="page home">
      <div className="eyebrow">YOUR PERSONAL LEARNING GROVE</div>
      <h1>
        让每一点好奇，
        <br />
        慢慢长成理解。
      </h1>
      <p className="lead">
        从一个想弄明白的问题开始。沿着自己的路线，读一点、问一点，再接着往前走。
      </p>
      <div className="hero-actions">
        <button className="primary" onClick={() => go("new")}>
          开始一段学习 ↗
        </button>
        <button
          disabled={busy}
          onClick={() => {
            void act({ type: "demo" }).then((r) => {
              if (r?.tree_id) go("tree/" + r.tree_id);
            });
          }}
        >
          体验高数演示树
        </button>
      </div>
      <section className="section-heading">
        <h2>继续生长</h2>
        <a href="#library">全部学习 →</a>
      </section>
      {recent.length ? (
        <div className="tree-grid">
          {recent.map((t) => (
            <TreeCard key={t.id} tree={t} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <span className="tree-art">♧</span>
          <h2>你的第一棵学习树</h2>
          <p>
            高中数学、高等数学，或者一个历史小问题。先明确范围，再从有依据的小节开始。
          </p>
        </div>
      )}
      <div className="panel compact">
        <h2>随时接着学</h2>
        <p className="muted">
          已保存内容可以离线阅读，阅读位置与个人记录保存在本机。
        </p>
        <div className="actions">
          <button onClick={() => open(<Tasks />, "任务与恢复")}>
            任务与恢复
          </button>
          <button onClick={() => open(<ImportArchive />, "导入学习档案")}>
            导入旧版档案
          </button>
        </div>
      </div>
    </div>
  );
}
export function Library() {
  const { snapshot } = useLearning();
  const [query, setQuery] = useState("");
  const trees = snapshot.state.trees.filter((t) =>
    (t.title + t.goal).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR LEARNING LIBRARY</p>
          <h1>学习库</h1>
        </div>
        <button className="primary" onClick={() => go("new")}>
          ＋ 新建学习
        </button>
      </div>
      <label className="field">
        搜索学习
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="主题、学习目标…"
        />
      </label>
      <div className="tree-grid">
        {trees.map((t) => (
          <TreeCard key={t.id} tree={t} />
        ))}
      </div>
      {!trees.length && <p className="empty">还没有对应的学习树。</p>}
    </div>
  );
}
function MemoryForm({ memory }: { memory?: Memory }) {
  const { act, close, busy } = useLearning();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void act(
          memory
            ? {
                type: "memory_edit",
                id: memory.id,
                content: value(f, "content"),
              }
            : {
                type: "memory_add",
                category: value(f, "category"),
                content: value(f, "content"),
              },
        ).then((r) => {
          if (r) close();
        });
      }}
    >
      {!memory && (
        <label className="field">
          分类
          <select name="category">
            {["个人背景", "长期目标", "兴趣与探索", "学习偏好"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      <Field
        label="希望助手记住什么"
        name="content"
        value={memory?.content}
        type="textarea"
        maxLength={900}
      />
      <button className="primary" disabled={busy}>
        保存记忆
      </button>
    </form>
  );
}
export function Profile() {
  const { snapshot, service, act, open, notify, busy } = useLearning();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("全部");
  const categories = [
    "全部",
    ...new Set(snapshot.state.memories.map((m) => m.category)),
  ];
  const memories = snapshot.state.memories
    .filter(
      (m) =>
        (category === "全部" || m.category === category) &&
        m.content.toLowerCase().includes(query.toLowerCase()),
    )
    .slice()
    .reverse();
  return (
    <div className="page">
      <p className="eyebrow">YOUR PERSONAL LEARNING MEMORY</p>
      <h1>关于你，也关于一路的学习。</h1>
      <p className="lead">目标、偏好和曾经的问题，保留来源，也随时可以纠正。</p>
      <div className="actions">
        <button onClick={() => open(<Settings />, "模型设置")}>模型设置</button>
        <button onClick={() => open(<MemoryForm />, "补充个人资料")}>
          ＋ 补充记忆
        </button>
        <button onClick={() => open(<ImportArchive />, "导入学习档案")}>
          导入档案
        </button>
        <button
          onClick={() => {
            void service.share().catch((e) => notify(errorMessage(e)));
          }}
        >
          导出档案
        </button>
        <button
          onClick={() => {
            if (confirm("恢复上一次导入前的档案？当前内容会成为新的恢复点。"))
              void act({ type: "restore_import" });
          }}
        >
          恢复导入前档案
        </button>
      </div>
      <label className="field">
        搜索个人记录
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="目标、偏好、学习经历…"
        />
      </label>
      <div className="chips">
        {categories.map((c) => (
          <button
            key={c}
            className={category === c ? "selected" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="memory-grid">
        {memories.map((m) => (
          <article className="panel" key={m.id}>
            <span className="badge">{m.category}</span>
            <p className="prose">{m.content}</p>
            <small>
              {m.source} · {m.updated?.slice(0, 10)}
            </small>
            <div className="actions">
              <button
                onClick={() => open(<MemoryForm memory={m} />, "修改记忆")}
              >
                修改
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm("删除这条记忆并排除关联证据？原对话保留供查看。"))
                    void act({ type: "memory_delete", id: m.id });
                }}
              >
                删除
              </button>
              {m.tree_id && (
                <a
                  href={
                    "#tree/" + m.tree_id + (m.node_id ? "/" + m.node_id : "")
                  }
                >
                  回到学习 →
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
      {!memories.length && (
        <p className="empty">还没有对应记录，可以先补充一条兴趣或目标。</p>
      )}
      <p className="muted">
        阅读经历与掌握证据分别保存。个人策略只用于相应情境，不会自动改写通用教学规则。
      </p>
    </div>
  );
}
