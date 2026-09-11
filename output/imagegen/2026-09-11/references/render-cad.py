import sys,json,pathlib
sys.path.insert(0,'/Applications/FreeCAD.app/Contents/Resources/lib')
import FreeCAD,Part
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
root=pathlib.Path('/Users/owner/Downloads/glazok(1)')
out=pathlib.Path(__file__).parent
parts=[]
colors={'trubka':'#eee1c8','krishka':'#735638','glazok':'#735638','elving':'#d8a864','prizma':'#96bbc1','nasipka':'#45a6a0','steklo':'#c3e9e5'}
for p in sorted(root.glob('*.step')):
 s=Part.Shape();s.read(str(p)); v,f=s.tessellate(0.45); name=p.stem.split(' - ')[1]
 verts=np.array([[q.x,q.y,q.z] for q in v]); faces=np.array(f)
 parts.append((name,verts,faces))
(out/'cad-parts.json').write_text(json.dumps([{'part':n,'min':v.min(0).tolist(),'max':v.max(0).tolist(),'triangles':len(f)} for n,v,f in parts],indent=2))
fig=plt.figure(figsize=(16,9),facecolor='#f6efdf')
for i in range(2):
 ax=fig.add_subplot(1,2,i+1,projection='3d');ax.set_facecolor('#f6efdf')
 for n,v,f in parts:
  if i==0 and n in ['prizma','nasipka','steklo']:continue
  if i==1 and n=='trubka':continue
  xyz=v.copy()
  if i==1:
   if n in ['krishka','elving','nasipka']:xyz[:,2]-=35
   if n=='glazok':xyz[:,2]+=25
  poly=Poly3DCollection(xyz[f],facecolors=colors[n],linewidths=0,alpha=.55 if n in ['elving','steklo','prizma'] else 1,shade=True)
  ax.add_collection3d(poly)
 ax.set_xlim(-55,55);ax.set_ylim(-55,55);ax.set_zlim(-65,245);ax.set_box_aspect((1,1,2.8));ax.view_init(elev=16,azim=-65);ax.set_axis_off()
 ax.set_title('Сборка из предоставленных STEP' if i==0 else 'Внутренние детали, корпус скрыт',fontfamily='DejaVu Sans',fontsize=17,color='#463321')
fig.text(.5,.03,'CAD reference • Ø40 мм корпус • 202 мм длина корпуса • условные материалы, исходная геометрия сохранена',ha='center',fontsize=12,color='#463321')
plt.savefig(out/'cad-reference.png',dpi=150,facecolor=fig.get_facecolor(),bbox_inches='tight');plt.close(fig)
