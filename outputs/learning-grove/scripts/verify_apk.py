from pathlib import Path
import subprocess,os,zipfile,hashlib,json
r=Path(__file__).resolve().parents[1];root=r.parents[1];tools=root/'work/pi-probe-tools';env=os.environ.copy()
jdk=Path(env['JAVA_HOME']) if env.get('JAVA_HOME') else next((tools/'java').iterdir());env['JAVA_HOME']=str(jdk);env['PATH']=str(jdk/'bin')+os.pathsep+env['PATH'];sdk=Path(env.get('ANDROID_HOME',str(tools/'android-sdk')));build=sdk/'build-tools/36.0.0';apk=r.parent/'知枝-1.0.0.apk'
def certificate(p):
 out=subprocess.check_output([str(build/('apksigner.bat' if os.name=='nt' else 'apksigner')),'verify','--print-certs',str(p)],env=env,text=True)
 return next(line.split(': ',1)[1] for line in out.splitlines() if 'certificate SHA-256 digest' in line)
new=certificate(apk);old_path=r.parent/'知枝-安卓验证版.apk';old=certificate(old_path) if old_path.exists() else None
integration=r.parent/'知枝-整合验证版-0.7.0.apk'
previous=certificate(integration) if integration.exists() else None
if previous: assert new==previous,'Signing key differs from 0.7 integration app'
checked=[]
with zipfile.ZipFile(apk) as z:
 for p in (r/'static').rglob('*'):
  if p.is_file():
   rel=p.relative_to(r/'static').as_posix();assert z.read('assets/public/'+rel)==p.read_bytes(),rel;checked.append(rel)
badging=subprocess.check_output([str(build/('aapt.exe' if os.name=='nt' else 'aapt')),'dump','badging',str(apk)],env=env,text=True).splitlines()[0]
assert "versionCode='4'" in badging and "name='app.zhizhi.personal.integration'" in badging
report={'version':'1.0.0','apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'apkBytes':apk.stat().st_size,'assetsCompared':len(checked),'signatureVerified':True,'sameCertificateAs061':new==old if old else None,'sameCertificateAs070':new==previous if previous else None,'installation':'updates 0.7 integration app; parallel to 0.6.1; import/export migrates learning data','certificateSha256':new,'package':badging}
(r/'apk-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
