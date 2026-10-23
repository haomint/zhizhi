from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'outputs' / 'learning-grove'
css = root / 'static' / 'styles.css'
css.write_text(css.read_text(encoding='utf-8') + '''
.provider-intro p{margin:13px 0 20px}.advanced-settings{border:1px solid var(--line);border-radius:9px;padding:12px 14px;margin:16px 0}.advanced-settings summary{font-size:11px;color:var(--muted);cursor:pointer}.advanced-settings[open] summary{margin-bottom:18px}.connection-result{font-size:12px;line-height:1.9;padding:13px 15px;border-radius:8px;background:#f1f1e9;color:#7e8c72;white-space:pre-wrap;margin:15px 0;overflow-wrap:anywhere}.connection-result.success{background:#e8efdf;color:#3c653a}.connection-result.error{background:#f6e9dd;color:#9c5a36}.settings-links{display:flex;justify-content:space-between;gap:15px;margin-top:20px;font-size:10px;color:#819274}.settings-links button{padding:0}.settings-links a{text-decoration:underline}.demo-notice{font-size:11px;line-height:1.9;background:#f0e9da;color:#8e7654;border:1px solid #e7dfce;padding:13px 18px;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:14px}.demo-notice button{font-size:11px;padding:8px 12px;white-space:nowrap}
''', encoding='utf-8')
app = root / 'static' / 'app.js'
text = app.read_text(encoding='utf-8')
text = text.replace("你的模型已经接入。可以自由描述需求，生成属于自己的学习路线。", "连接设置已保存。可以先在 DeepSeek 设置中测试，再创建自己的学习路线。")
text = text.replace("当前可体验固定的高数示例。接入模型后，才会根据你的需求生成路线、卡片和回答。", "先看高数示例体验流程；填写 DeepSeek API Key 后，再生成适合自己的学习路线与卡片。")
text = text.replace('<div class="workspace"><section', '${tree.demo?`<div class="demo-notice"><span>这是一棵固定演示树。DeepSeek 会用于你新建的正式学习树。</span><button class="secondary" data-action="new">开始自己的学习 →</button></div>`:\'\'}<div class="workspace"><section')
app.write_text(text, encoding='utf-8')
# Batch files use ASCII content and Windows CRLF, independent of console codepage.
for name in ('启动知枝.cmd', '停止知枝.cmd'):
    p = root / name
    p.write_bytes(p.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\n', '\r\n').encode('ascii'))
