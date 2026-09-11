"""PROTOTYPE: tessellate user STEP assembly; preserve CAD millimetres."""
import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,'/Applications/FreeCAD.app/Contents/Resources/lib')
import FreeCAD,Part
root=Path(__file__).parent
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/Users/owner/Downloads/glazok(1)')
result={}
for path in sorted(source.glob('*.step')):
 shape=Part.Shape();shape.read(str(path));vertices,faces=shape.tessellate(0.3)
 name=path.stem.split(' - ')[1]
 result[name]={'positions':[round(n,5) for p in vertices for n in (p.x,p.y,p.z)],'indices':[i for f in faces for i in f],'source':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 print(name,len(vertices),len(faces),flush=True)
(root/'assets/cad.json').write_text(json.dumps(result,separators=(',',':')))
