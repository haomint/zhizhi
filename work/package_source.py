"""Build a source-only archive with explicit exclusions, without staging copies."""
from pathlib import Path
import zipfile

workspace = Path(__file__).resolve().parents[1]
project = workspace / 'outputs/learning-grove'
target = workspace / 'outputs/知枝-项目源码.zip'
excluded = {'node_modules', '.tools', 'data', '__pycache__', '.gradle', 'build', '.git', '.runtime'}
secret_suffixes = {'.jks', '.keystore', '.sqlite3', '.db', '.log', '.apk', '.pyc'}
checks = ['test_mobile_service.cjs', 'verify_pocket_ui.cjs', 'verify_settings_ui.cjs', 'test_pocket.py', 'package_source.py']
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(project.rglob('*')):
        relative = path.relative_to(project)
        if not path.is_file() or any(p in excluded for p in relative.parts):
            continue
        if path.suffix.lower() in secret_suffixes or path.name in {'local.properties', '.DS_Store'} or path.name.startswith('.env'):
            continue
        archive.write(path, '知枝源码/outputs/learning-grove/' + relative.as_posix())
    for name in checks:
        path = workspace / 'work' / name
        if path.exists():
            archive.write(path, '知枝源码/work/' + name)
    archive.write(project / 'node_modules/@capacitor/core/LICENSE', '知枝源码/outputs/learning-grove/THIRD-PARTY-CAPACITOR-LICENSE.txt')
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert not any(any(p in excluded for p in Path(n).parts) for n in names)
    assert not any(Path(n).suffix.lower() in secret_suffixes for n in names)
    assert any(n.endswith('gradle-wrapper.jar') for n in names)
    print(f'Archive verified: {len(names)} files, {target.stat().st_size:,} bytes')
    print(target)
