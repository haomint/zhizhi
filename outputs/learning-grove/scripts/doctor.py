"""Read-only prerequisite check. Never prints credentials."""
from pathlib import Path
import json,os,shutil,subprocess
root=Path(__file__).resolve().parents[1];tools=root.parents[1]/'work/pi-probe-tools'
sdk=Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT',str(tools/'android-sdk'))))
jdks=list((tools/'java').glob('*/bin/java'))
java=Path(os.environ['JAVA_HOME'])/'bin'/('java.exe' if os.name=='nt' else 'java') if os.environ.get('JAVA_HOME') else jdks[0] if jdks else None
checks={'node':bool(shutil.which('node')),'npm':bool(shutil.which('npm')),'git':bool(shutil.which('git')),'java':bool(java and java.exists()),'sdk36':(sdk/'platforms/android-36/android.jar').exists(),'dependencies':(root/'node_modules/@earendil-works/pi-agent-core/package.json').exists()}
manifest=json.loads((root/'skills/manifest.json').read_text())
checks['skillFiles']=all((root/'skills'/v['file']).exists() for v in manifest['skills'].values())
checks['skillCopies']=all((root/'static/skills'/v['file']).exists() and (root/'skills'/v['file']).read_bytes()==(root/'static/skills'/v['file']).read_bytes() for v in manifest['skills'].values())
if java and java.exists():
 version=subprocess.run([str(java),'-version'],capture_output=True,text=True)
 checks['jdk21']=version.returncode==0 and '"21.' in version.stderr
print(json.dumps({'checks':checks,'search':'wikipedia-zh; no extra API key','realApi':'not_tested','phoneUpgrade':'same application ID as 0.7; device test pending'},ensure_ascii=False,indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
