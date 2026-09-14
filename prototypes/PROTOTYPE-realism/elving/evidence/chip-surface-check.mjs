import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createChipPhysics} from '../chips-physics.mjs';
import {buildChipSurface} from '../chip-surface.mjs';

// Exact self-contained WASM vendor dependency embedded by build-realtime.py.
const vendor=fs.readFileSync(new URL('../../../PROTOTYPE-optics/vendor/rapier.js',import.meta.url));
const {default:RAPIER}=await import(`data:text/javascript;base64,${vendor.toString('base64')}`);
await RAPIER.init();
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function undisplacedSubdivision(chip) {
 const vertices=chip.vertices.map(v=>[...v]);let indices=[...chip.indices];
 for(let level=0;level<3;level++){
  const edges=new Map(),next=[];
  const midpoint=(a,b)=>{const key=a<b?`${a}:${b}`:`${b}:${a}`;if(!edges.has(key)){edges.set(key,vertices.length);vertices.push(vertices[a].map((v,k)=>(v+vertices[b][k])/2));}return edges.get(key);};
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}indices=next;
 }
 return vertices;
}
const sim=createChipPhysics(RAPIER,cad,{count:124});
const colliderBefore=digest(sim.chips),posesBefore=digest(sim.poses()),uniqueMeshes=new Set(),uniqueMaterials=new Set();
const report={method:'Exact browser vendor Rapier injection and createChipPhysics(count=124), closed high-poly visual skin only; independent triangle, hull-plane and edge topology checks.',chips:[],totalTriangles:0,maxOutsideHullMm:0,maxDeviationMm:0,maxColliderSupportGapMm:0,minTriangleAreaMm2:Infinity,minOutwardDot:Infinity};
const started=performance.now();
for(const chip of sim.chips) {
 const before=JSON.stringify(chip),surface=buildChipSurface(chip);
 assert.equal(JSON.stringify(chip),before,'visual generation must not mutate a collider');
 assert.deepEqual(buildChipSurface(chip),surface,'same coordinates and id must be deterministic');
 assert.ok(surface.indices.length/chip.indices.length>20,'actual geometry must exceed 20x solver triangles');
 const edges=new Map(),center=[0,1,2].map(k=>chip.vertices.reduce((s,v)=>s+v[k],0)/chip.vertices.length),reference=undisplacedSubdivision(chip);
 let signedVolume=0,minArea=Infinity,minOutward=Infinity,maxOutside=0,maxBoundaryDistance=0,maxSupportGap=0,maxAspect=0,maxMeasuredDeviation=0;
 const planes=[];
 for(let i=0;i<chip.indices.length;i+=3){const [a,b,c]=chip.indices.slice(i,i+3).map(j=>chip.vertices[j]),raw=cross(sub(b,a),sub(c,a)),normal=raw.map(v=>v/Math.hypot(...raw)),offset=dot(normal,a);if(!planes.some(p=>dot(p.normal,normal)>1-1e-9&&Math.abs(p.offset-offset)<1e-8))planes.push({normal,offset});}
 for(const [index,vertex] of surface.vertices.entries()){assert.ok(vertex.every(Number.isFinite),'finite visual position');maxMeasuredDeviation=Math.max(maxMeasuredDeviation,Math.hypot(...sub(vertex,reference[index])));let nearest=Infinity;for(const plane of planes){const distance=dot(plane.normal,vertex)-plane.offset;maxOutside=Math.max(maxOutside,distance);nearest=Math.min(nearest,-distance);}maxBoundaryDistance=Math.max(maxBoundaryDistance,nearest);}
 for(const plane of planes){const support=Math.max(...surface.vertices.map(v=>dot(plane.normal,v)));maxSupportGap=Math.max(maxSupportGap,plane.offset-support);}
 for(let i=0;i<surface.indices.length;i+=3){
  const ids=surface.indices.slice(i,i+3);assert.equal(new Set(ids).size,3,'three distinct indices');
  const [a,b,c]=ids.map(j=>surface.vertices[j]),normal=cross(sub(b,a),sub(c,a)),area=Math.hypot(...normal)/2,centroid=a.map((v,k)=>(v+b[k]+c[k])/3),outward=dot(normal,sub(centroid,center));
  const longestEdge=Math.max(Math.hypot(...sub(a,b)),Math.hypot(...sub(b,c)),Math.hypot(...sub(c,a)));
  maxAspect=Math.max(maxAspect,longestEdge*longestEdge/(2*area));minArea=Math.min(minArea,area);minOutward=Math.min(minOutward,outward);signedVolume+=dot(a,cross(b,c))/6;
  for(let edge=0;edge<3;edge++){const u=ids[edge],v=ids[(edge+1)%3],key=u<v?`${u}:${v}`:`${v}:${u}`;const record=edges.get(key)||{count:0,winding:0};record.count++;record.winding+=u<v?1:-1;edges.set(key,record);}
 }
 assert.ok(maxOutside<1e-8,`visual escaped the physical convex envelope: ${maxOutside}mm`);
 assert.ok(surface.audit.maxDeviationMm<=.1200000001,'displacement bounded against corresponding collider subdivision');
 assert.ok(maxMeasuredDeviation<=.1200000001,'independently regenerated collider subdivision proves displacement bound');
 assert.ok(Math.abs(maxMeasuredDeviation-surface.audit.maxDeviationMm)<1e-9,'generated audit agrees with independent measurement');
 assert.ok(maxBoundaryDistance<=.1200000001,'all visual points within .12mm of physical surface');
 assert.ok(maxSupportGap<.12,'contact support does not open a large visual gap');
 assert.ok(minArea>1e-6,'no degenerate or needle facets');
 assert.ok(maxAspect<25,'longest edge/altitude ratio stays bounded, no needle facets');
 assert.ok(minOutward>0&&signedVolume>0,'all faces keep outward winding');
 for(const edge of edges.values()){assert.equal(edge.count,2,'every edge has exactly two incident faces');assert.equal(edge.winding,0,'incident faces traverse edges in opposite directions');}
 assert.equal(surface.vertices.length-edges.size+surface.indices.length/3,2,'closed genus-zero mesh');
 assert.ok(surface.audit.maxDeviationMm-surface.audit.meanDeviationMm>.007,'surface contains actual geometric relief');
 uniqueMeshes.add(digest(surface.vertices));uniqueMaterials.add(digest(surface.materialVariation));
 report.totalTriangles+=surface.indices.length/3;report.maxOutsideHullMm=Math.max(report.maxOutsideHullMm,maxOutside);report.maxDeviationMm=Math.max(report.maxDeviationMm,surface.audit.maxDeviationMm);report.maxColliderSupportGapMm=Math.max(report.maxColliderSupportGapMm,maxSupportGap);report.minTriangleAreaMm2=Math.min(report.minTriangleAreaMm2,minArea);report.minOutwardDot=Math.min(report.minOutwardDot,minOutward);
 report.chips.push({id:chip.id,...surface.audit,independentMaxDeviationMm:maxMeasuredDeviation,maxLongestEdgeToAltitudeRatio:maxAspect,maxBoundaryDistanceMm:maxBoundaryDistance,maxColliderSupportGapMm:maxSupportGap,signedVolumeMm3:signedVolume,materialVariation:surface.materialVariation,meshSha256:digest(surface.vertices)});
}
assert.ok(report.totalTriangles<=250000,'124-chip visual budget <=250k triangles');
assert.equal(uniqueMeshes.size,124,'every shard has a unique surface');assert.equal(uniqueMaterials.size,124,'every shard has unique material variation');
assert.equal(digest(sim.chips),colliderBefore,'all low-poly colliders remain byte-for-byte unchanged');assert.equal(digest(sim.poses()),posesBefore,'visual generation does not advance physical state');
const first=sim.chips[0],sameShapeNewId={...first,id:1000},newCoordinates={...first,vertices:first.vertices.map((v,i)=>v.map((x,k)=>x+(i===0&&k===0?.001:0)))};
assert.notEqual(digest(buildChipSurface(first).vertices),digest(buildChipSurface(sameShapeNewId).vertices),'id participates in deterministic seed');
assert.notEqual(buildChipSurface(first).audit.seed,buildChipSurface(newCoordinates).audit.seed,'actual coordinates participate in deterministic seed');
sim.reset(124);assert.equal(digest(sim.chips),colliderBefore,'reset preserves source collider inputs');assert.equal(digest(buildChipSurface(sim.chips[0])),digest(buildChipSurface(first)),'reset reproduces visual geometry');sim.dispose();
report.buildAndCheckMs=performance.now()-started;report.uniqueMeshes=uniqueMeshes.size;report.uniqueMaterialVariations=uniqueMaterials.size;report.colliderInputUnchanged=true;report.watertight=true;report.outwardWinding=true;report.deterministic=true;
fs.writeFileSync(new URL('./chip-surface.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,chips:report.chips.length},null,2));
