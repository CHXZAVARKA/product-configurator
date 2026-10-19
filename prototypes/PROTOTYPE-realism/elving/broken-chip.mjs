import { volumeMm3 } from '../geometry.mjs';

// A fragment is an intersection of independently tilted fracture halfspaces.
// There is no shared top/bottom outline or intermediate gemstone girdle.
// Supplier names and fractions are the confirmed September 2026 filling
// specification for «Авторский». RGB remains a visual approximation because
// the supplier does not publish calibrated colour-profile data.
export const AUTHOR_FILL_MASS_G=11.4;
export const AUTHOR_FILL_DEPTH_MM=14;
export const AUTHOR_FILL_COLORS=Object.freeze([
 {id:'kiwi',name:'Киви',fractionMm:'6–7',rgb:[.30,.72,.08]},
 {id:'blue',name:'Голубая',fractionMm:'7',rgb:[.08,.44,.88]},
 {id:'sky',name:'Небесная',fractionMm:'6',rgb:[.28,.72,.96]},
 {id:'scarlet-mix',name:'Алая микс',fractionMm:'6',rgb:[.91,.08,.045]},
 {id:'ruby',name:'Рубиновая',fractionMm:'5',rgb:[.55,.012,.10]},
 {id:'bright-blue',name:'Ярко-синяя',fractionMm:'5',rgb:[.025,.13,.92]},
 {id:'fuchsia',name:'Фуксия',fractionMm:'5–6',rgb:[.95,.06,.78]},
 {id:'orange-yellow',name:'Оранжево-жёлтая',fractionMm:'6',rgb:[.98,.72,.035]},
 {id:'aquamarine',name:'Аквамарин',fractionMm:'6',rgb:[.02,.75,.79]},
 {id:'dark-blue',name:'Тёмно-синяя',fractionMm:'5',rgb:[.012,.035,.29]},
]);
// Forty visible fragments in the owner's full 11.4 g filling photograph.
// Diameter is the longest projected dimension, calibrated with the 20.5 mm
// one-ruble coin. Height is the owner's approximate measurement, not a photo
// measurement. The ice-coloured pieces use a pale visual variant of sky blue.
const PHOTO_PIECES=[
 [6.5,2.5,'orange-yellow','wedge'],[9,3,'dark-blue','splinter'],[7,3,'orange-yellow','short'],[7,3,'orange-yellow','wedge'],[7,3,'fuchsia','short'],
 [10,5,'aquamarine','wedge'],[11,5,'aquamarine','splinter'],[8,3,'ruby','wedge'],[10,5,'kiwi','short'],[7,3,'orange-yellow','wedge'],
 [5,2.5,'bright-blue','splinter'],[8,3,'kiwi','wedge'],[6,2.5,'sky','short'],[10,5,'fuchsia','short'],[9,3,'scarlet-mix','wedge'],
 [8,3,'kiwi','short'],[12.5,5,'blue','wedge'],[10,5,'fuchsia','wedge'],[9,3,'sky','short'],[11,5,'ruby','splinter'],
 [7.5,3,'orange-yellow','short'],[9,3,'orange-yellow','wedge'],[8.5,3,'orange-yellow','short'],[6.5,2.5,'sky','short'],[6,2.5,'fuchsia','short'],
 [11,5,'bright-blue','wedge'],[6.5,2.5,'fuchsia','short'],[8,3,'orange-yellow','short'],[5.5,2.5,'dark-blue','splinter'],[10,5,'aquamarine','wedge'],
 [5,2.5,'bright-blue','splinter'],[9,3,'sky','wedge'],[8,3,'scarlet-mix','short'],[7,3,'dark-blue','short'],[8.5,3,'orange-yellow','short'],
 [5.5,2.5,'bright-blue','splinter'],[10,5,'aquamarine','splinter'],[11,5,'orange-yellow','wedge'],[10,5,'orange-yellow','wedge'],[9,3,'ruby','short'],
];
export const PHOTO_FILL_PROFILE=Object.freeze(PHOTO_PIECES.map(([diameterMm,heightMm,colorId,family],id)=>Object.freeze({id,diameterMm,heightMm,colorId,family,ice:colorId==='sky'&&[12,18,23,31].includes(id)})));
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
 const faces=[],indices=[];let worst=0,cornerCutCount=0;
 for(const plane of planes) {
  const face=vertices.map((p,i)=>Math.abs(dot(plane.n,p)-plane.d)<1e-7?i:-1).filter(i=>i>=0);
  if(face.length<3)continue;
  if(plane.cornerCut)cornerCutCount++;
  const center=[0,1,2].map(k=>face.reduce((s,i)=>s+vertices[i][k],0)/face.length),n=unit(plane.n);
  const u=unit(cross(Math.abs(n[2])<.8?[0,0,1]:[0,1,0],n)),v=cross(n,u);
  face.sort((a,b)=>Math.atan2(dot(sub(vertices[a],center),v),dot(sub(vertices[a],center),u))-Math.atan2(dot(sub(vertices[b],center),v),dot(sub(vertices[b],center),u)));
  const result=triangulate(face,vertices);worst=Math.max(worst,result.score);indices.push(...result.triangles.flat());faces.push(face);
 }
 return {vertices,indices,faces,worst,cornerCutCount};
}
// A photographed shard is a piece of a fractured sheet, not a bevelled gem.
// Unequal radial fractures and several independent upper/lower breaks make
// lopsided faces and a genuinely varying edge thickness. The result remains a
// closed convex hull so the visual source and Rapier collider describe the
// same solid.
function makePhotoShard(id,random,options,colourSpec,attempt=0) {
 const family=options.family??'short',bulk=clamp(options.bulk??.65);
 const sides=family==='splinter'?8:family==='wedge'?7:9;
 const weights=Array.from({length:sides},()=>.78+random()*.44),sum=weights.reduce((a,b)=>a+b,0);
 const phase=random()*Math.PI*2,elongation=family==='splinter'?.76+random()*.10:family==='wedge'?.92+random()*.10:.98+random()*.12;
 let angle=phase;
 const planes=[];
 for(let i=0;i<sides;i++){
  angle+=weights[i]*Math.PI*2/sum;
  const span=family==='splinter'?.20:.26;
  planes.push({n:[Math.cos(angle),Math.sin(angle)/elongation,(random()-.5)*span],d:2.29+random()*.30});
 }
 const slope=family==='wedge'?.25:.17;
 const topAngle=random()*Math.PI*2,bottomAngle=topAngle+(.6+random()*.9)*Math.PI;
 planes.push({n:[Math.cos(topAngle)*slope,Math.sin(topAngle)*slope,1],d:.84+random()*.16});
 planes.push({n:[Math.cos(bottomAngle)*slope,Math.sin(bottomAngle)*slope,-1],d:.84+random()*.16});
 // Interrupted cleavage planes clip only parts of the broad faces. They do
 // not share a top/bottom contour or produce a uniform bevel around the rim.
 for(const sign of [1,-1])for(let i=0;i<2;i++){
  const a=phase+random()*Math.PI*2;
  planes.push({n:[Math.cos(a)*(.17+random()*.13),Math.sin(a)*(.17+random()*.13),sign],d:1.50+random()*.24});
 }
 let solid=intersect(planes);
 for(let i=0;i<2;i++){
  const corners=solid.vertices.filter(v=>Math.hypot(v[0],v[1])>1.2);
  if(!corners.length)break;
  const corner=corners[Math.floor(random()*corners.length)],length=Math.hypot(corner[0],corner[1]);
  const n=[corner[0]/length,corner[1]/length,(random()-.5)*.65];
  const cut={n,d:dot(n,corner)-(.10+random()*.16),cornerCut:true};
  const clipped=intersect([...planes,cut]);
  if(clipped.vertices.length>=9&&clipped.worst<15){planes.push(cut);solid=clipped;}
 }
 if(solid.vertices.length<9||solid.worst>15){
  if(attempt>=19)throw Error(`Invalid photo fracture ${id}: ${solid.vertices.length} vertices, aspect ${solid.worst}`);
  return makePhotoShard(id,random,options,colourSpec,attempt+1);
 }
 const center=[0,1,2].map(k=>(Math.min(...solid.vertices.map(v=>v[k]))+Math.max(...solid.vertices.map(v=>v[k])))/2);
 let vertices=solid.vertices.map(v=>sub(v,center));
 const radius=family==='splinter'?2.68:2.77,halfHeight=(.98+.08*bulk)*(family==='splinter'?.90:1);
 const xy=radius/Math.max(...vertices.map(v=>Math.hypot(v[0],v[1]))),z=halfHeight/Math.max(...vertices.map(v=>Math.abs(v[2])));
 vertices=vertices.map(([x,y,h])=>[x*xy,y*xy,h*z]);
 const color=(options.ice?[.78,.91,.98]:colourSpec.rgb).map(v=>Math.min(1,v*(.92+random()*.16)));
 return {id,vertices,indices:solid.indices,color,colorId:colourSpec.id,colorName:colourSpec.name,supplierFractionMm:colourSpec.fractionMm,thicknessMm:2*halfHeight,volumeMm3:volumeMm3(vertices,solid.indices),shapeAudit:{family,bulk,faceCount:solid.faces.length,cornerCutCount:solid.cornerCutCount,halfspaceIntersection:true,pairedXYContours:false,photoFracture:true},provenance:'Procedural fractured-sheet hypothesis guided by the owner photograph; measured diameter, thickness and weighed fill are applied by the physics profile.'};
}
export function makeBrokenChip(id,random,thin=false,options={}) {
 const requestedColor=options.colorId&&AUTHOR_FILL_COLORS.findIndex(spec=>spec.id===options.colorId);
 if(options.colorId&&requestedColor<0)throw Error(`Unknown glass color: ${options.colorId}`);
 const colourIndex=options.colorId?requestedColor:id<AUTHOR_FILL_COLORS.length?id:Math.floor(random()*AUTHOR_FILL_COLORS.length);
 const colourSpec=AUTHOR_FILL_COLORS[colourIndex];
 if(options.photo)return makePhotoShard(id,random,options,colourSpec);
 const bulk=clamp(options.bulk??.65),choice=random();
 const family=options.family??(thin?'flake':choice<.52?'short':choice<.81?'wedge':choice<.93?'splinter':'flake');
 if(!['short','wedge','splinter','flake'].includes(family))throw Error(`Unknown glass shape: ${family}`);
 const n=random()<(family==='short'?.40:family==='wedge'?.25:.12)?5:4;
 const elongation=family==='splinter'?.48+random()*.24:family==='wedge'?.66+random()*.32:family==='flake'?.70+random()*.26:.74+random()*.26;
 const phase=random()*Math.PI*2;
 const limit=thin?.8975:1.0975;
 const halfHeight=limit*(.88+.12*bulk)*(family==='flake'&&!thin?.88:1);
 const targetVolume=(thin?19.0:family==='short'?25.0:family==='wedge'?24.0:family==='splinter'?20.0:20.0)*(.88+.12*bulk)/.958;
 let solid,bestSolid,bestVolume=0;
 for(let attempt=0;attempt<128;attempt++) {
  const planes=[];
  for(let i=0;i<n;i++) {
   const angle=phase+(i+(random()-.5)*.30)*Math.PI*2/n;
   planes.push({n:[Math.cos(angle),Math.sin(angle)/elongation,(random()-.5)*(.34+.18*(1-bulk))],d:2.12+(random()-.5)*.40});
  }
  const slope=family==='wedge'?.46:family==='flake'?.34:.30+random()*.14;
  planes.push({n:[(random()-.5)*slope,(random()-.5)*slope,1],d:1});
  planes.push({n:[(random()-.5)*slope,(random()-.5)*slope,-1],d:1});
  // Cut long corners by different oblique planes. This clips
  // actual long corners, rather than imposing a regular ring of bevels.
  const cutCount=random()<.35?3:2;
  for(let cut=0;cut<cutCount;cut++) {
   const preview=intersect(planes),corner=preview.vertices.reduce((a,b)=>Math.hypot(a[0],a[1])>Math.hypot(b[0],b[1])?a:b);
   const radius=Math.hypot(corner[0],corner[1]),tilt=(cut%2?-.42:.48)+(random()-.5)*.34;
   const normal=[corner[0]/radius,corner[1]/radius,tilt];
   planes.push({n:normal,d:dot(normal,corner)-radius*(.14+random()*.12),cornerCut:true});
  }
  solid=intersect(planes);
  const midpoint=[0,1,2].map(k=>(Math.min(...solid.vertices.map(v=>v[k]))+Math.max(...solid.vertices.map(v=>v[k])))/2);
  const centered=solid.vertices.map(v=>sub(v,midpoint));
  const xy=2.77/Math.max(...centered.map(v=>Math.hypot(v[0],v[1]))),z=halfHeight/Math.max(...centered.map(v=>Math.abs(v[2])));
  // Judge and triangulate the final proportions, since compressing the Z
  // extent can turn a well-shaped source triangle into a needle.
  const sized=centered.map(([x,y,height])=>[x*xy,y*xy,height*z]);
  const triangulations=solid.faces.map(face=>triangulate(face,sized));
  solid.indices=triangulations.flatMap(result=>result.triangles.flat());
  solid.worst=Math.max(...triangulations.map(result=>result.score));
  const candidateVolume=volumeMm3(sized,solid.indices);
  if(solid.vertices.length>=8&&solid.worst<8.5) {
   if(candidateVolume>bestVolume){bestSolid=solid;bestVolume=candidateVolume;}
   if(candidateVolume>=targetVolume)break;
  }
 }
 // A slender family may not reach its volume target within the bounded
 // search. Keep its best sound candidate rather than the last rejected hull.
 solid=bestSolid??solid;
 let {vertices,indices,faces}=solid;
 const center=[0,1,2].map(k=>(Math.min(...vertices.map(v=>v[k]))+Math.max(...vertices.map(v=>v[k])))/2);
 vertices=vertices.map(v=>sub(v,center));
 const radius=family==='splinter'?2.65+random()*.15:2.77+random()*.03;
 const xyScale=radius/Math.max(...vertices.map(v=>Math.hypot(v[0],v[1])));
 const zScale=halfHeight/Math.max(...vertices.map(v=>Math.abs(v[2])));
 vertices=vertices.map(([x,y,z])=>[x*xyScale,y*xyScale,z*zScale]);
 const color=(options.ice?[.78,.91,.98]:colourSpec.rgb).map(v=>Math.min(1,v*(.92+random()*.16)));
 const thicknessMm=2*halfHeight;
 return {id,vertices,indices,color,colorId:colourSpec.id,colorName:colourSpec.name,supplierFractionMm:colourSpec.fractionMm,thicknessMm,volumeMm3:volumeMm3(vertices,indices),shapeAudit:{family,bulk,faceCount:faces.length,cornerCutCount:solid.cornerCutCount,halfspaceIntersection:true,pairedXYContours:false},provenance:'Procedural volumetric broken-glass hypothesis guided by the user photograph. Colour names and commercial fractions follow the confirmed «Авторский» supplier list; RGB, exact chip geometry and thickness remain visual hypotheses.'};
}
