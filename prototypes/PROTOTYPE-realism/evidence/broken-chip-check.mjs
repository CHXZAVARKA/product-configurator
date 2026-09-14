import assert from 'node:assert/strict';
import { makeBrokenChip } from '../elving/broken-chip.mjs';
import { buildChipSurface } from '../elving/chip-surface.mjs';

const randomFrom=seed=>{let n=seed>>>0;return()=>{n+=0x6d2b79f5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};};
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
const reports=[];
for(const thin of [false,true]) {
 const random=randomFrom(0x4e17a9),repeat=randomFrom(0x4e17a9),chips=[],signatures=new Set(),families=new Set();
 let maxAspect=0,maxSurfaceAspect=0,minVolume=Infinity,maxVolume=0,maxRadius=0,maxZ=0;
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
  assert(chip.volumeMm3>3);assert(chip.color.every(c=>c>=0&&c<=1));
  signatures.add(JSON.stringify(vertices));families.add(vertices.length/2);chips.push(chip);
  if(id<96) {
   const skin=buildChipSurface(chip);
   assert(skin.audit.maxOutsideHullMm<1e-8,'Surface stays in collision envelope');
   assert(skin.audit.minOutwardDot>0,'Surface remains outward');
   for(let i=0;i<skin.indices.length;i+=3){const [a,b,c]=skin.indices.slice(i,i+3).map(j=>skin.vertices[j]),area2=Math.hypot(...cross(sub(b,a),sub(c,a)));const aspect=Math.max(dot(sub(a,b),sub(a,b)),dot(sub(b,c),sub(b,c)),dot(sub(c,a),sub(c,a)))/area2;maxSurfaceAspect=Math.max(maxSurfaceAspect,aspect);assert(aspect<25,'Subdivided surface triangle aspect');}
  }
 }
 assert.equal(signatures.size,512,'Unique contours');assert.equal(families.size,4,'Triangles, quads, five and six corner fragments');
 assert(maxRadius<=2.800000001);assert(maxZ<=(thin?.9:1.10));assert(maxVolume/minVolume>2,'Meaningful size variation');assert(maxAspect<25);
 reports.push({thin,count:chips.length,unique:signatures.size,contourCorners:[...families].sort(),maxRadiusMm:maxRadius,maxAbsZMm:maxZ,volumeRangeMm3:[minVolume,maxVolume],meanVolumeMm3:chips.reduce((s,c)=>s+c.volumeMm3,0)/chips.length,maxHullTriangleAspect:maxAspect,maxSurfaceTriangleAspect:maxSurfaceAspect});
}
console.log(JSON.stringify({pass:true,reports},null,2));
