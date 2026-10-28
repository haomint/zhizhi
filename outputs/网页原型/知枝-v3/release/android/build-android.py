"""Package this web release into a separately signed Android application."""
from pathlib import Path
import os,json,subprocess,shutil,zipfile,hashlib,secrets
ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parent
REPO=next((p for p in ROOT.parents if (p/'scripts/save_version.py').exists()),PROJECT)
TOOLS=REPO/'work/android-tools'
JDK=Path(os.environ['JAVA_HOME']) if os.environ.get('JAVA_HOME') else next((TOOLS/'java').glob('jdk-*'))
BUILD_TOOLS=Path(os.environ['ANDROID_BUILD_TOOLS']) if os.environ.get('ANDROID_BUILD_TOOLS') else next((TOOLS/'build-tools').iterdir())
ANDROID_JAR=Path(os.environ['ANDROID_JAR']) if os.environ.get('ANDROID_JAR') else next((TOOLS/'platform').glob('*/android.jar'))
metadata=json.loads((ROOT/'version.json').read_text())
work=PROJECT/'work/android-build'
work.mkdir(parents=True,exist_ok=True)
for name in ['assets','classes','dex','generated']:
 p=work/name
 if p.exists():shutil.rmtree(p)
 p.mkdir()
source=PROJECT/'reading-only.html' if (PROJECT/'reading-only.html').exists() else PROJECT/'index.html'
shutil.copyfile(source,work/'assets/index.html')
(work/'assets/release.json').write_text(json.dumps(metadata,ensure_ascii=False))
env=os.environ.copy();env['JAVA_HOME']=str(JDK);env['PATH']=str(JDK/'bin')+os.pathsep+env['PATH']
def run(args):
 result=subprocess.run([str(a) for a in args],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 if result.returncode:raise RuntimeError(result.stdout)
 return result.stdout
print('Compiling native Android wrapper',flush=True)
run([BUILD_TOOLS/'aapt2','compile','--dir',ROOT/'res','-o',work/'resources.zip'])
run([BUILD_TOOLS/'aapt2','link','-o',work/'unsigned.apk','--manifest',ROOT/'AndroidManifest.xml','-I',ANDROID_JAR,'-R',work/'resources.zip','-A',work/'assets','--java',work/'generated','--version-code',metadata['versionCode'],'--version-name',metadata['version']])
print(run([JDK/'bin/javac','--release','8','-classpath',ANDROID_JAR,'-d',work/'classes',*ROOT.glob('src/**/*.java'),*work.glob('generated/**/*.java')]),end='')
run([BUILD_TOOLS/'d8','--min-api','26','--lib',ANDROID_JAR,'--output',work/'dex',*work.glob('classes/**/*.class')])
with zipfile.ZipFile(work/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:
 for p in (work/'dex').glob('*.dex'):z.write(p,p.name)
run([BUILD_TOOLS/'zipalign','-p','-f','4',work/'unsigned.apk',work/'aligned.apk'])
signing=REPO/'work/release-signing';signing.mkdir(parents=True,exist_ok=True)
key=signing/'zhizhi-reading.keystore';password=signing/'zhizhi-reading.password'
if not key.exists():
 password.write_text(secrets.token_urlsafe(32));password.chmod(0o600)
 run([JDK/'bin/keytool','-genkeypair','-keystore',key,'-storepass:file',password,'-keypass:file',password,'-alias','zhizhi-reading','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Zhizhi Reading,O=Zhizhi,C=CN'])
 key.chmod(0o600)
output=PROJECT/'work'/('知枝-android-'+metadata['version']+'.apk')
run([BUILD_TOOLS/'apksigner','sign','--ks',key,'--ks-pass','file:'+str(password),'--ks-key-alias','zhizhi-reading','--out',output,work/'aligned.apk'])
certificate=run([BUILD_TOOLS/'apksigner','verify','--verbose','--print-certs',output])
package=run([BUILD_TOOLS/'aapt2','dump','badging',output]).splitlines()[0]
assert "name='"+metadata['appId']+"'" in package
assert "versionCode='"+str(metadata['versionCode'])+"'" in package
assert "versionName='"+metadata['version']+"'" in package
with zipfile.ZipFile(output) as z:
 assert z.read('assets/index.html')==source.read_bytes()
 assert z.read('classes.dex')
report={**metadata,'apkPath':str(output),'apkSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'webSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'apkBytes':output.stat().st_size,'package':package,'signatureVerified':True,'certificate':certificate,'deviceTested':False}
(ROOT/'build-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
