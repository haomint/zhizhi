from pathlib import Path
p=Path('outputs/learning-grove/static/app.js');s=p.read_text(encoding='utf-8')
s=s.replace("<span>${tree.demo?'固定示例 · 不调用模型':'随时停下，也随时接着看'}</span>","${tree.demo?'<span>示例</span>':''}")
for fragment in ['<p>往下看看，留一个小问题</p>','<p class="question-note">上面的卡片一直在。往上翻可以对照，往下看回答。</p>','<span>记在这张卡片里，理解会连起来</span>','<p class="answer-empty">问题不必完整，从一点好奇开始就好。</p>']:
 s=s.replace(fragment,'')
s=s.replace('<span id="reader-save-state">位置已记好，下次从这里继续</span>','<span id="reader-save-state" class="visually-hidden" role="status"></span>')
s=s.replace('<div class="profile-toolbar"><input','<div class="personal-settings"><button class="personal-settings-button" data-action="settings">'+"${icon('settings',20)}"+'<span><strong>设置</strong><small>模型连接与 API 配置</small></span>'+"${icon('arrow',17)}"+'</button></div><div class="profile-toolbar"><input')
p.write_text(s,encoding='utf-8')
p=Path('outputs/learning-grove/static/reader.css');s=p.read_text(encoding='utf-8');s+='\n.visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.sheet-footnote{justify-content:flex-end}.reader-question .send-row{justify-content:flex-end}.pocket-footer{justify-content:flex-end}.question-reveal{min-height:35px;padding:12px 0}.personal-settings{margin:0 0 25px}.personal-settings-button{display:flex;align-items:center;gap:15px;width:100%;padding:20px 22px;background:#fffefa99;border:1px solid #dfe7d5;border-radius:18px;color:#708765;text-align:left}.personal-settings-button>span{flex:1}.personal-settings-button strong{display:block;font-size:14px;font-weight:500;margin-bottom:5px}.personal-settings-button small{display:block;font-size:10px;color:#96a38a}\n';p.write_text(s,encoding='utf-8')
