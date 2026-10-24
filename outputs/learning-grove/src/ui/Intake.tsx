import { useState } from "react";
import type { Preferences } from "../contracts.ts";
import { Field, go, useLearning, value } from "./context.tsx";
import { Settings } from "./Dialogs.tsx";
export const preferenceLabels: Record<keyof Preferences, string> = {
  target: "完成标准",
  difficulty: "难度与起点",
  detail: "详细程度",
  style: "喜欢的讲解方式",
  guidance: "希望怎样引导",
};
export function Intake() {
  const { snapshot, act, busy, open } = useLearning(),
    [message, setMessage] = useState("");
  const draft = snapshot.state.draft,
    summary = draft.summary;
  async function summarize() {
    if (message.trim()) {
      const saved = await act({ type: "draft_message", message });
      if (!saved) return;
      setMessage("");
    }
    if (!snapshot.settings.enabled) {
      open(<Settings />, "模型设置");
      return;
    }
    await act({ type: "summarize" });
  }
  return (
    <div className="page intake">
      <p className="eyebrow">START WITH A QUESTION</p>
      <h1>这次，想弄明白什么？</h1>
      <p className="lead">
        说说想学的内容、用途和希望达到的程度。暂时不确定的地方，可以一起梳理。
      </p>
      {summary ? (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              preferences = Object.fromEntries(
                Object.keys(preferenceLabels).map((k) => [k, value(f, k)]),
              ) as Preferences;
            const notes =
              summary.questions
                .map(
                  (q, i) => q.question + "：" + (value(f, "q" + i) || "未补充"),
                )
                .join("\n") +
              "\n" +
              value(f, "notes");
            void act({
              type: "create_tree",
              title: value(f, "title"),
              goal: value(f, "goal"),
              preferences,
              notes,
            }).then(async (r) => {
              if (r?.tree_id) {
                go("tree/" + r.tree_id);
                await act({ type: "refill", tree_id: r.tree_id });
              }
            });
          }}
        >
          <h2>确认这次学习约定</h2>
          <Field
            label="学习主题"
            name="title"
            value={summary.title}
            maxLength={80}
          />
          <Field
            label="学习目标"
            name="goal"
            value={summary.goal}
            type="textarea"
            maxLength={900}
          />
          {(Object.keys(preferenceLabels) as Array<keyof Preferences>).map(
            (k) => (
              <Field
                key={k}
                label={preferenceLabels[k]}
                name={k}
                value={summary.preferences?.[k]}
                required={false}
                maxLength={500}
              />
            ),
          )}
          {summary.questions.map((q, i) => (
            <label className="field" key={q.question}>
              {q.question}
              {q.required ? "（开始前需要补充）" : "（可选）"}
              <textarea name={"q" + i} required={q.required} maxLength={1000} />
              {q.options.length > 0 && (
                <small>可以选择、组合或自行回答：{q.options.join(" / ")}</small>
              )}
            </label>
          ))}
          <Field
            label="其他补充"
            name="notes"
            type="textarea"
            value={summary.notes}
            required={false}
          />
          <div className="actions">
            <button className="primary" disabled={busy}>
              确认，建立学习路线
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void act({ type: "draft_unsummarize" });
              }}
            >
              返回继续补充
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="conversation">
            {draft.messages.map((m, i) => (
              <p className={"bubble " + m.role} key={i}>
                {m.content}
              </p>
            ))}
          </div>
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ type: "draft_message", message }).then((r) => {
                if (r) setMessage("");
              });
            }}
          >
            <label className="field">
              自由描述
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="例如：我想复习高中函数，为学习导数打基础。先讲定义，再给完整例子。"
                maxLength={4000}
              />
            </label>
            <div className="actions">
              <button disabled={busy || !message.trim()}>先记下这一段</button>
              <button
                type="button"
                className="primary"
                disabled={busy || (!message.trim() && !draft.messages.length)}
                onClick={() => {
                  void summarize();
                }}
              >
                我说完了，整理需求 →
              </button>
            </div>
            <p className="muted">
              先保存叙述，整理时才调用模型。必要时每轮补问一个关键问题。
            </p>
          </form>
        </>
      )}
      <button
        disabled={busy}
        onClick={() => {
          void act({ type: "demo" }).then((r) => {
            if (r?.tree_id) go("tree/" + r.tree_id);
          });
        }}
      >
        先体验高数演示树
      </button>
    </div>
  );
}
