import { useEffect, useState } from "react";
import { errorMessage } from "../contracts.ts";
import type { LearningNode, LearningTree } from "../contracts.ts";
import { go, useLearning } from "./context.tsx";
import {
  BranchDialog,
  Evidence,
  Feedback,
  LinkDialog,
  Materials,
  PreferencesDialog,
  RouteDialog,
  Strengthen,
  Tasks,
} from "./Dialogs.tsx";
const statusLabel: Record<string, string> = {
  unseen: "未浏览",
  learning: "学习中",
  read: "已浏览",
  done: "已完成",
  skipped: "已跳过",
};
export function Reader({
  tree,
  node,
}: {
  tree: LearningTree;
  node: LearningNode;
}) {
  const { snapshot, act, open, busy, notify } = useLearning(),
    [showRoute, setShowRoute] = useState(false),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const card = node.cards[node.page || 0],
    context = tree.id + "/" + node.id + "/" + (card?.id || ""),
    reinforced =
      node.reinforcement?.passed &&
      node.reinforcement.version === node.content_version;
  useEffect(() => {
    if (tree.current_node_id !== node.id)
      void act({ type: "visit", tree_id: tree.id, node_id: node.id });
  }, [node.id]);
  const openNode = (id: string) => {
    void act({ type: "visit", tree_id: tree.id, node_id: id }).then((r) => {
      if (r) go(`tree/${tree.id}/${id}`);
    });
  };
  return (
    <div className="reader-page">
      <header className="reader-header">
        <a href="#library">← 学习库</a>
        <span className="badge">
          {tree.demo ? "固定演示" : statusLabel[node.status]}
        </span>
        <button onClick={() => setShowRoute((v) => !v)}>
          {showRoute ? "返回阅读" : "查看知识树"}
        </button>
      </header>
      <div className="reader-title">
        <p className="eyebrow">
          {tree.title} / {node.chapter}
        </p>
        <h1>{node.title}</h1>
        {reinforced && <span className="mastered-badge">🟠 加强已通过</span>}
        <p className="muted">{node.description}</p>
      </div>
      {showRoute ? (
        <section className="knowledge-tree" aria-label="知识树">
          {tree.nodes.map((n, i) => (
            <button
              key={n.id}
              className={
                "knowledge-node " +
                (["read", "done"].includes(n.status) ? "read " : "") +
                (n.reinforcement?.passed &&
                n.reinforcement.version === n.content_version
                  ? "reinforced "
                  : "") +
                (n.id === node.id ? "current" : "")
              }
              onClick={() => {
                openNode(n.id);
                setShowRoute(false);
              }}
            >
              <span className="node-dot">{i + 1}</span>
              <span>
                <small>{n.chapter}</small>
                <strong>{n.title}</strong>
                <small>
                  {statusLabel[n.status]}
                  {n.reinforcement?.passed &&
                  n.reinforcement.version === n.content_version
                    ? " · 加强通过"
                    : ""}
                </small>
              </span>
            </button>
          ))}
        </section>
      ) : (
        <>
          {node.ready && card ? (
            <article className="reading-card">
              <div className="card-meta">
                <span>{card.kind}</span>
                <span data-testid="reading-page">
                  {node.page + 1} / {node.cards.length}
                </span>
              </div>
              <h2>{card.title}</h2>
              <div className="prose card-body">{card.text}</div>
              {card.image && (
                <img src={card.image} alt="为当前卡片添加的个人笔记图片" />
              )}
              <div className="card-controls">
                <button
                  disabled={node.page === 0}
                  onClick={() => {
                    void act({
                      type: "set_page",
                      tree_id: tree.id,
                      node_id: node.id,
                      page: node.page - 1,
                    });
                  }}
                >
                  上一页
                </button>
                <div className="page-dots" aria-label="卡片页码">
                  {node.cards.map((c, i) => (
                    <button
                      key={c.id}
                      className={i === node.page ? "selected" : ""}
                      aria-label={"第" + (i + 1) + "页"}
                      onClick={() => {
                        void act({
                          type: "set_page",
                          tree_id: tree.id,
                          node_id: node.id,
                          page: i,
                        });
                      }}
                    />
                  ))}
                </div>
                {node.page < node.cards.length - 1 ? (
                  <button
                    onClick={() => {
                      void act({
                        type: "set_page",
                        tree_id: tree.id,
                        node_id: node.id,
                        page: node.page + 1,
                      });
                    }}
                  >
                    下一页 →
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => {
                      void act({
                        type: "advance",
                        tree_id: tree.id,
                        node_id: node.id,
                      }).then((r) => {
                        if (r?.next_node_id)
                          go(`tree/${tree.id}/${r.next_node_id}`);
                        else notify("本次路线已浏览完，可以回顾或自愿加强。");
                      });
                    }}
                  >
                    读完，继续 →
                  </button>
                )}
              </div>
            </article>
          ) : (
            <section className="panel empty">
              <h2>准备这个小节</h2>
              <p>先准备完整讲解，再按卡片阅读。资料不足时会说明缺口。</p>
              <div className="actions">
                <button
                  className="primary"
                  disabled={busy || tree.demo}
                  onClick={() => {
                    void act({
                      type: "refill",
                      tree_id: tree.id,
                      node_id: node.id,
                    });
                  }}
                >
                  准备本节内容
                </button>
                <button
                  onClick={() =>
                    open(<Materials treeId={tree.id} />, "学习资料")
                  }
                >
                  提供学习资料
                </button>
              </div>
            </section>
          )}
          {node.source_warning && (
            <p className="notice">{node.source_warning}</p>
          )}
          <details className="question-panel">
            <summary>有个地方想问问</summary>
            <p className="muted">
              围绕发问时的卡片回答，翻页不会自动清空你的问题。
            </p>
            <div className="conversation">
              {node.messages.map((message, i) => (
                <article className={"bubble " + message.role} key={i}>
                  <small>
                    {message.role === "user" ? "你" : "知枝"}
                    {message.card_title ? " · " + message.card_title : ""}
                  </small>
                  <p className="prose">{message.content}</p>
                </article>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const message = drafts[context] || "";
                void act({
                  type: "chat",
                  tree_id: tree.id,
                  node_id: node.id,
                  card_id: card?.id,
                  message,
                }).then((r) => {
                  if (r) setDrafts((old) => ({ ...old, [context]: "" }));
                });
              }}
            >
              <label className="field">
                针对当前卡片提问
                <textarea
                  value={drafts[context] || ""}
                  onChange={(e) =>
                    setDrafts((old) => ({ ...old, [context]: e.target.value }))
                  }
                  maxLength={4000}
                  required
                  placeholder="例如：能不能换个数字例子？"
                />
              </label>
              <button className="primary" disabled={busy}>
                发送问题
              </button>
            </form>
          </details>
        </>
      )}
      <section className="learning-tools">
        <button
          onClick={() => open(<Materials treeId={tree.id} />, "学习资料")}
        >
          学习资料 · {tree.materials.length}
        </button>
        <button
          onClick={() =>
            open(<Feedback treeId={tree.id} nodeId={node.id} />, "调整后续讲法")
          }
        >
          调整讲法
        </button>
        <button
          disabled={busy}
          onClick={() => {
            void act({ type: "settle", tree_id: tree.id }).then((r) => {
              if (r) notify(r.message || "本次学习已整理");
            });
          }}
        >
          结束本次学习
        </button>
        <button onClick={() => open(<Tasks />, "生成任务")}>生成任务</button>
        <button
          onClick={() => open(<RouteDialog treeId={tree.id} />, "调整学习路线")}
        >
          调整路线
        </button>
        {node.ready && (
          <>
            <button
              disabled={busy}
              onClick={() => {
                void (async () => {
                  if (
                    !node.reinforcement ||
                    node.reinforcement.version !== node.content_version
                  ) {
                    const reply = await act({
                      type: "strengthen",
                      tree_id: tree.id,
                      node_id: node.id,
                    });
                    if (!reply) return;
                  }
                  open(
                    <Strengthen treeId={tree.id} nodeId={node.id} />,
                    "自愿加强 · " + node.title,
                  );
                })();
              }}
            >
              {reinforced ? "🟠 已通过加强检查" : "自愿加强学习"}
            </button>
            <button
              onClick={() =>
                open(
                  <Evidence treeId={tree.id} nodeId={node.id} />,
                  "内容依据与版本",
                )
              }
            >
              内容依据
            </button>
            <button
              disabled={busy || tree.demo}
              onClick={() => {
                if (confirm("按当前资料重新生成本节？成功后保留上一版。"))
                  void act({
                    type: "regenerate",
                    tree_id: tree.id,
                    node_id: node.id,
                  });
              }}
            >
              重新生成
            </button>
            {!!node.content_history?.length && (
              <button
                disabled={busy}
                onClick={() => {
                  void act({
                    type: "rollback_content",
                    tree_id: tree.id,
                    node_id: node.id,
                  });
                }}
              >
                恢复上一版
              </button>
            )}
          </>
        )}
      </section>
      <details className="panel">
        <summary>学习约定与更多操作</summary>
        <p>{tree.goal}</p>
        <p className="muted">{tree.description}</p>
        <div className="actions">
          <button
            onClick={() =>
              open(<PreferencesDialog tree={tree} />, "调整学习约定")
            }
          >
            调整学习约定
          </button>
          <button
            onClick={() =>
              open(<BranchDialog tree={tree} node={node} />, "探索支线")
            }
          >
            添加探索支线
          </button>
          <button
            onClick={() =>
              open(<LinkDialog tree={tree} node={node} />, "关联以前的学习")
            }
          >
            关联旧知识
          </button>
          <button
            disabled={busy}
            onClick={() => {
              void act({
                type: "status",
                tree_id: tree.id,
                node_id: node.id,
                status: "skipped",
              }).then((r) => {
                if (r) {
                  const next = tree.nodes[tree.nodes.indexOf(node) + 1];
                  if (next) openNode(next.id);
                }
              });
            }}
          >
            跳过本节
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (confirm("删除整棵学习树及其问答和关联记忆？可以先导出备份。"))
                void act({ type: "delete_tree", tree_id: tree.id }).then(
                  (r) => {
                    if (r) go("home");
                  },
                );
            }}
          >
            删除学习树
          </button>
        </div>
        {card && (
          <label className="field">
            添加当前卡片的笔记图片（1MB以内）
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 1000000) {
                  notify("单张图片请小于1MB");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  void act({
                    type: "image",
                    tree_id: tree.id,
                    node_id: node.id,
                    card_id: card.id,
                    image: String(reader.result),
                  });
                };
                reader.onerror = () => notify("图片读取失败");
                reader.readAsDataURL(file);
              }}
            />
          </label>
        )}
        {card?.image && (
          <button
            onClick={() => {
              void act({
                type: "image",
                tree_id: tree.id,
                node_id: node.id,
                card_id: card.id,
                image: "",
              });
            }}
          >
            移除笔记图片
          </button>
        )}
        {node.links.map((link) => (
          <p key={link.tree_id + link.node_id}>
            <a href={`#tree/${link.tree_id}/${link.node_id}`}>
              关联：
              {snapshot.state.trees
                .find((t) => t.id === link.tree_id)
                ?.nodes.find((n) => n.id === link.node_id)?.title ||
                "旧知识"}{" "}
              ↗
            </a>
          </p>
        ))}
      </details>
    </div>
  );
}
