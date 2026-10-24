"""Verify signing, application identity, and exact Vite assets in the probe APK."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
tools = root.parents[1] / 'work/pi-probe-tools'
env = os.environ.copy()
jdk = Path(env['JAVA_HOME']) if env.get('JAVA_HOME') else next((tools / 'java').iterdir())
env['JAVA_HOME'] = str(jdk)
env['PATH'] = str(jdk / 'bin') + os.pathsep + env['PATH']
sdk = Path(env.get('ANDROID_HOME', str(tools / 'android-sdk')))
build = sdk / 'build-tools/36.0.0'
apk = root / 'verification/知枝-React-TS-验证-0.1.0.apk'
signer = build / ('apksigner.bat' if os.name == 'nt' else 'apksigner')
command = [str(signer)] if os.name == 'nt' or os.access(signer, os.X_OK) else ['bash', str(signer)]
signature = subprocess.check_output(command + ['verify', '--verbose', '--print-certs', str(apk)], env=env, text=True)
checked = []
with zipfile.ZipFile(apk) as archive:
    for source in sorted((root / 'dist').rglob('*')):
        if source.is_file():
            relative = source.relative_to(root / 'dist').as_posix()
            assert archive.read('assets/public/' + relative) == source.read_bytes(), relative
            checked.append(relative)
    config = json.loads(archive.read('assets/capacitor.config.json'))
    assert config['appId'] == 'app.zhizhi.reacttsprobe'
    assert not config.get('server', {}).get('url'), 'APK must load bundled assets, not a development server'
    assert any(b'ProbePlugin' in archive.read(name) for name in archive.namelist() if name.endswith('.dex'))
aapt = build / ('aapt.exe' if os.name == 'nt' else 'aapt')
if os.name != 'nt' and not os.access(aapt, os.X_OK):
    aapt = tools / 'native-tools' / ('user-' + str(os.getuid())) / 'aapt2'
badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], env=env, text=True)
identity = badging.splitlines()[0]
assert "name='app.zhizhi.reacttsprobe'" in identity and "versionName='0.1.0'" in identity
report = {
    'appId': config['appId'], 'version': '0.1.0', 'signatureVerified': True,
    'certificateSha256': next(line.split(': ', 1)[1] for line in signature.splitlines() if 'certificate SHA-256 digest' in line),
    'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'apkBytes': apk.stat().st_size,
    'assetsCompared': checked, 'nativeProbeClassBundled': True, 'externalDevelopmentServerRequired': False,
    'package': identity, 'minimumSdk': next(line for line in badging.splitlines() if line.startswith(('sdkVersion:', 'minSdkVersion:'))),
    'nativeRuntimeExecuted': False, 'physicalDeviceTested': False,
}
(root / 'verification/apk.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
