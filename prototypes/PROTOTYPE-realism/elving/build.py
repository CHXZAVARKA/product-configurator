"""Build an offline actual-CAD test without touching the existing prototype."""
from pathlib import Path
import base64,json
p=Path(__file__).resolve().parent
def uri(text):return 'data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
imports={}
imports['elving-solid']=uri((p/'cad-solid.mjs').read_text())
imports['elving-render']=uri((p/'render.mjs').read_text().replace("'./cad-solid.mjs'","'elving-solid'"))
app=(p/'app.mjs').read_text().replace("'./cad-solid.mjs'","'elving-solid'").replace("'./render.mjs'","'elving-render'")
cad=json.loads((p.parents[1]/'PROTOTYPE-optics/assets/cad.json').read_text())['elving']
page=(p/'shell.html').read_text().replace('<!-- IMPORTS -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>').replace('/* CAD */','const CAD='+json.dumps(cad)+';').replace('/* APP */',app)
(p/'PROTOTYPE-elving.html').write_text(page)
print(f'Built offline CAD elving: {len(page.encode())} bytes')
