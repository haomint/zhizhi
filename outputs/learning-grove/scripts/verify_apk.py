from pathlib import Path
import subprocess,os,zipfile,hashlib,json
r=Path(__file__).resolve().parents[1];root=r.parents[1];tools=root/'work/pi-probe-tools';env=os.environ.copy()
jdk=Path(env['JAVA_HOME']) if env.get('JAVA_HOME') else next((tools/'java').iterdir());env['JAVA_HOME']=str(jdk);env['PATH']=str(jdk/'bin')+os.pathsep+env['PATH'];sdk=Path(env.get('ANDROID_HOME',str(tools/'android-sdk')));build=sdk/'build-tools/36.0.0';version=json.loads((r/'package.json').read_text(encoding='utf-8'))['version'];apk=r.parent/f'知枝-{version}.apk'
def certificate(p):
 signer=build/('apksigner.bat' if os.name=='nt' else 'apksigner')
 command=[str(signer)] if os.name=='nt' or os.access(signer,os.X_OK) else ['bash',str(signer)]
 out=subprocess.check_output(command+['verify','--print-certs',str(p)],env=env,text=True)
 return next(line.split(': ',1)[1] for line in out.splitlines() if 'certificate SHA-256 digest' in line)
new=certificate(apk);old_path=r.parent/'知枝-安卓验证版.apk';old=certificate(old_path) if old_path.exists() else None
integration=r.parent/'知枝-整合验证版-0.7.0.apk'
previous=certificate(integration) if integration.exists() else None
checked=[]
with zipfile.ZipFile(apk) as z:
 for p in (r/'static').rglob('*'):
  if p.is_file():
   rel=p.relative_to(r/'static').as_posix();assert z.read('assets/public/'+rel)==p.read_bytes(),rel;checked.append(rel)
aapt=build/('aapt.exe' if os.name=='nt' else 'aapt')
if os.name!='nt' and not os.access(aapt,os.X_OK):aapt=tools/'native-tools'/('user-'+str(os.getuid()))/'aapt2'
badging=subprocess.check_output([str(aapt),'dump','badging',str(apk)],env=env,text=True).splitlines()[0]
assert "versionCode='5'" in badging and "name='app.zhizhi.personal.v1'" in badging and f"versionName='{version}'" in badging
report={'version':version,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'apkBytes':apk.stat().st_size,'assetsCompared':len(checked),'signatureVerified':True,'sameCertificateAs061':new==old if old else None,'sameCertificateAs070':new==previous if previous else None,'installation':'independent app.zhizhi.personal.v1; keep older apps and migrate via archive export/import','certificateSha256':new,'package':badging}
(r/'apk-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
