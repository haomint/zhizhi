import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { errorMessage } from "../contracts.ts";
import type { Action, Snapshot } from "../contracts.ts";
import type { LearningService } from "../application/service.ts";
import { LearningContext, go } from "./context.tsx";
import { Home, Library, Profile } from "./Library.tsx";
import { Intake } from "./Intake.tsx";
import { Reader } from "./Reader.tsx";
import { Settings, Tasks, ImportArchive } from "./Dialogs.tsx";

export function App({ service }: { service: LearningService }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [failure, setFailure] = useState(""),
    [route, setRoute] = useState(window.location.hash.slice(1) || "home");
  const [pending, setPending] = useState(0),
    [toast, setToast] = useState(""),
    [dialog, setDialog] = useState<{
      title: string;
      content: ReactNode;
    } | null>(null);
  const modal = useRef<HTMLDialogElement>(null),
    lastTree = useRef(""),
    attempted = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    const unsubscribe = service.subscribe((next) => {
      if (alive) setSnapshot(next);
    });
    void service
      .read()
      .then((next) => {
        if (alive) setSnapshot(next);
      })
      .catch((error) => {
        if (alive) setFailure(errorMessage(error));
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [service]);
  useEffect(() => {
    const change = () => {
      setRoute(window.location.hash.slice(1) || "home");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (dialog && !modal.current?.open) modal.current?.showModal();
    if (!dialog && modal.current?.open) modal.current.close();
  }, [dialog]);
  const notify = useCallback((message: string) => setToast(message), []);
  const act = useCallback(
    async (action: Action) => {
      if (!action.background) setPending((n) => n + 1);
      try {
        const reply = await service.dispatch(action);
        if (reply.message && !action.background) notify(reply.message);
        return reply;
      } catch (error) {
        notify(errorMessage(error));
        return undefined;
      } finally {
        if (!action.background) setPending((n) => n - 1);
      }
    },
    [service, notify],
  );
  const open = useCallback(
      (content: ReactNode, title: string) => setDialog({ title, content }),
      [],
    ),
    close = useCallback(() => setDialog(null), []);
  const parts = route.split("/"),
    tree = snapshot?.state.trees.find((t) => t.id === parts[1]),
    node =
      tree?.nodes.find((n) => n.id === (parts[2] || tree.current_node_id)) ||
      tree?.nodes[0];
  const treeId = tree?.id || "",
    nodeId = node?.id || "",
    contract = tree?.contract_version,
    materials = tree?.material_version,
    strategy = tree?.strategy_version;
  useEffect(() => {
    if (
      !tree ||
      !node?.ready ||
      tree.demo ||
      !tree.auto_prepare ||
      !snapshot?.settings.enabled
    )
      return;
    const next = tree.nodes
      .slice(tree.nodes.indexOf(node) + 1)
      .find((n) => n.status !== "skipped");
    if (!next || (next.ready && !next.needs_refresh)) return;
    const key = [tree.id, next.id, contract, materials, strategy].join("/");
    if (attempted.current.has(key)) return;
    const timer = setTimeout(() => {
      attempted.current.add(key);
      void act({
        type: "refill",
        tree_id: tree.id,
        node_id: next.id,
        background: true,
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [
    treeId,
    nodeId,
    contract,
    materials,
    strategy,
    node?.ready,
    tree?.auto_prepare,
    snapshot?.settings.enabled,
    act,
  ]);
  useEffect(() => {
    const previous = lastTree.current;
    lastTree.current = treeId;
    if (previous && !treeId && snapshot) {
      const old = snapshot.state.trees.find((t) => t.id === previous);
      if (
        old &&
        (old.demo || snapshot.settings.enabled) &&
        snapshot.state.events.some(
          (e) =>
            e.tree_id === previous &&
            e.seq > old.settled_through &&
            !e.redacted,
        )
      )
        void act({ type: "settle", tree_id: previous, background: true });
    }
  }, [treeId, act]);
  if (!snapshot)
    return (
      <main className="boot">
        <span className="brand">知枝</span>
        <p role="status">{failure || "正在打开你的学习空间…"}</p>
        {failure && (
          <button onClick={() => window.location.reload()}>重新打开</button>
        )}
      </main>
    );
  const running = snapshot.state.tasks.find((t) => t.status === "running"),
    context = {
      snapshot,
      service,
      busy: pending > 0,
      act,
      notify,
      open,
      close,
    };
  return (
    <LearningContext.Provider value={context}>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#home">
            <span className="brand-mark">♧</span>
            <span>
              知枝<small>LEARNING GROVE</small>
            </span>
          </a>
          <button className="primary" onClick={() => go("new")}>
            ＋ 开始一段学习
          </button>
          <nav>
            <a className={parts[0] === "home" ? "active" : ""} href="#home">
              学习空间
            </a>
            <a
              className={parts[0] === "library" ? "active" : ""}
              href="#library"
            >
              学习库 <b>{snapshot.state.trees.length}</b>
            </a>
            <a
              className={
                ["profile", "memories"].includes(parts[0]) ? "active" : ""
              }
              href="#profile"
            >
              个人资料 <b>{snapshot.state.memories.length}</b>
            </a>
          </nav>
          <p className="eyebrow">正在生长</p>
          <div className="tree-nav">
            {snapshot.state.trees.map((t) => (
              <a
                key={t.id}
                className={tree?.id === t.id ? "active" : ""}
                href={"#tree/" + t.id}
              >
                {t.title}
                <small>
                  {
                    t.nodes.filter((n) => ["read", "done"].includes(n.status))
                      .length
                  }{" "}
                  / {t.nodes.length} 节已浏览
                </small>
              </a>
            ))}
          </div>
          <footer>
            <p>● 个人空间 · 保存在本机</p>
            <button onClick={() => open(<Settings />, "模型设置")}>
              模型设置
            </button>
            <button
              onClick={() => {
                void service
                  .share()
                  .then(() => notify("已导出学习档案，不含密钥。"))
                  .catch((e) => notify(errorMessage(e)));
              }}
            >
              导出学习档案
            </button>
            <small>知枝 / 1.1</small>
          </footer>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <a className="mobile-brand" href="#home">
              知枝
            </a>
            <span>
              {tree?.title ||
                {
                  home: "学习空间",
                  library: "学习库",
                  new: "开始一段学习",
                  profile: "个人",
                  memories: "个人资料库",
                }[parts[0] as "home"] ||
                "学习空间"}
            </span>
            <button
              className={"badge " + (snapshot.settings.enabled ? "live" : "")}
              onClick={() => open(<Settings />, "模型设置")}
            >
              {snapshot.settings.enabled ? "模型已连接" : "本地 / 演示"}
            </button>
          </header>
          <main id="main">
            {parts[0] === "new" ? (
              <Intake />
            ) : parts[0] === "library" ? (
              <Library />
            ) : ["profile", "memories"].includes(parts[0]) ? (
              <Profile />
            ) : parts[0] === "tree" ? (
              tree && node ? (
                <Reader tree={tree} node={node} />
              ) : (
                <section className="panel">
                  <h1>没有找到学习节点</h1>
                  <a href="#home">回到学习空间</a>
                </section>
              )
            ) : (
              <Home />
            )}
          </main>
          <nav className="mobile-nav">
            <a href="#home">学习空间</a>
            <a href="#library">学习库</a>
            <a href="#profile">个人</a>
          </nav>
        </div>
        {running && (
          <aside className="generation-status" role="status">
            <span>{running.stage}… 已保存内容可以继续阅读</span>
            <button
              onClick={() => {
                void act({ type: "cancel_task", id: running.id });
              }}
            >
              停止
            </button>
            <button onClick={() => open(<Tasks />, "任务与恢复")}>
              查看任务
            </button>
          </aside>
        )}
        <dialog
          ref={modal}
          onCancel={close}
          onClick={(event) => {
            if (event.target === modal.current) close();
          }}
        >
          <div className="dialog-head">
            <h2>{dialog?.title}</h2>
            <button aria-label="关闭弹窗" onClick={close}>
              ×
            </button>
          </div>
          {dialog?.content}
        </dialog>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </LearningContext.Provider>
  );
}
