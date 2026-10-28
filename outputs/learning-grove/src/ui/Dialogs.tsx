import { useState } from "react";
import { errorMessage } from "../contracts.ts";
import type { LearningNode, LearningTree, Preferences } from "../contracts.ts";
import { Field, go, useLearning, value } from "./context.tsx";
import { preferenceLabels } from "./Intake.tsx";

const testLabels = { untested: "未测试", passed: "已通过", failed: "失败" };

export function Settings() {
  const { snapshot, service, busy } = useLearning(),
    [key, setKey] = useState(""),
    [result, setResult] = useState(""),
    [saving, setSaving] = useState(false);
  const settings = snapshot.settings;
  return (
    <>
      <p>
        模型推理需要联网，学习档案保存在本机。Android 中的 Key 由系统 Keystore
        加密保存。
      </p>
      {settings.notice && <p className="notice">{settings.notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            submitter = (e.nativeEvent as SubmitEvent).submitter;
          const test =
            !(submitter instanceof HTMLButtonElement) ||
            submitter.value !== "save";
          setResult(test ? "正在保存并测试…" : "正在保存…");
          setSaving(true);
          // The toast sits under this modal, so failures are shown inline.
          service
            .dispatch({
              type: test ? "configure_test" : "configure",
              key,
              model: value(f, "model"),
              base_url: "https://api.deepseek.com",
              enabled: f.has("enabled"),
              clear_key: f.has("clear_key"),
            })
            .then(
              (r) => setResult(r.message || "设置已保存。"),
              (error) =>
                setResult(
                  "连接未完成：" + errorMessage(error) + " 设置已保留。",
                ),
            )
            .finally(() => {
              setKey("");
              setSaving(false);
            });
        }}
      >
        <label className="field">
          DeepSeek API Key {settings.has_key ? "（已有密钥，留空保留）" : ""}
          <input
            name="key"
            type="password"
            value={key}
            disabled={!settings.can_remember}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <Field
          label="模型名称"
          name="model"
          value={settings.model}
          maxLength={100}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.enabled || !settings.has_key}
          />
          启用模型
        </label>
        <label className="checkbox">
          <input type="checkbox" name="clear_key" />
          清除已有密钥
        </label>
        <p className="muted">
          地址：https://api.deepseek.com · 密钥不包含在学习档案中
        </p>
        <p role="status">
          {result || "连接状态：" + testLabels[settings.test_status]}
        </p>
        <div className="actions">
          <button
            className="primary"
            disabled={busy || saving || !settings.can_remember}
            value="test"
          >
            保存并测试连接
          </button>
          <button disabled={busy || saving} value="save">
            仅保存
          </button>
        </div>
      </form>
      <a
        href="https://platform.deepseek.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        前往 DeepSeek 开放平台 ↗
      </a>
    </>
  );
}
export function Tasks() {
  const { snapshot, act, close } = useLearning();
  const labels: Record<string, string> = {
    refill: "准备小节",
    regenerate: "重写小节",
    settle: "整理经历",
    material_search: "检索资料",
    strengthen: "准备加强问题",
    strengthen_answer: "解释回答",
    create_tree: "规划路线",
    summarize: "整理需求",
    chat: "回答问题",
    revise_route: "调整路线",
  };
  const status: Record<string, string> = {
    completed: "已完成",
    failed: "失败，可重试",
    paused: "中断，可继续",
    running: "进行中",
    queued: "排队中",
    cancelled: "已取消",
  };
  return (
    <>
      <p className="muted">已提交内容会保留；中断任务由你选择重新开始。</p>
      {snapshot.state.tasks
        .slice()
        .reverse()
        .map((task) => (
          <article className="task-row" key={task.id}>
            <h3>
              {labels[task.type] || "学习任务"}{" "}
              <small>{status[task.status]}</small>
            </h3>
            <p>{task.stage}</p>
            {task.error && <p className="error">{task.error}</p>}
            {["running", "queued"].includes(task.status) ? (
              <button
                onClick={() => {
                  void act({ type: "cancel_task", id: task.id });
                }}
              >
                停止
              </button>
            ) : ["failed", "paused", "cancelled"].includes(task.status) ? (
              <button
                onClick={() => {
                  close();
                  void act({ ...task.payload, background: false });
                }}
              >
                重新开始
              </button>
            ) : null}
          </article>
        ))}
      {!snapshot.state.tasks.length && <p>没有生成任务。</p>}
    </>
  );
}
export function ImportArchive() {
  const { act, close, notify, busy } = useLearning();
  return (
    <>
      <p>
        支持旧版与当前版 JSON
        档案。合并会建立独立副本；替换会保留本机恢复点。密钥不随档案导入。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void (async () => {
            try {
              const file = f.get("archive");
              if (!(file instanceof File) || !file.size)
                throw Error("请选择档案文件");
              if (file.size > 25000000) throw Error("档案超过25MB，请分批整理");
              const mode = value(f, "mode") === "replace" ? "replace" : "merge";
              if (
                mode === "replace" &&
                !confirm("确认替换当前学习档案？会保留恢复点。")
              )
                return;
              const archive: unknown = JSON.parse(await file.text());
              const r = await act({ type: "import_archive", archive, mode });
              if (r) {
                close();
                go("home");
              }
            } catch (error) {
              notify(errorMessage(error));
            }
          })();
        }}
      >
        <label className="field">
          档案文件
          <input
            type="file"
            name="archive"
            accept=".json,application/json"
            required
          />
        </label>
        <label className="field">
          处理方式
          <select name="mode">
            <option value="merge">合并为独立副本</option>
            <option value="replace">替换当前档案</option>
          </select>
        </label>
        <button className="primary" disabled={busy}>
          检查并导入
        </button>
      </form>
    </>
  );
}
function MaterialForm({ tree }: { tree: LearningTree }) {
  const { act, notify, busy } = useLearning(),
    [title, setTitle] = useState(""),
    [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void act({
          type: "material_add",
          tree_id: tree.id,
          title,
          text,
          location: value(f, "location"),
          url: value(f, "url"),
        }).then((r) => {
          if (r) {
            setTitle("");
            setText("");
          }
        });
      }}
    >
      <label className="field">
        材料标题
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={160}
        />
      </label>
      <Field
        label="来源位置（书名、章节或页码）"
        name="location"
        required={false}
        maxLength={300}
      />
      <Field
        label="来源链接（可选 HTTPS）"
        name="url"
        type="url"
        required={false}
      />
      <label className="field">
        正文
        <textarea
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={24000}
        />
      </label>
      <label className="field">
        从 TXT / Markdown 文件读取
        <input
          type="file"
          accept=".txt,.md,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 100000) {
              notify("文字文件太大，请选取所需章节");
              return;
            }
            void file
              .text()
              .then((content) => {
                setText(content.slice(0, 24000));
                if (!title) setTitle(file.name);
              })
              .catch((error) => notify(errorMessage(error)));
          }}
        />
      </label>
      <button className="primary" disabled={busy}>
        保存材料
      </button>
    </form>
  );
}
export function Materials({ treeId }: { treeId: string }) {
  const { snapshot, act, busy } = useLearning();
  const tree = snapshot.state.trees.find((t) => t.id === treeId);
  if (!tree) return <p>学习树已移除。</p>;
  return (
    <>
      <p className="muted">
        粘贴指定教材片段，或检索有限的百科摘要。材料保留出处，核心依据不足时会暂停生成。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act({
            type: "material_search",
            tree_id: tree.id,
            query: value(f, "query"),
          });
        }}
      >
        <Field
          label="检索关键词"
          name="query"
          value={tree.title}
          maxLength={160}
        />
        <button disabled={busy}>检索并保存百科摘要</button>
      </form>
      <details>
        <summary>粘贴 / 导入文字材料</summary>
        <MaterialForm tree={tree} />
      </details>
      <div className="material-list">
        {tree.materials.map((m) => (
          <article className="panel" key={m.id}>
            <h3>{m.title}</h3>
            <p className="muted">
              {m.location} · {m.license}
            </p>
            <details>
              <summary>查看正文</summary>
              <p className="prose">{m.text}</p>
            </details>
            {m.url && (
              <a href={m.url} target="_blank" rel="noopener noreferrer">
                原文 ↗
              </a>
            )}
            <button
              disabled={busy}
              onClick={() => {
                if (confirm("移除材料？相关旧内容会标记待核验。"))
                  void act({
                    type: "material_remove",
                    tree_id: tree.id,
                    id: m.id,
                  });
              }}
            >
              移除
            </button>
          </article>
        ))}
      </div>
      <form
        key={tree.id}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act({
            type: "learning_options",
            tree_id: tree.id,
            auto_prepare: f.has("auto_prepare"),
            search_enabled: f.has("search_enabled"),
          });
        }}
      >
        <label className="checkbox">
          <input
            type="checkbox"
            name="auto_prepare"
            defaultChecked={tree.auto_prepare}
          />
          阅读时准备下一节
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="search_enabled"
            defaultChecked={tree.search_enabled}
          />
          缺少材料时检索百科
        </label>
        <button disabled={busy}>保存选项</button>
      </form>
    </>
  );
}
export function Feedback({
  treeId,
  nodeId,
}: {
  treeId: string;
  nodeId: string;
}) {
  const { act, close, busy } = useLearning();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void act({
          type: "feedback",
          tree_id: treeId,
          node_id: nodeId,
          message: value(f, "message"),
        }).then((r) => {
          if (r) close();
        });
      }}
    >
      <p>
        例如“保留完整计算过程”“例子联系游戏开发”。明确要求用于相关后续讲解。
      </p>
      <Field
        label="希望怎么调整"
        name="message"
        type="textarea"
        maxLength={1000}
      />
      <button className="primary" disabled={busy}>
        记下并应用到后续内容
      </button>
    </form>
  );
}
export function Strengthen({
  treeId,
  nodeId,
}: {
  treeId: string;
  nodeId: string;
}) {
  const { snapshot, act, busy } = useLearning();
  const node = snapshot.state.trees
      .find((t) => t.id === treeId)
      ?.nodes.find((n) => n.id === nodeId),
    practice = node?.reinforcement,
    q = practice?.questions[0],
    last = practice?.attempts.at(-1);
  if (!q || !node) return <p>加强内容未准备好。</p>;
  return (
    <>
      <p className="muted">独立练习，随时关闭继续阅读。</p>
      <h3>{q.question}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          void act({
            type: "strengthen_answer",
            tree_id: treeId,
            node_id: nodeId,
            answer: value(f, "answer"),
          }).then((r) => {
            if (r) form.reset();
          });
        }}
      >
        <Field
          label="你的想法"
          name="answer"
          type="textarea"
          maxLength={4000}
        />
        <button className="primary" disabled={busy}>
          看看解释
        </button>
      </form>
      {last && (
        <section className="assessment">
          <h3>{last.passed ? "这次检查通过了" : "可以参考这个解释"}</h3>
          <p className="prose">{last.explanation}</p>
          <p className="muted">{last.evidence}</p>
          {!last.passed && practice?.passed && (
            <p>本次有待巩固，此前同版本的通过记录仍保留。</p>
          )}
        </section>
      )}
    </>
  );
}
export function Evidence({
  treeId,
  nodeId,
}: {
  treeId: string;
  nodeId: string;
}) {
  const { snapshot, open } = useLearning(),
    tree = snapshot.state.trees.find((t) => t.id === treeId),
    node = tree?.nodes.find((n) => n.id === nodeId);
  if (!node) return <p>节点已移除。</p>;
  return (
    <>
      <p>
        内容版本 {node.content_version} ·{" "}
        {node.generated_at || "固定示例 / 历史内容"}
      </p>
      <p className="notice">
        {node.source_warning ||
          (node.quality?.decision === "pass"
            ? "已通过 AI 内容检查，重要内容仍需核对。"
            : "固定示例或历史内容，未走新版质检链。")}
      </p>
      {node.knowledge?.claims.map((c) => (
        <article key={c.id}>
          <p>{c.text}</p>
          <small>
            依据：
            {c.material_ids
              .map(
                (id) =>
                  tree?.materials.find((m) => m.id === id)?.title || "已移除",
              )
              .join("、")}
          </small>
        </article>
      ))}
      <button onClick={() => open(<Materials treeId={treeId} />, "学习资料")}>
        查看资料正文
      </button>
    </>
  );
}
export function RouteDialog({ treeId }: { treeId: string }) {
  const { snapshot, act, close, busy } = useLearning(),
    tree = snapshot.state.trees.find((t) => t.id === treeId);
  if (!tree) return <p>学习树已移除。</p>;
  return (
    <>
      <p>先生成建议，由你确认后应用。已有节点和问答保留。</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act({
            type: "revise_route",
            tree_id: treeId,
            reason: value(f, "reason"),
          });
        }}
      >
        <Field
          label="想怎样调整路线"
          name="reason"
          type="textarea"
          maxLength={1000}
        />
        <button disabled={busy}>生成建议</button>
      </form>
      {tree.route_proposal && (
        <section className="panel">
          <h3>建议路线</h3>
          <p>{tree.route_proposal.result.description}</p>
          {tree.route_proposal.result.chapters.map((c, i) => (
            <div key={i}>
              <h4>{c.title}</h4>
              <p>{c.nodes.map((n) => n.title).join(" → ")}</p>
            </div>
          ))}
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              void act({
                type: "accept_route",
                tree_id: treeId,
                proposal_id: tree.route_proposal!.id,
              }).then((r) => {
                if (r) close();
              });
            }}
          >
            确认应用这条路线
          </button>
        </section>
      )}
    </>
  );
}
export function PreferencesDialog({ tree }: { tree: LearningTree }) {
  const { act, close, busy } = useLearning();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          preferences = Object.fromEntries(
            Object.keys(preferenceLabels).map((k) => [k, value(f, k)]),
          ) as Preferences;
        void act({
          type: "preferences",
          tree_id: tree.id,
          goal: value(f, "goal"),
          preferences,
        }).then((r) => {
          if (r) close();
        });
      }}
    >
      <Field
        label="学习目标"
        name="goal"
        value={tree.goal}
        type="textarea"
        maxLength={900}
      />
      {(Object.keys(preferenceLabels) as Array<keyof Preferences>).map((k) => (
        <Field
          key={k}
          label={preferenceLabels[k]}
          name={k}
          value={tree.preferences[k]}
          required={false}
          maxLength={500}
        />
      ))}
      <p className="muted">约定用于后续生成；已有内容和记录保留。</p>
      <button className="primary" disabled={busy}>
        保存调整
      </button>
    </form>
  );
}
export function BranchDialog({
  tree,
  node,
}: {
  tree: LearningTree;
  node: LearningNode;
}) {
  const { act, close, busy } = useLearning();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act({
          type: "branch",
          tree_id: tree.id,
          node_id: node.id,
          title: value(new FormData(e.currentTarget), "title"),
        }).then((r) => {
          if (r?.node_id) {
            close();
            go(`tree/${tree.id}/${r.node_id}`);
          }
        });
      }}
    >
      <p>从「{node.title}」长出一条探索支线。</p>
      <Field label="想继续探索什么" name="title" maxLength={60} />
      <button className="primary" disabled={busy}>
        加入探索分支
      </button>
    </form>
  );
}
export function LinkDialog({
  tree,
  node,
}: {
  tree: LearningTree;
  node: LearningNode;
}) {
  const { snapshot, act, close, busy } = useLearning(),
    others = snapshot.state.trees.filter((t) => t.id !== tree.id);
  if (!others.length) return <p>建立另一棵学习树后，可以连接相关知识。</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const [other_tree_id, other_node_id] = value(
          new FormData(e.currentTarget),
          "target",
        ).split("/");
        void act({
          type: "link",
          tree_id: tree.id,
          node_id: node.id,
          other_tree_id,
          other_node_id,
        }).then((r) => {
          if (r) close();
        });
      }}
    >
      <label className="field">
        选择旧知识
        <select name="target">
          {others.map((t) => (
            <optgroup label={t.title} key={t.id}>
              {t.nodes.map((n) => (
                <option key={n.id} value={t.id + "/" + n.id}>
                  {n.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button disabled={busy}>建立关联</button>
    </form>
  );
}
