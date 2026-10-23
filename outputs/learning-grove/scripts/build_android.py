"""Cross-platform Android build. Uses explicit environment or existing room cache."""
import os, subprocess, shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
tools=root.parents[1]/'work/pi-probe-tools'
env=os.environ.copy()
if (tools/'signing/debug.keystore').exists(): env.setdefault('ZHIZHI_DEBUG_KEYSTORE',str(tools/'signing/debug.keystore'))
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
subprocess.run(command+['--no-daemon','--max-workers=2',':app:assembleDebug'],cwd=root/'android',env=env,check=True)
out=root.parent/'知枝-1.0.0.apk'
shutil.copyfile(root/'android/app/build/outputs/apk/debug/app-debug.apk',out)
print(out)
