"""Read-only topology/dimensions of the supplied STEP assembly using FreeCAD Python."""
import sys,json,hashlib
from pathlib import Path
from collections import Counter
sys.path.insert(0,'/Applications/FreeCAD.app/Contents/Resources/lib')
import FreeCAD,Part
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/Users/owner/Downloads/glazok(1)')
rows=[]
for path in sorted(source.glob('*.step')):
 s=Part.Shape();s.read(str(path));b=s.BoundBox
 rows.append({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'solids':len(s.Solids),'faces':len(s.Faces),'surfaceTypes':dict(Counter(type(f.Surface).__name__ for f in s.Faces)),'boundsMm':[[b.XMin,b.XMax],[b.YMin,b.YMax],[b.ZMin,b.ZMax]],'volumeMm3':s.Volume,'cylinderRadiiMm':sorted(set(round(f.Surface.Radius,8) for f in s.Faces if type(f.Surface).__name__=='Cylinder'))})
output=Path(__file__).with_suffix('.json');output.write_text(json.dumps(rows,indent=2));print(json.dumps(rows,indent=2))
