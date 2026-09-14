import { volumeMm3 } from '../geometry.mjs';

// A fragment is an intersection of independently tilted fracture halfspaces.
// There is no shared top/bottom outline or intermediate gemstone girdle.
const colors=[[.025,.57,.66],[.67,.035,.43],[.025,.12,.58],[.94,.29,.018],[.30,.085,.48],[.035,.48,.08],[.63,.78,.76],[.76,.66,.63],[.71,.74,.81],[.62,.47,.65],[.70,.13,.18],[.91,.61,.035]];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>v.map(x=>x/Math.hypot(...v));
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:.65));
const aspect=(a,b,c)=>Math.max(dot(sub(a,b),sub(a,b)),dot(sub(b,c),sub(b,c)),dot(sub(c,a),sub(c,a)))/Math.hypot(...cross(sub(b,a),sub(c,a)));
function triangulate(face,vertices,first=0,last=face.length-1) {
 if(last-first<2)return {score:0,triangles:[]};
 let best={score:Infinity,triangles:[]};
 for(let mid=first+1;mid<last;mid++) {
  const left=triangulate(face,vertices,first,mid),right=triangulate(face,vertices,mid,last);
  const score=Math.max(aspect(vertices[face[first]],vertices[face[mid]],vertices[face[last]]),left.score,right.score);
  if(score<best.score)best={score,triangles:[...left.triangles,...right.triangles,[face[first],face[mid],face[last]]]};
 }
 return best;
}
function intersect(planes) {
 const vertices=[];
 for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++)for(let k=j+1;k<planes.length;k++) {
  const a=planes[i],b=planes[j],c=planes[k],bc=cross(b.n,c.n),det=dot(a.n,bc);
  if(Math.abs(det)<1e-8)continue;
  const ca=cross(c.n,a.n),ab=cross(a.n,b.n),p=bc.map((v,l)=>(a.d*v+b.d*ca[l]+c.d*ab[l])/det);
  if(planes.every(q=>dot(q.n,p)<=q.d+1e-8)&&!vertices.some(q=>Math.hypot(...sub(q,p))<1e-7))vertices.push(p);
 }
 const faces=[],indices=[];let worst=0;
 for(const plane of planes) {
  const face=vertices.map((p,i)=>Math.abs(dot(plane.n,p)-plane.d)<1e-7?i:-1).filter(i=>i>=0);
  if(face.length<3)continue;
  const center=[0,1,2].map(k=>face.reduce((s,i)=>s+vertices[i][k],0)/face.length),n=unit(plane.n);
  const u=unit(cross(Math.abs(n[2])<.8?[0,0,1]:[0,1,0],n)),v=cross(n,u);
  face.sort((a,b)=>Math.atan2(dot(sub(vertices[a],center),v),dot(sub(vertices[a],center),u))-Math.atan2(dot(sub(vertices[b],center),v),dot(sub(vertices[b],center),u)));
  const result=triangulate(face,vertices);worst=Math.max(worst,result.score);indices.push(...result.triangles.flat());faces.push(face);
 }
 return {vertices,indices,faces,worst};
}
export function makeBrokenChip(id,random,thin=false,options={}) {
 const bulk=clamp(options.bulk??.65),choice=random();
 const family=thin?'flake':choice<.68?'short':choice<.91?'wedge':choice<.97?'splinter':'flake';
 const n=family==='short'&&random()<.22?5:4;
 const elongation=family==='splinter'?.58+random()*.20:family==='wedge'?.70+random()*.28:.82+random()*.18;
 const phase=random()*Math.PI*2;
 const limit=thin?.8975:1.0975;
 const halfHeight=limit*(.88+.12*bulk)*(family==='flake'&&!thin?.88:1);
 const targetVolume=(thin?19.0:family==='short'?24.0:family==='wedge'?22.5:family==='splinter'?17.5:19.0)*(.88+.12*bulk)/.958;
 let solid;
 for(let attempt=0;attempt<128;attempt++) {
  const planes=[];
  for(let i=0;i<n;i++) {
   const angle=phase+(i+(random()-.5)*.30)*Math.PI*2/n;
   planes.push({n:[Math.cos(angle),Math.sin(angle)/elongation,(random()-.5)*(.34+.18*(1-bulk))],d:2.12+(random()-.5)*.40});
  }
  const slope=family==='wedge'?.46:family==='flake'?.34:.30+random()*.14;
  planes.push({n:[(random()-.5)*slope,(random()-.5)*slope,1],d:1});
  planes.push({n:[(random()-.5)*slope,(random()-.5)*slope,-1],d:1});
  // Cut the farthest two corners by different oblique planes. This clips
  // actual long corners, rather than imposing a regular ring of bevels.
  const cutCount=random()<.70?2:1;
  for(let cut=0;cut<cutCount;cut++) {
   const preview=intersect(planes),corner=preview.vertices.reduce((a,b)=>Math.hypot(a[0],a[1])>Math.hypot(b[0],b[1])?a:b);
   const radius=Math.hypot(corner[0],corner[1]),tilt=(cut?-.28:.38)+(random()-.5)*.20;
   planes.push({n:[corner[0]/radius,corner[1]/radius,tilt],d:radius*(.77+random()*.07)});
  }
  solid=intersect(planes);
  const midpoint=[0,1,2].map(k=>(Math.min(...solid.vertices.map(v=>v[k]))+Math.max(...solid.vertices.map(v=>v[k])))/2);
  const centered=solid.vertices.map(v=>sub(v,midpoint));
  const xy=2.77/Math.max(...centered.map(v=>Math.hypot(v[0],v[1]))),z=halfHeight/Math.max(...centered.map(v=>Math.abs(v[2])));
  const candidateVolume=volumeMm3(centered,solid.indices)*xy*xy*z;
  if(solid.vertices.length>=8&&solid.worst<10.5&&candidateVolume>=targetVolume)break;
 }
 let {vertices,indices,faces}=solid;
 const center=[0,1,2].map(k=>(Math.min(...vertices.map(v=>v[k]))+Math.max(...vertices.map(v=>v[k])))/2);
 vertices=vertices.map(v=>sub(v,center));
 const radius=family==='splinter'?2.65+random()*.15:2.77+random()*.03;
 const xyScale=radius/Math.max(...vertices.map(v=>Math.hypot(v[0],v[1])));
 const zScale=halfHeight/Math.max(...vertices.map(v=>Math.abs(v[2])));
 vertices=vertices.map(([x,y,z])=>[x*xyScale,y*xyScale,z*zScale]);
 const color=colors[(id+Math.floor(random()*colors.length))%colors.length].map(v=>Math.min(1,v*(.92+random()*.16)));
 const thicknessMm=2*halfHeight;
 return {id,vertices,indices,color,thicknessMm,volumeMm3:volumeMm3(vertices,indices),shapeAudit:{family,bulk,faceCount:faces.length,halfspaceIntersection:true,pairedXYContours:false},provenance:'Procedural volumetric broken-glass hypothesis guided by the user photograph: irregular intersections of independent 3D fracture planes, short chunks, wedges, splinters and flakes; dimensions and palette are not measured STEP parts.'};
}
