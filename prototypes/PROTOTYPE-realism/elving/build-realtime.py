"""Build the interactive GPU view; keep the CPU control as a separate artifact."""
from pathlib import Path
import base64,json
p=Path(__file__).resolve().parent
def uri(source):return 'data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
imports={name:uri((p/file).read_text().replace("'./cad-solid.mjs'", "'cad-solid'").replace("'../geometry.mjs'", "'chip-geometry'").replace("'./view-orientation.mjs'", "'view-orientation'").replace("'./chip-surface.mjs'", "'chip-surface'").replace("'./broken-chip.mjs'", "'broken-chip'").replace("'./chip-optics.mjs'", "'chip-optics'")) for name,file in [('cad-solid','cad-solid.mjs'),('realtime-glass','realtime-glass.mjs'),('prism-view','prism-view.mjs'),('chips-physics','chips-physics.mjs'),('pbr-chips-view','pbr-chips-view.mjs'),('world-backdrop','world-backdrop.mjs'),('view-orientation','view-orientation.mjs'),('chip-surface','chip-surface.mjs'),('chip-optics','chip-optics.mjs'),('broken-chip','broken-chip.mjs'),('chip-geometry','../geometry.mjs')]}
imports['rapier']=uri((p.parents[1]/'PROTOTYPE-optics/vendor/rapier.js').read_text())
vendor=p.parents[1]/'PROTOTYPE-optics/vendor'
imports['three-core']=uri((vendor/'three.core.js').read_text())
imports['three']=uri((vendor/'three.module.js').read_text().replace('./three.core.js','three-core'))
imports['HDRLoader']=uri((vendor/'HDRLoader.js').read_text())
environment=base64.b64encode((p.parents[1]/'PROTOTYPE-optics/assets/forest_slope_1k.hdr').read_bytes()).decode()
cad=json.loads((p.parents[1]/'PROTOTYPE-optics/assets/cad.json').read_text())
cad={name:cad[name] for name in ['elving','prizma','glazok','trubka','nasipka','krishka']}
app=(p/'realtime-app.mjs').read_text().replace("'./realtime-glass.mjs'","'realtime-glass'").replace("'./prism-view.mjs'","'prism-view'").replace("'./chips-physics.mjs'","'chips-physics'").replace("'./pbr-chips-view.mjs'","'pbr-chips-view'").replace("'./world-backdrop.mjs'","'world-backdrop'")
page=(p/'realtime-shell.html').read_text().replace('<!-- IMPORTS -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>').replace('/* CAD */','const CAD='+json.dumps(cad)+';const ENVIRONMENT_BASE64='+json.dumps(environment)+';').replace('/* APP */',app)
(p/'PROTOTYPE-realtime.html').write_text(page)
print(f'Built realtime prism: {len(page.encode())} bytes')
