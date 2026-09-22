import assert from 'node:assert/strict';
import { makeBrokenChip } from '../elving/broken-chip.mjs';
import { buildChipSurface } from '../elving/chip-surface.mjs';

const randomFrom=seed=>{let n=seed>>>0;return()=>{n+=0x6d2b79f5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};};
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
const reports=[];
for(const thin of [false,true]) {
 const random=randomFrom(0x4e17a9),repeat=randomFrom(0x4e17a9),chips=[],signatures=new Set(),families=new Set(),familyCounts={};
 let maxAspect=0,maxSurfaceAspect=0,minVolume=Infinity,maxVolume=0,maxRadius=0,maxZ=0,sumBroadFaceAngle=0,irregularEdgeCount=0,sumCornerCuts=0,minPlanarAspect=Infinity,maxPlanarAspect=0;
 for(let id=0;id<512;id++) {
  const chip=makeBrokenChip(id,random,thin);
  assert.deepEqual(chip,makeBrokenChip(id,repeat,thin),'Seed reproducibility');
  const {vertices,indices}=chip,center=[0,1,2].map(k=>vertices.reduce((sum,p)=>sum+p[k],0)/vertices.length),edges=new Map();
  assert.equal(indices.length/3,2*vertices.length-4,'Closed sphere Euler triangle count');
  for(let i=0;i<indices.length;i+=3) {
   const ids=indices.slice(i,i+3),[a,b,c]=ids.map(j=>vertices[j]),normal=cross(sub(b,a),sub(c,a)),area2=Math.hypot(...normal);
   assert(area2>1e-8,'Nondegenerate triangle');
   assert(dot(normal,sub(a,center))>1e-8,'Outward winding');
   assert(vertices.every(p=>dot(normal,sub(p,a))<1e-8),'Every hull vertex inside every outward face');
   maxAspect=Math.max(maxAspect,Math.max(dot(sub(a,b),sub(a,b)),dot(sub(b,c),sub(b,c)),dot(sub(c,a),sub(c,a)))/area2);
   for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;const edge=edges.get(key)||[];edge.push([a,b]);edges.set(key,edge);}
  }
  for(const edge of edges.values()){assert.equal(edge.length,2,'Closed manifold edge');assert.equal(edge[0][0],edge[1][1],'Opposing edge winding');}
  maxRadius=Math.max(maxRadius,...vertices.map(p=>Math.hypot(p[0],p[1])));maxZ=Math.max(maxZ,...vertices.map(p=>Math.abs(p[2])));
  minVolume=Math.min(minVolume,chip.volumeMm3);maxVolume=Math.max(maxVolume,chip.volumeMm3);
  assert(chip.volumeMm3>9);
  for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++)assert(Math.hypot(vertices[i][0]-vertices[j][0],vertices[i][1]-vertices[j][1])>1e-6,'Top and bottom do not repeat a common XY contour');
  const planes=[];
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(j=>vertices[j]),normal=cross(sub(b,a),sub(c,a)),unit=normal.map(v=>v/Math.hypot(...normal));if(!planes.some(n=>dot(n,unit)>1-1e-9))planes.push(unit);}
  assert(planes.length>=6,'Few independent 3D clipping planes');
  assert(planes.filter(n=>Math.abs(n[2])>.003&&Math.abs(n[2])<.95).length>=3,'Side planes slope in 3D instead of forming a vertical extrusion');
  assert(!planes.some((n,i)=>planes.slice(i+1).some(m=>dot(n,m)<-1+1e-10)),'No parallel duplicated slab faces');
  const top=planes.reduce((a,b)=>a[2]>b[2]?a:b),bottom=planes.reduce((a,b)=>a[2]<b[2]?a:b);sumBroadFaceAngle+=Math.acos(Math.max(-1,Math.min(1,-dot(top,bottom))));
  const lengths=[...edges.values()].map(e=>Math.hypot(...sub(vertices[e[0][0]],vertices[e[0][1]])));if(Math.max(...lengths)/Math.min(...lengths)>1.6)irregularEdgeCount++;assert(chip.color.every(c=>c>=0&&c<=1));
  const xx=vertices.reduce((s,p)=>s+(p[0]-center[0])**2,0),yy=vertices.reduce((s,p)=>s+(p[1]-center[1])**2,0),xy=vertices.reduce((s,p)=>s+(p[0]-center[0])*(p[1]-center[1]),0),spread=Math.hypot(xx-yy,2*xy);
  const planarAspect=Math.sqrt((xx+yy+spread)/(xx+yy-spread));minPlanarAspect=Math.min(minPlanarAspect,planarAspect);maxPlanarAspect=Math.max(maxPlanarAspect,planarAspect);
  signatures.add(JSON.stringify(vertices));families.add(chip.shapeAudit.family);familyCounts[chip.shapeAudit.family]=(familyCounts[chip.shapeAudit.family]||0)+1;sumCornerCuts+=chip.shapeAudit.cornerCutCount;chips.push(chip);
  if(id<96) {
   const skin=buildChipSurface(chip);
   assert(skin.audit.maxOutsideHullMm<1e-8,'Surface stays in collision envelope');
   assert(skin.audit.minOutwardDot>0,'Surface remains outward');
   for(let i=0;i<skin.indices.length;i+=3){const [a,b,c]=skin.indices.slice(i,i+3).map(j=>skin.vertices[j]),area2=Math.hypot(...cross(sub(b,a),sub(c,a)));const aspect=Math.max(dot(sub(a,b),sub(a,b)),dot(sub(b,c),sub(b,c)),dot(sub(c,a),sub(c,a)))/area2;maxSurfaceAspect=Math.max(maxSurfaceAspect,aspect);assert(aspect<25,'Subdivided surface triangle aspect');}
  }
 }
 assert.equal(signatures.size,512,'Unique contours');assert.equal(families.size,thin?1:4,'Volumetric shape families');
 assert(maxRadius<=2.800000001);assert(maxZ<=(thin?.8975000001:1.0975000001));assert(maxVolume/minVolume>(thin?1.2:1.7),'Meaningful volume variation');assert(maxAspect<25);
 assert(sumBroadFaceAngle/chips.length>.055,'Independent broad planes have visible angular separation');assert(irregularEdgeCount>chips.length*.9,'Substantially unequal edge lengths dominate the population');
 const meanVolume=chips.reduce((s,c)=>s+c.volumeMm3,0)/chips.length;assert(meanVolume>(thin?18:24),'Retain useful packing volume');
 assert(sumCornerCuts/chips.length>1.8,'Multiple independent corner cuts remain real hull faces');
 if(!thin){assert(familyCounts.short<chips.length*.65&&familyCounts.splinter>chips.length*.08&&familyCounts.flake>chips.length*.04,'Population includes noticeably more narrow fragments and flakes');assert(maxPlanarAspect/minPlanarAspect>1.7,'Population has distinct width/length proportions');}
 reports.push({thin,count:chips.length,unique:signatures.size,shapeFamilies:[...families].sort(),familyCounts,meanCornerCutCount:sumCornerCuts/chips.length,planarAspectRange:[minPlanarAspect,maxPlanarAspect],maxRadiusMm:maxRadius,maxAbsZMm:maxZ,volumeRangeMm3:[minVolume,maxVolume],meanVolumeMm3:meanVolume,maxHullTriangleAspect:maxAspect,maxSurfaceTriangleAspect:maxSurfaceAspect,meanBroadFaceAngleDeg:sumBroadFaceAngle/chips.length*180/Math.PI,irregularEdgeCount});
}
const sample=makeBrokenChip(17,randomFrom(872));
assert.notDeepEqual(makeBrokenChip(17,randomFrom(872),false,{bulk:0}).vertices,makeBrokenChip(17,randomFrom(872),false,{bulk:1}).vertices,'Bulk changes the 3D solid');
for(const name of ['depth','edgeChips','detail']){assert.notDeepEqual(buildChipSurface(sample,{[name]:0}).vertices,buildChipSurface(sample,{[name]:1}).vertices,`${name} changes actual geometry`);}
for(const options of [{depth:1,edgeChips:1,detail:1},{depth:0,edgeChips:0,detail:0}]){const skin=buildChipSurface(sample,options);assert(skin.audit.minOutwardDot>0);assert(skin.audit.maxOutsideHullMm<1e-8);assert(skin.audit.maxColliderSupportGapMm<1e-8);}
console.log(JSON.stringify({pass:true,reports,optionsChangeGeometry:true},null,2));
