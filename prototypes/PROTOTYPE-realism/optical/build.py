from pathlib import Path
import base64,json
p=Path(__file__).resolve().parent
def uri(s):return 'data:text/javascript;base64,'+base64.b64encode(s.encode()).decode()
imports={'geometry':uri((p.parent/'geometry.mjs').read_text())}
for name in ['transport','fast']:
 s=(p/f'{name}.mjs').read_text().replace("'../geometry.mjs'","'geometry'")
 imports[name]=uri(s)
app=(p/'app.mjs').read_text().replace("'./transport.mjs'","'transport'").replace("'./fast.mjs'","'fast'")
page=(p/'shell.html').read_text().replace('<!-- IMPORTS -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>').replace('/* APP */',app)
(p/'PROTOTYPE-optical.html').write_text(page)
print('Built',len(page.encode()),'bytes')
