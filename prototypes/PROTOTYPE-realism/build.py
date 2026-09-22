"""Single offline HTML. Reuse original same-project vendors and CAD only at build time."""
from pathlib import Path
import base64,json
p=Path(__file__).resolve().parent
original=p.parent/'PROTOTYPE-optics'
def uri(text):return 'data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
core=uri((original/'vendor/three.core.js').read_text())
imports={'three':uri((original/'vendor/three.module.js').read_text().replace('./three.core.js',core)),'rapier':uri((original/'vendor/rapier.js').read_text())}
# Relative source imports become bare keys in embedded modules.
for name in ['geometry','physics','view']:
 source=(p/f'{name}.mjs').read_text().replace("'./geometry.mjs'","'realism-geometry'")
 imports[f'realism-{name}']=uri(source)
app=(p/'app.mjs').read_text()
for name in ['geometry','physics','view']:app=app.replace(f"'./{name}.mjs'",f"'realism-{name}'")
cad=json.loads((original/'assets/cad.json').read_text());cad={k:cad[k] for k in ['elving','trubka','nasipka','krishka']}
page=(p/'shell.html').read_text().replace('<!-- IMPORTS -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>').replace('/* CAD */','const CAD='+json.dumps(cad)+';').replace('/* APP */',app)
(p/'PROTOTYPE-lab.html').write_text(page)
print(f'Built offline lab: {len(page.encode())} bytes')
