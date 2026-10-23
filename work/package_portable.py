"""Build a clean portable release using an explicit source allowlist."""
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'outputs' / 'learning-grove'
STAGE = ROOT / 'work' / 'portable-03' / '知枝-0.3-Windows便携版'
RUNTIME_ZIP = ROOT / 'work' / 'python-3.13.16-embed-amd64.zip'
EXPECTED = '97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297'
assert hashlib.sha256(RUNTIME_ZIP.read_bytes()).hexdigest() == EXPECTED, 'Official runtime checksum mismatch'
STAGE.mkdir(parents=True, exist_ok=True)
for name in ['launch.py', 'launch.ps1', 'server.py', 'model_service.py', 'runtime_info.py',
             '启动知枝.cmd', '停止知枝.cmd', 'README.md']:
    shutil.copyfile(APP / name, STAGE / name)
for folder in ['static', 'skills']:
    for file in (APP / folder).rglob('*'):
        if file.is_file() and file.suffix in {'.html', '.css', '.js', '.md'}:
            target = STAGE / file.relative_to(APP)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
runtime = STAGE / '.runtime'
runtime.mkdir(exist_ok=True)
with zipfile.ZipFile(RUNTIME_ZIP) as package:
    package.extractall(runtime)
# Isolated standard-library runtime, plus the adjacent application directory.
(runtime / 'python313._pth').write_text('python313.zip\n.\n..\n', encoding='ascii')
(STAGE / 'data').mkdir(exist_ok=True)
(STAGE / 'data' / '文件说明.txt').write_text('此目录用于保存你自己的学习资料，首次启动时会自动建立数据库。\n分享便携包时，请使用原始压缩包，不要分享你使用过的 data 文件夹。\n', encoding='utf-8-sig')
quickstart = '''知枝 · 0.3 Windows 便携体验版

适用于 Windows 10 / 11 的 64 位电脑。已经内置运行环境，无需安装 Python、Node 或其他开发工具。

1. 将压缩包完整解压到普通文件夹，例如桌面或文档目录。不要直接在压缩包内部运行。
2. 双击“启动知枝.cmd”，浏览器会自动打开。启动窗口正常退出后，页面仍可继续使用。
3. 首次可以点击“体验高数示例”。这套示例卡片和回答是固定内容，不消耗 API。
4. 要生成自己的学习路线，点击右上角模型设置，填写自己的 DeepSeek API Key，然后“保存并测试连接”。
5. 进入学习后默认阅读短卡片；在卡片下方直接提问。点击“学习树全景”单独查看完整路线和点亮状态。
6. 不用了，双击“停止知枝.cmd”。下次启动会继续保留学习进度。

本地运行说明
应用和学习资料在这台电脑运行、保存。DeepSeek 生成和问答仍需要联网、有效的 API Key 和可用的账户额度；相关学习上下文会发送给所选模型服务。本包不附带任何人的 API Key 或个人学习档案。

资料与分享
你的记录保存在 data 文件夹，请与应用一同保留。加密保存的 Key 仅当前 Windows 账号可使用，换电脑或换账号后需要重填。向别人分享时，发最初下载的干净压缩包。不要将使用过的 data 文件夹发给别人。

遇到问题
浏览器没有自动打开：再次双击启动文件，查看打印的 http://127.0.0.1 地址，复制到浏览器中。
页面打不开：不要单独打开 static/index.html；请从启动知枝.cmd 进入。
启动错误：检查是否完整解压、目录是否允许写入，保留窗口提示与 data/server.log 便于排查。
连接错误：页面会区分 Key 无效、余额不足、网络连接等原因，按提示处理。

版本 0.3：独立学习树全景、专注卡片阅读、卡片内提问、问答卡片上下文、翻页草稿保留和统一视觉样式。
首版仍未包含联网检索、教材导入、动画演示及独立掌握测评。

第三方运行环境来自 Python Software Foundation 官方 Windows embeddable package 3.13.16 (64-bit)。
来源：https://www.python.org/downloads/release/python-31316/
运行环境许可证保留于 .runtime/LICENSE.txt。
'''
(STAGE / '先读我-使用说明.txt').write_text(quickstart, encoding='utf-8-sig')
manifest = {'app_version': '0.3.0-local', 'platform': 'Windows 10/11 x64',
            'python_version': '3.13.16', 'runtime_url': 'https://www.python.org/ftp/python/3.13.16/python-3.13.16-embed-amd64.zip',
            'runtime_sha256': EXPECTED, 'includes_user_data': False, 'includes_api_key': False}
(STAGE / 'release-info.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
archive = ROOT / 'outputs' / '知枝-0.3-Windows便携版.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=8) as package:
    for file in sorted(STAGE.rglob('*')):
        if not file.is_file() or '__pycache__' in file.parts:
            continue
        relative = file.relative_to(STAGE)
        if relative.parts[0] == 'data' and relative.name != '文件说明.txt':
            continue
        package.write(file, str(Path(STAGE.name) / relative))
with zipfile.ZipFile(archive) as package:
    names=package.namelist()
    assert not any(name.endswith(('grove.sqlite3', 'model-settings.json', 'runtime.json', 'server.log', 'launch.lock', '.pyc')) for name in names)
    assert not any('__pycache__' in name for name in names)
    assert any(name.endswith('.runtime/python.exe') for name in names)
shutil.copyfile(STAGE / '先读我-使用说明.txt', ROOT / 'outputs' / '知枝-0.3-使用说明.txt')
print(json.dumps({'archive':str(archive),'size_mb':round(archive.stat().st_size/1024**2,2),
                  'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'stage':str(STAGE)},ensure_ascii=False))
