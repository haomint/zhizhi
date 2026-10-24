"""Cross-platform Android build. Uses explicit environment or existing room cache."""
import os, subprocess, shutil, json, zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
tools=root.parents[1]/'work/pi-probe-tools'
env=os.environ.copy()
retained_key=root.parents[1]/'work/release-signing/zhizhi-v1.keystore'
if retained_key.exists(): env.setdefault('ZHIZHI_DEBUG_KEYSTORE',str(retained_key))
if env.get('ZHIZHI_DEBUG_KEYSTORE') and not os.access(env['ZHIZHI_DEBUG_KEYSTORE'],os.R_OK):
    raise SystemExit('当前用户无法读取指定签名；请配置可读取且与当前应用版本匹配的 ZHIZHI_DEBUG_KEYSTORE。')
if not env.get('JAVA_HOME'):
    candidates=list((tools/'java').glob('*/bin/java'))
    if candidates: env['JAVA_HOME']=str(candidates[0].parents[1])
if not env.get('ANDROID_HOME'):
    env['ANDROID_HOME']=env.get('ANDROID_SDK_ROOT', str(tools/'android-sdk'))
if not env.get('JAVA_HOME') or not (Path(env['ANDROID_HOME'])/'platforms/android-36/android.jar').exists():
    raise SystemExit('需要 JDK 21 的 JAVA_HOME 和含 API 36 的 ANDROID_HOME。')
env['PATH']=str(Path(env['JAVA_HOME'])/'bin')+os.pathsep+env['PATH']
if (tools/'gradle-cache').exists(): env.setdefault('GRADLE_USER_HOME', str(tools/'gradle-cache'))
(root/'android/local.properties').write_text('sdk.dir='+env['ANDROID_HOME'].replace('\\','/')+'\n')
subprocess.run(['npm.cmd' if os.name=='nt' else 'npm','run','android:sync'],cwd=root,env=env,check=True)
command=['gradlew.bat'] if os.name=='nt' else ['bash','gradlew']
gradle_options=['--no-daemon','--max-workers=2']
sdk_aapt=Path(env['ANDROID_HOME'])/'build-tools/36.0.0/aapt2'
if os.name!='nt' and sdk_aapt.exists() and not os.access(sdk_aapt,os.X_OK):
    artifacts=sorted((Path(env.get('GRADLE_USER_HOME',str(tools/'gradle-cache')))/'caches/modules-2/files-2.1/com.android.tools.build/aapt2').glob('*/*/*-linux.jar'))
    if not artifacts:
        raise SystemExit('aapt2 不可执行，且无可读取的 Maven 工具缓存；请配置当前用户可执行的 Android SDK。')
    native_dir=tools/'native-tools'/('user-'+str(os.getuid()))
    native_dir.mkdir(parents=True,exist_ok=True)
    executable=native_dir/'aapt2'
    with zipfile.ZipFile(artifacts[-1]) as archive:
        executable.write_bytes(archive.read('aapt2'))
    executable.chmod(0o750)
    gradle_options.append('-Pandroid.aapt2FromMavenOverride='+str(executable))
if os.name!='nt' and env.get('GRADLE_USER_HOME'):
    daemon_root=Path(env['GRADLE_USER_HOME'])/'daemon'
    if daemon_root.exists() and any(not os.access(p,os.R_OK|os.W_OK|os.X_OK) for p in daemon_root.iterdir() if p.is_dir()):
        # Gradle daemon state is private to its OS user, even when dependency
        # caches belong to the shared room. Reuse artifacts without changing
        # another user's daemon permissions or processes.
        private_daemons=Path(env['GRADLE_USER_HOME'])/('daemon-user-'+str(os.getuid()))
        private_daemons.mkdir(exist_ok=True)
        gradle_options.append('-Dorg.gradle.daemon.registry.base='+str(private_daemons))
subprocess.run(command+gradle_options+[':app:assembleDebug'],cwd=root/'android',env=env,check=True)
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
out=root.parent/f'知枝-{version}.apk'
shutil.copyfile(root/'android/app/build/outputs/apk/debug/app-debug.apk',out)
print(out)
