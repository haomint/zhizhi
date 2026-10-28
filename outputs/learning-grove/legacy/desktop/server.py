"""Learning Grove: a local, single-user learning assistant. Python standard library only."""
from __future__ import annotations

import argparse
import base64
import hmac
import json
import os
import re
import socket
import sqlite3
import threading
import uuid
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from model_service import ModelClient
from runtime_info import VERSION, project_id

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get("GROVE_DATA_DIR", str(ROOT / "data"))) / "grove.sqlite3"
LOCK = threading.RLock()
MODEL = ModelClient(DB.parent)
CONFIG = MODEL.config
PROJECT_ID = project_id(ROOT, DB.parent)


def uid():
    return uuid.uuid4().hex[:12]


def now():
    return datetime.now(timezone.utc).isoformat()


def clean(value, limit=4000):
    return str(value or "").strip()[:limit]


def initial_state():
    return {"trees": [], "memories": [], "draft": {"messages": [], "summary": None}, "revision": 0}


def related_learning(state, tree, node, current_card, message):
    """Retrieve bounded, source-labelled conversations without altering stored memory."""
    compact = re.sub(r"\s+", "", message.lower())
    terms = set(re.findall(r"[a-z0-9]{2,}", compact))
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", compact))
    terms.update(chinese[i:i+2] for i in range(len(chinese)-1))
    target_card = ""
    match = re.search(r"第([一二三四五六七八九十]|\d+)(?:个|张|页)", message)
    if match:
        word = match.group(1)
        ordinal = int(word) if word.isdigit() else "一二三四五六七八九十".index(word) + 1
        if 0 < ordinal <= len(node["cards"]):
            target_card = node["cards"][ordinal-1]["id"]
    elif any(word in message for word in ("前一张", "上一张", "上一页")) and current_card:
        index = next((i for i,c in enumerate(node["cards"]) if c["id"] == current_card["id"]), 0)
        if index:
            target_card = node["cards"][index-1]["id"]
    candidates = []
    for other_tree in state["trees"]:
        for other_node in other_tree["nodes"]:
            history = other_node.get("messages", [])
            for i, item in enumerate(history):
                if item.get("role") != "user":
                    continue
                pair = history[i:i+2] if i+1 < len(history) and history[i+1].get("role") == "assistant" else [item]
                text = (other_node["title"] + item.get("card_title", "") + "".join(x["content"] for x in pair)).lower()
                score = sum(1 for term in terms if term in text)
                same_node = other_node["id"] == node["id"] and other_tree["id"] == tree["id"]
                if same_node:
                    score += 3
                if target_card and same_node and item.get("card_id") == target_card:
                    score += 100
                if score > (0 if same_node else 2):
                    candidates.append((score, item.get("at", ""), {"tree_id": other_tree["id"], "tree_title": other_tree["title"],
                        "node_id": other_node["id"], "node_title": other_node["title"], "card_id": item.get("card_id", ""),
                        "card_title": item.get("card_title", "旧版未关联卡片的交流"),
                        "messages": [{"role": x["role"], "content": x["content"][:1800]} for x in pair]}))
    candidates.sort(key=lambda x:(x[0], x[1]), reverse=True)
    return [item[2] for item in candidates[:8]]


def load():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB)) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, document TEXT NOT NULL)")
        row = db.execute("SELECT document FROM state WHERE id=1").fetchone()
        return json.loads(row[0]) if row else initial_state()


def save(state):
    state["revision"] += 1
    with closing(sqlite3.connect(DB)) as db, db:
        db.execute("INSERT OR REPLACE INTO state VALUES (1, ?)", (json.dumps(state, ensure_ascii=False),))


def settings():
    return MODEL.public()


def require_text(value, label="内容", limit=4000):
    text = clean(value, limit)
    if not text:
        raise ValueError(f"请填写{label}。")
    return text


def ask(skill, context):
    """Use provider JSON mode; a connection probe does not depend on this parser."""
    prompt = (ROOT / "skills" / f"{skill}.md").read_text(encoding="utf-8")
    return MODEL.structured(prompt, context, max_tokens={"intake": 2200, "roadmap": 4200, "cards": 6500, "tutor": 2600}[skill])


def memory(state, category, content, tree_id="", node_id="", source="用户明确表达", key=""):
    content = clean(content, 900)
    if not content:
        return
    old = next((m for m in state["memories"] if key and m.get("key") == key), None)
    entry = {"id": old["id"] if old else uid(), "category": category, "content": content,
             "tree_id": tree_id, "node_id": node_id, "source": source, "key": key, "updated": now()}
    if old:
        state["memories"][state["memories"].index(old)] = entry
    else:
        state["memories"].append(entry)


def find_tree(state, tree_id):
    tree = next((t for t in state["trees"] if t["id"] == tree_id), None)
    if tree is None:
        raise ValueError("找不到这棵学习树。")
    return tree


def find_node(tree, node_id):
    node = next((n for n in tree["nodes"] if n["id"] == node_id), None)
    if node is None:
        raise ValueError("找不到这个知识点。")
    return node


DEMO_LESSONS = [
    ("函数与对应", "函数用一条规则，把输入对应到唯一的输出。先问清输入、输出和规则，比急着套公式更重要。", "打车费用可以看作里程的函数：输入是里程，输出是费用。起步价会让规则分成不同区间。", "当输入相同，输出却有两个可能值时，这个对应能直接称为函数吗？"),
    ("极限的直觉", "极限描述输入不断接近某个位置时，输出趋向什么。它关注接近的趋势，不要求函数在那个位置有定义。", "f(x)=(x²−1)/(x−1)。x≠1 时可化为 x+1；当 x 接近 1，函数值接近 2，尽管原式在 x=1 没有定义。", "函数在某点没有定义，是否就一定没有极限？请用本页例子解释。"),
    ("连续的含义", "函数在某点连续，需要该点有定义、极限存在，并且极限等于函数值。可以把它理解为接近时没有突然断开。", "f(x)=x² 在 x=2 连续：当 x 接近 2，x² 接近 4，而 f(2) 也等于 4。", "如果极限是 4，但人为把该点函数值设成 7，那里还连续吗？"),
    ("变化量", "变化量是终点值减去起点值。用 Δx 表示输入变化，用 Δy 表示输出变化；它们分别回答变化了多少。", "小车从第 2 秒的 4 米走到第 5 秒的 25 米：Δt=3 秒，Δs=21 米。", "同样增加 10 米，用 2 秒和用 5 秒有什么区别？"),
    ("平均变化率", "平均变化率等于 Δy/Δx。它把输出的变化量与输入变化量联系起来，描述整个区间的平均情况。", "若位置 s(t)=t²，从 t=1 到 t=3：平均速度=(9−1)/(3−1)=4。这里的位置单位为米，时间单位为秒。", "平均变化率等于 4，是否意味着区间里每个时刻的变化率都是 4？"),
    ("导数的定义", "导数是平均变化率在区间不断缩小时的极限：f′(x)=lim[h→0] (f(x+h)−f(x))/h。这个极限存在时，才说该点可导。", "f(x)=x² 时，差商为 ((x+h)²−x²)/h=2x+h。令 h 趋于 0，得到 f′(x)=2x。", "在 x=3 时，x² 的瞬时变化率是多少？它与 f(3) 有什么区别？"),
    ("切线与导数", "在通常的可导情形下，导数给出曲线在该点的切线斜率。函数值确定点的位置，导数描述附近的变化方向和快慢。", "y=x² 在 x=1 处经过 (1,1)，导数为 2。因此切线是 y−1=2(x−1)。", "切线经过某点，是否意味着它在其他位置也与曲线完全重合？"),
    ("基本求导", "常数的导数为 0；xⁿ 在相应定义域内的导数为 nxⁿ⁻¹。和的导数等于各项导数之和。先识别结构，再选规则。", "f(x)=3x²+2x+5，则 f′(x)=6x+2。常数 5 改变曲线的高度，但不改变斜率。", "为什么给函数整体加上一个常数，导数却不变？"),
    ("驻点与极值", "导数为 0 的点称为驻点。驻点可能是局部极值的候选，但单凭导数为 0，不能断定一定存在极值。", "f(x)=x³ 在 x=0 的导数为 0，但函数在该点两侧仍持续增大，所以这里不是局部极大或极小。", "判断一个驻点是不是极值，还可以观察它两侧的什么变化？"),
    ("优化的起点", "优化问题先确定目标函数和允许取值范围，再寻找候选点，比较驻点及边界等位置。应用求导前，建模往往更关键。", "周长为 20 的矩形，若一边为 x，另一边为 10−x。面积 A=x(10−x)，0<x<10；A′=10−2x，在 x=5 时取得最大面积。", "为什么求出了驻点以后，还要检查定义域和问题中的约束？"),
    ("积分的直觉", "定积分可以理解为许多微小贡献的累积。把区间细分、求和并取极限，可以建立严谨定义。面积是它的一种直观解释。", "若速度始终为每秒 3 米，那么 4 秒累积的路程为 12 米；图上对应宽为 4、高为 3 的矩形面积。", "如果速度随时间变化，为什么只用某一时刻的速度乘总时间通常不够？"),
    ("变化与累积", "微分研究局部变化，积分研究整体累积。微积分基本定理在适当条件下把二者联系起来，这是后续学习的重要主线。", "F(x)=x²，则 F′(x)=2x。在区间 [0,2] 上累积 2x，结果等于 F(2)−F(0)=4。", "你能分别举一个关注变化快慢、一个关注累积总量的问题吗？"),
]


def demo_tree():
    chapters = ["01 · 建立直觉", "02 · 理解变化", "03 · 走近导数", "04 · 连接应用"]
    nodes = [{"id": uid(), "title": row[0], "chapter": chapters[i // 3], "description": row[1],
              "status": "unseen", "cards": [], "ready": False, "parent_id": "", "demo_index": i,
              "messages": [], "links": [], "page": 0} for i, row in enumerate(DEMO_LESSONS)]
    return {"id": uid(), "title": "高数，从理解变化开始", "goal": "建立概念直觉，并用简单例子解释变化与累积。",
            "description": "从函数出发，经过变化率与导数，走向优化和积分。", "created": now(), "updated": now(),
            "preferences": {"target": "理解并解释", "difficulty": "从基础开始", "detail": "简洁，按需展开",
                            "style": "先例子，再概念", "guidance": "自主浏览"}, "nodes": nodes, "demo": True,
            "sources": [], "source_status": "演示内容，未进行联网检索"}


def pending_cards(tree):
    return sum(len(n["cards"]) for n in tree["nodes"] if n["status"] not in ("done", "skipped", "read"))


def generate_cards(state, tree, priority=""):
    missing = [n for n in tree["nodes"] if not n["ready"] and n["status"] != "skipped"]
    if priority:
        missing.sort(key=lambda n: n["id"] != priority)
    budget = max(0, 10 - pending_cards(tree))
    count = min(3, (budget + 2) // 3)
    if priority and any(n["id"] == priority for n in missing):
        count = max(1, count)
    chosen = missing[:count]
    if not chosen:
        return
    if tree.get("demo"):
        for node in chosen:
            idx = node.get("demo_index")
            if idx is None:
                node["cards"] = [{"id": uid(), "kind": "探索起点", "title": node["title"],
                                  "text": "这是你从原知识点长出的探索支线。可以先写下问题；接入模型后，在新建的正式学习树中生成讲解。", "image": ""}]
            else:
                row = DEMO_LESSONS[idx]
                node["cards"] = [{"id": uid(), "kind": kind, "title": title, "text": text, "image": ""}
                                 for kind, title, text in [("核心概念", row[0], row[1]), ("具体案例", "换个角度理解", row[2]),
                                                           ("停下来想一想", "把理解变成自己的话", row[3])]]
            node["ready"] = True
        return
    output = ask("cards", {"tree": {"title": tree["title"], "goal": tree["goal"], "preferences": tree["preferences"]},
                           "nodes": [{"id": n["id"], "title": n["title"], "description": n["description"]} for n in chosen],
                           "memories": state["memories"][-20:]})
    grouped = {}
    for item in output.get("cards", [])[:12]:
        if not isinstance(item, dict) or item.get("node_id") not in {n["id"] for n in chosen}:
            continue
        text = require_text(item.get("text"), "卡片正文", 600)
        grouped.setdefault(item["node_id"], []).append({"id": uid(), "kind": clean(item.get("kind"), 30),
                "title": clean(item.get("title"), 70), "text": text, "image": ""})
    if any(not grouped.get(n["id"]) for n in chosen):
        raise ValueError("模型没有生成完整的卡片批次，请重试。")
    for node in chosen:
        node["cards"] = grouped[node["id"]][:4]
        node["ready"] = True


def action(state, data):
    kind = data.get("type")
    if kind in ("configure", "configure_test"):
        MODEL.configure(data)
        if kind == "configure_test":
            try:
                return {"message": MODEL.probe()}
            except ValueError as error:
                error.settings_saved = True
                raise
        return {"message": "设置已保存。" + ("密钥已在本机加密保存。" if CONFIG["remember"] else "密钥仅在本次运行中保留。")}
    if kind == "test_model":
        return {"message": MODEL.probe()}
    if kind == "draft_message":
        message = require_text(data.get("message"))
        state["draft"]["messages"].append({"role": "user", "content": message})
        state["draft"]["summary"] = None
        return {}
    if kind == "clear_draft":
        state["draft"] = {"messages": [], "summary": None}
        return {}
    if kind == "draft_unsummarize":
        state["draft"]["summary"] = None
        return {}
    if kind == "summarize":
        draft = state["draft"]
        if not draft["messages"]:
            raise ValueError("先说说你想学什么吧。")
        output = ask("intake", {"messages": draft["messages"], "memories": state["memories"][-20:]})
        questions = output.get("questions", [])
        draft["summary"] = {"title": require_text(output.get("title"), "学习主题", 80),
                            "goal": require_text(output.get("goal"), "学习目标", 900),
                            "questions": [{"question": clean(q.get("question"), 160),
                                           "options": [clean(x, 80) for x in q.get("options", [])[:4]]}
                                          for q in questions[:4] if isinstance(q, dict)],
                            "notes": clean(output.get("notes"), 600),
                            "preferences": {k: clean(output.get("preferences", {}).get(k), 300)
                                            for k in ("target", "difficulty", "detail", "style", "guidance")}}
        return {}
    if kind == "demo":
        existing = next((t for t in state["trees"] if t.get("demo")), None)
        if not existing:
            existing = demo_tree()
            generate_cards(state, existing)
            state["trees"].insert(0, existing)
        return {"tree_id": existing["id"]}
    if kind == "create_tree":
        title = require_text(data.get("title"), "学习主题", 80)
        goal = require_text(data.get("goal"), "学习目标", 900)
        prefs = {k: clean(data.get("preferences", {}).get(k), 300) for k in ("target", "difficulty", "detail", "style", "guidance")}
        notes = clean(data.get("notes"), 3000)
        result = ask("roadmap", {"title": title, "goal": goal, "preferences": prefs, "notes": notes,
                                 "conversation": state["draft"]["messages"], "memories": state["memories"][-30:],
                                 "past_trees": [{"title": t["title"], "goal": t["goal"]} for t in state["trees"]]})
        nodes = []
        for chapter in result.get("chapters", [])[:4]:
            if not isinstance(chapter, dict):
                continue
            chapter_title = require_text(chapter.get("title"), "章节名", 50)
            for n in chapter.get("nodes", [])[:4]:
                if isinstance(n, dict) and clean(n.get("title")):
                    nodes.append({"id": uid(), "title": clean(n["title"], 60), "description": clean(n.get("description"), 400),
                                  "chapter": chapter_title, "status": "unseen", "cards": [], "ready": False,
                                  "parent_id": "", "messages": [], "links": [], "page": 0})
        if len(nodes) < 3:
            raise ValueError("模型给出的路线过于简略，请重试。")
        tree = {"id": uid(), "title": title, "goal": goal, "description": clean(result.get("description"), 500),
                "preferences": prefs, "nodes": nodes, "demo": False, "sources": [],
                "source_status": "模型组织的初步路线；尚未接入联网检索与来源核验", "created": now(), "updated": now()}
        # Route creation survives independently; card generation is explicit and retryable.
        state["trees"].insert(0, tree)
        memory(state, "长期目标", title + "：" + goal, tree["id"], key=tree["id"] + ":goal")
        memory(state, "学习偏好", "；".join(v for v in prefs.values() if v), tree["id"], key=tree["id"] + ":preferences")
        state["draft"] = {"messages": [], "summary": None}
        return {"tree_id": tree["id"]}
    if kind in ("memory_add", "memory_edit", "memory_delete"):
        if kind == "memory_add":
            memory(state, clean(data.get("category"), 30) or "个人背景", require_text(data.get("content"), limit=900))
        else:
            item = next((m for m in state["memories"] if m["id"] == data.get("id")), None)
            if not item:
                raise ValueError("找不到这条记忆。")
            if kind == "memory_delete":
                state["memories"].remove(item)
            else:
                item.update(content=require_text(data.get("content"), limit=900), source="用户已修正", updated=now())
        return {}
    tree = find_tree(state, data.get("tree_id"))
    if kind == "delete_tree":
        state["trees"].remove(tree)
        state["memories"] = [m for m in state["memories"] if m["tree_id"] != tree["id"]]
        for other in state["trees"]:
            for n in other["nodes"]:
                n["links"] = [link for link in n["links"] if link["tree_id"] != tree["id"]]
        return {}
    tree["updated"] = now()
    if kind == "preferences":
        tree["goal"] = require_text(data.get("goal"), "学习目标", 900)
        tree["preferences"] = {k: clean(data.get("preferences", {}).get(k), 300)
                               for k in ("target", "difficulty", "detail", "style", "guidance")}
        memory(state, "长期目标", tree["title"] + "：" + tree["goal"], tree["id"], key=tree["id"] + ":goal")
        memory(state, "学习偏好", "；".join(v for v in tree["preferences"].values() if v), tree["id"],
               key=tree["id"] + ":preferences")
        return {}
    if kind == "refill":
        if data.get("node_id"):
            tree["current_node_id"] = find_node(tree, data["node_id"])["id"]
        generate_cards(state, tree, clean(data.get("node_id"), 30))
        return {}
    node = find_node(tree, data.get("node_id"))
    tree["current_node_id"] = node["id"]
    if kind == "visit":
        return {}
    if kind == "set_page":
        node["page"] = max(0, min(int(data.get("page", 0)), max(0, len(node["cards"]) - 1)))
    elif kind == "advance":
        if not node["cards"] or node.get("page", 0) != len(node["cards"]) - 1:
            raise ValueError("先读到本节最后一张，再继续下一节。")
        if node["status"] != "done":
            node["status"] = "read"
        node["read_at"] = now()
        memory(state, "学习经历", f"{tree['title']} / {node['title']}：已浏览并继续下一节；理解与掌握程度尚未经过独立测评。",
               tree["id"], node["id"], "阅读进度记录", f"{tree['id']}:{node['id']}:read")
        index = tree["nodes"].index(node)
        next_node = tree["nodes"][index+1] if index+1 < len(tree["nodes"]) else None
        if next_node:
            tree["current_node_id"] = next_node["id"]
        return {"next_node_id": next_node["id"] if next_node else ""}
    elif kind == "status":
        status = data.get("status")
        if status not in ("unseen", "learning", "done", "skipped"):
            raise ValueError("未知学习状态。")
        node["status"] = status
        memory(state, "学习经历", f"{tree['title']} / {node['title']}：" +
               {"done": "用户按约定标记完成（" + tree["preferences"].get("target", "本次目标") + "），不等于经过独立测评。",
                "skipped": "用户选择跳过，掌握程度未知。", "learning": "正在学习。", "unseen": "已重置为待学习。"}[status],
               tree["id"], node["id"], "学习操作记录", f"{tree['id']}:{node['id']}:status")
    elif kind == "chat":
        message = require_text(data.get("message"))
        current_card = next((c for c in node["cards"] if c["id"] == data.get("card_id")), None)
        if data.get("card_id") and current_card is None:
            raise ValueError("这张卡片不属于当前知识点，请刷新后再提问。")
        if current_card is None and node["cards"]:
            current_card = node["cards"][max(0, min(node.get("page", 0), len(node["cards"]) - 1))]
        card_context = {k: current_card.get(k, "") for k in ("id", "kind", "title", "text")} if current_card else None
        if tree.get("demo"):
            idx = node.get("demo_index")
            explanation = DEMO_LESSONS[idx][1] if idx is not None else node["description"]
            answer = "【演示回答】\n" + explanation + "\n\n你可以先用自己的话解释一下。这里展示固定的高数示例；接入模型并创建正式学习树后，才会根据你的具体问题生成回答。"
            memories = []
            if "记住" in message or "我喜欢" in message or "我希望" in message:
                memories = [{"category": "学习偏好", "content": message, "source": "用户明确表达"}]
        else:
            result = ask("tutor", {"message": message, "tree": {"title": tree["title"], "goal": tree["goal"], "preferences": tree["preferences"]},
                                   "node": {"title": node["title"], "description": node["description"],
                                            "cards": [{k: c.get(k, "") for k in ("kind", "title", "text")} for c in node["cards"]]},
                                   "current_card": card_context,
                                   "related_learning_records": related_learning(state, tree, node, current_card, message),
                                   "history": node["messages"][-12:], "memories": state["memories"][-30:],
                                   "other_trees": [{"id": t["id"], "title": t["title"], "completed": [n["title"] for n in t["nodes"] if n["status"] == "done"]}
                                                   for t in state["trees"] if t["id"] != tree["id"]]})
            answer = require_text(result.get("answer"), "回答", 5000)
            memories = result.get("memories", [])
        message_context = {"card_id": current_card["id"], "card_title": current_card["title"]} if current_card else {}
        node["messages"].extend([{"role": "user", "content": message, "at": now(), **message_context},
                                 {"role": "assistant", "content": answer, "at": now(), **message_context}])
        memory(state, "疑问与反馈", message, tree["id"], node["id"], "用户对话记录")
        for m in memories[:3]:
            if isinstance(m, dict):
                source = "助手暂时推测" if m.get("source") == "助手暂时推测" else "用户明确表达"
                memory(state, clean(m.get("category"), 30) or "学习偏好", m.get("content"), tree["id"], node["id"], source)
    elif kind == "branch":
        title = require_text(data.get("title"), "分支主题", 60)
        if len(tree["nodes"]) >= 40:
            raise ValueError("首版每棵树最多容纳 40 个节点；可以把深入主题建立为新树。")
        child = {"id": uid(), "title": title, "description": "从「" + node["title"] + "」延伸的个人探索。",
                 "chapter": "探索支线", "parent_id": node["id"], "status": "unseen", "cards": [], "ready": False,
                 "messages": [], "links": [], "page": 0}
        tree["nodes"].append(child)
        tree["current_node_id"] = child["id"]
        memory(state, "兴趣与探索", child["description"] + "主题：" + title, tree["id"], child["id"])
        return {"node_id": child["id"]}
    elif kind == "link":
        other = find_tree(state, data.get("other_tree_id"))
        other_node = find_node(other, data.get("other_node_id"))
        if other["id"] == tree["id"]:
            raise ValueError("请选择另一棵学习树中的知识点。")
        link = {"tree_id": other["id"], "node_id": other_node["id"]}
        if link not in node["links"]:
            node["links"].append(link)
    elif kind == "image":
        card = next((c for c in node["cards"] if c["id"] == data.get("card_id")), None)
        image = clean(data.get("image"), 1_500_000)
        if not card:
            raise ValueError("找不到这张卡片。")
        if image:
            match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", image)
            if not match:
                raise ValueError("仅支持 PNG、JPEG 和 WebP 静态图片。")
            try:
                raw = base64.b64decode(match[2], validate=True)
            except ValueError:
                raise ValueError("图片格式无效。") from None
            if len(raw) > 1_000_000:
                raise ValueError("首版单张图片请控制在 1 MB 以内。")
            if not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff") or (raw.startswith(b"RIFF") and raw[8:12] == b"WEBP")):
                raise ValueError("图片内容与格式不符。")
        card["image"] = image
    else:
        raise ValueError("未知操作。")
    return {}


class LocalServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR can bind over an existing listener and reach an old app.
    allow_reuse_address = False

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not log request bodies, model credentials, or user learning content.
        pass

    def valid_origin(self):
        host = self.headers.get("Host", "")
        allowed = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        origin = self.headers.get("Origin")
        return host in allowed and (not origin or origin in {"http://" + x for x in allowed})

    def reply(self, code, value, content_type="application/json; charset=utf-8"):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_GET(self):
        if not self.valid_origin():
            self.reply(403, {"error": "仅允许从本机应用访问。"})
            return
        path = urlparse(self.path).path
        if path == "/api/state":
            with LOCK:
                self.reply(200, {"state": load(), "settings": settings()})
        elif path == "/api/health":
            self.reply(200, {"app": "learning-grove", "version": VERSION, "project_id": PROJECT_ID, "pid": os.getpid()})
        elif path == "/api/export":
            with LOCK:
                self.reply(200, {"format": "learning-grove-v1", "exported": now(), "state": load()})
        elif path in ("/", "/app.js", "/styles.css", "/reader.css", "/garden.css", "/capacitor-runtime.js", "/mobile-service.js"):
            name = "index.html" if path == "/" else path[1:]
            mime = "text/javascript" if name.endswith('.js') else ("text/html" if name == "index.html" else "text/css")
            self.reply(200, (ROOT / "static" / name).read_bytes(), mime + "; charset=utf-8")
        elif path == "/favicon.ico":
            self.reply(204, b"", "image/x-icon")
        else:
            self.reply(404, {"error": "页面不存在。"})

    def do_POST(self):
        if not self.valid_origin():
            self.reply(403, {"error": "请求来源不匹配。"})
            return
        if self.path == "/api/shutdown":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length < 4096:
                    raise ValueError()
                data = json.loads(self.rfile.read(length))
                if not hmac.compare_digest(str(data.get("token", "")), self.server.shutdown_token):
                    self.reply(403, {"error": "停止凭据不匹配。"})
                    return
                self.reply(200, {"message": "正在停止本地服务，学习记录已保留。"})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            except (ValueError, TypeError):
                self.reply(400, {"error": "停止请求格式不正确。"})
            return
        if self.path != "/api/action":
            self.reply(404, {"error": "接口不存在。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 2_000_000:
                raise ValueError("请求内容过大或为空。")
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("请求格式不正确。")
            with LOCK:
                state = load()
                result = action(state, data)
                save(state)
                self.reply(200, {"state": state, "settings": settings(), **result})
        except (ValueError, TypeError, KeyError) as exc:
            self.reply(400, {"error": str(exc), "settings": settings(), "settings_saved": getattr(exc, 'settings_saved', False)})
        except Exception:
            self.reply(500, {"error": "保存或处理暂时失败，请重试。原有数据仍保留在本机。"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()
    load()
    try:
        server = LocalServer(("127.0.0.1", args.port if args.port is not None else 8765), Handler)
    except OSError:
        if args.port is not None:
            raise
        server = LocalServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    server.shutdown_token = uuid.uuid4().hex
    runtime_path = DB.parent / "runtime.json"
    runtime = {"url": f"http://127.0.0.1:{server.server_port}", "pid": os.getpid(), "project_id": PROJECT_ID,
               "version": VERSION, "shutdown_token": server.shutdown_token}
    temporary = runtime_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(runtime), encoding='utf-8')
    temporary.replace(runtime_path)
    print(f"Learning Grove ready: {runtime['url']}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        try:
            if json.loads(runtime_path.read_text())['pid'] == os.getpid():
                runtime_path.unlink()
        except (OSError, ValueError, KeyError):
            pass


if __name__ == "__main__":
    main()
