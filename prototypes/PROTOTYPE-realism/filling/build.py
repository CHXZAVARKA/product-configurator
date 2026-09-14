"""Own offline build. Shared CAD, geometry, physics and view remain read-only."""
from pathlib import Path
import base64,json
p=Path(__file__).resolve().parent
lab=p.parent
original=lab.parent/'PROTOTYPE-optics'
def uri(s):return 'data:text/javascript;base64,'+base64.b64encode(s.encode()).decode()
core=uri((original/'vendor/three.core.js').read_text())
imports={'three':uri((original/'vendor/three.module.js').read_text().replace('./three.core.js',core)),'rapier':uri((original/'vendor/rapier.js').read_text())}
modules={'../geometry.mjs':lab/'geometry.mjs','../physics.mjs':lab/'physics.mjs','../view.mjs':lab/'view.mjs','./free-space.mjs':p/'free-space.mjs','./containment.mjs':p/'containment.mjs','./shards.mjs':p/'shards.mjs','./physics.mjs':p/'physics.mjs'}
keys={name:'filling-module-'+str(i) for i,name in enumerate(modules)}
for name,path in modules.items():
 s=path.read_text()
 if path.parent==lab:s=s.replace("'./geometry.mjs'",repr(keys['../geometry.mjs']))
 else:
  for ref,key in keys.items():s=s.replace(repr(ref),repr(key))
 imports[keys[name]]=uri(s)
app=(p/'app.mjs').read_text()
for name,key in keys.items():app=app.replace(repr(name),repr(key))
cad=json.loads((original/'assets/cad.json').read_text());cad={k:cad[k] for k in ['elving','trubka','nasipka','krishka']}
page=(p/'shell.html').read_text().replace('<!-- IMPORTS -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>').replace('/* CAD */','const CAD='+json.dumps(cad)+';').replace('/* APP */',app)
(p/'PROTOTYPE-filling.html').write_text(page)
print('Built',len(page.encode()),'bytes')
