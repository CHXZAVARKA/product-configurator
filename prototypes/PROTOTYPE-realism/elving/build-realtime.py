"""Build the interactive GPU view; keep the CPU control as a separate artifact."""
from pathlib import Path
import base64,json
p=Path(__file__).resolve().parent
def uri(source):return 'data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
imports={name:uri((p/file).read_text().replace("'./cad-solid.mjs'", "'cad-solid'")) for name,file in [('cad-solid','cad-solid.mjs'),('realtime-glass','realtime-glass.mjs'),('prism-view','prism-view.mjs')]}
cad=json.loads((p.parents[1]/'PROTOTYPE-optics/assets/cad.json').read_text())
cad={name:cad[name] for name in ['elving','prizma','glazok']}
app=(p/'realtime-app.mjs').read_text().replace("'./realtime-glass.mjs'","'realtime-glass'").replace("'./prism-view.mjs'","'prism-view'")
page=(p/'realtime-shell.html').read_text().replace('<!-- IMPORTS -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>').replace('/* CAD */','const CAD='+json.dumps(cad)+';').replace('/* APP */',app)
(p/'PROTOTYPE-realtime.html').write_text(page)
print(f'Built realtime prism: {len(page.encode())} bytes')
