"""Build the independent React/TS probe using explicit tools or the room cache."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
tools = root.parents[1] / 'work/pi-probe-tools'
env = os.environ.copy()
if not env.get('JAVA_HOME'):
    candidates = list((tools / 'java').glob('*/bin/java'))
    if candidates:
        env['JAVA_HOME'] = str(candidates[0].parents[1])
env.setdefault('ANDROID_HOME', env.get('ANDROID_SDK_ROOT', str(tools / 'android-sdk')))
if not env.get('JAVA_HOME') or not (Path(env['ANDROID_HOME']) / 'platforms/android-36/android.jar').exists():
    raise SystemExit('Configure JDK 21 JAVA_HOME and Android API 36 ANDROID_HOME.')
env['PATH'] = str(Path(env['JAVA_HOME']) / 'bin') + os.pathsep + env['PATH']
if (tools / 'gradle-cache').exists():
    env.setdefault('GRADLE_USER_HOME', str(tools / 'gradle-cache'))
(root / 'android/local.properties').write_text('sdk.dir=' + env['ANDROID_HOME'].replace('\\', '/') + '\n')
subprocess.run(['npm.cmd' if os.name == 'nt' else 'npm', 'run', 'android:sync'], cwd=root, env=env, check=True)
options = ['--no-daemon', '--max-workers=2', '-Pandroid.overridePathCheck=true']
cache = Path(env.get('GRADLE_USER_HOME', str(Path.home() / '.gradle')))
aapt = Path(env['ANDROID_HOME']) / 'build-tools/36.0.0/aapt2'
if os.name != 'nt' and aapt.exists() and not os.access(aapt, os.X_OK):
    candidates = sorted((cache / 'caches/modules-2/files-2.1/com.android.tools.build/aapt2').glob('*/*/*-linux.jar'))
    if not candidates:
        raise SystemExit('Android aapt2 is not executable and no readable Maven tool cache exists.')
    target = tools / 'native-tools' / ('user-' + str(os.getuid())) / 'aapt2'
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(candidates[-1]) as archive:
        target.write_bytes(archive.read('aapt2'))
    target.chmod(0o750)
    options.append('-Pandroid.aapt2FromMavenOverride=' + str(target))
if os.name != 'nt':
    daemon = cache / 'daemon'
    if daemon.exists() and any(not os.access(p, os.R_OK | os.W_OK | os.X_OK) for p in daemon.iterdir() if p.is_dir()):
        target = cache / ('daemon-user-' + str(os.getuid()))
        target.mkdir(exist_ok=True)
        options.append('-Dorg.gradle.daemon.registry.base=' + str(target))
command = ['gradlew.bat'] if os.name == 'nt' else ['bash', 'gradlew']
subprocess.run(command + options + [':app:assembleDebug'], cwd=root / 'android', env=env, check=True)
output = root / 'verification/知枝-React-TS-验证-0.1.0.apk'
output.parent.mkdir(exist_ok=True)
shutil.copyfile(root / 'android/app/build/outputs/apk/debug/app-debug.apk', output)
print(json.dumps({'apk': str(output), 'appId': 'app.zhizhi.reacttsprobe', 'version': '0.1.0'}, ensure_ascii=False))
