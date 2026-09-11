"""Inline local ES modules and CAD into one offline, double-clickable HTML."""
from pathlib import Path
import base64,json
p=Path(__file__).parent
uri=lambda s:'data:text/javascript;base64,'+base64.b64encode(s.encode()).decode()
core=uri((p/'vendor/three.core.js').read_text())
three=uri((p/'vendor/three.module.js').read_text().replace('./three.core.js',core))
imports={'rapier':uri((p/'vendor/rapier.js').read_text()),'fast-optics':uri((p/'fast-optics.js').read_text()),'three':three,'cannon-es':uri((p/'vendor/cannon-es.js').read_text()),'orbit':uri((p/'vendor/OrbitControls.js').read_text()),'hdr':uri((p/'vendor/HDRLoader.js').read_text()),'model':uri((p/'model.js').read_text())}
hdri='data:application/octet-stream;base64,'+base64.b64encode((p/'assets/studio_small_08_1k.hdr').read_bytes()).decode()
s=(p/'shell.html').read_text().replace('<!-- IMPORTS -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>').replace('/* CAD */','const CAD = '+(p/'assets/cad.json').read_text()+';').replace('/* HDRI */','const HDRI = '+json.dumps(hdri)+';').replace('/* APP */',(p/'app.js').read_text()).replace('/* STYLE */',(p/'style.css').read_text())
(p/'PROTOTYPE-viewer.html').write_text(s)
print('Built',len(s.encode()),'bytes, offline HTML')

photo='data:image/png;base64,'+base64.b64encode((p/'assets/glass-photo.png').read_bytes()).decode()
photo_page=(p/'photo-shell.html').read_text().replace('/* PHOTO */','const PHOTO = '+json.dumps(photo)+';').replace('/* PHOTO_APP */',(p/'photo.js').read_text())
(p/'PROTOTYPE-photo.html').write_text(photo_page)
print('Built photo prototype',len(photo_page.encode()),'bytes')
