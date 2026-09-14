import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import RAPIER from '../../../PROTOTYPE-optics/tooling/node_modules/@dimforge/rapier3d-compat/rapier.mjs';
import {createChipPhysics} from '../chips-physics.mjs';
import {transformVertices} from '../../geometry.mjs';
await RAPIER.init();
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const p95=a=>[...a].sort((x,y)=>x-y)[Math.ceil(a.length*.95)-1];
function signedVolume(c){let v=0;for(let i=0;i<c.indices.length;i+=3){const [a,b,d]=c.indices.slice(i,i+3).map(j=>c.vertices[j]);v+=a[0]*(b[1]*d[2]-b[2]*d[1])+a[1]*(b[2]*d[0]-b[0]*d[2])+a[2]*(b[0]*d[1]-b[1]*d[0]);}return v/6;}
const report={method:'Node WASM Rapier, same injected dependency and millimetre convex geometry as offline browser; two fixed1/120s steps per1/60s display frame.',hardware:{arch:process.arch,cpu:os.cpus()[0].model},scenarios:[]};
// Scaling changes every linear dimension and mass volume together. The default
// remains the original geometry, while enlarged initialization caps at39 slots.
const baseline=createChipPhysics(RAPIER,cad,{count:3}),scaled=createChipPhysics(RAPIER,cad,{count:3,sizeScale:1.5});
assert.equal(baseline.snapshot().sizeScale,1);
for(let i=0;i<3;i++){
 assert.deepEqual(scaled.chips[i].indices,baseline.chips[i].indices);
 assert.deepEqual(scaled.chips[i].vertices,baseline.chips[i].vertices.map(p=>p.map(v=>v*1.5)));
 assert.equal(scaled.chips[i].thicknessMm,baseline.chips[i].thicknessMm*1.5);
 assert.equal(scaled.chips[i].volumeMm3,baseline.chips[i].volumeMm3*1.5**3);
}
baseline.dispose();scaled.reset(40);assert.equal(scaled.chips.length,39);
const capacityPoses=scaled.poses(),capacityVertices=scaled.chips.map((c,i)=>transformVertices(c,capacityPoses[i]));
let capacityGap=Infinity;
for(let i=0;i<39;i++){
 for(const v of capacityVertices[i])assert.ok(Math.hypot(v[0],v[1])<19&&v[2]>-.5&&v[2]<10,'capacity hull fits chamber');
 for(let j=i+1;j<39;j++){
  const a=capacityPoses[i].positionMm,b=capacityPoses[j].positionMm;
  const xyGap=Math.hypot(a[0]-b[0],a[1]-b[1])-Math.max(...scaled.chips[i].vertices.map(v=>Math.hypot(v[0],v[1])))-Math.max(...scaled.chips[j].vertices.map(v=>Math.hypot(v[0],v[1])));
  const zGap=Math.max(Math.min(...capacityVertices[j].map(v=>v[2]))-Math.max(...capacityVertices[i].map(v=>v[2])),Math.min(...capacityVertices[i].map(v=>v[2]))-Math.max(...capacityVertices[j].map(v=>v[2])));
  const gap=Math.max(xyGap,zGap);assert.ok(gap>0,'capacity hulls do not overlap');capacityGap=Math.min(capacityGap,gap);
 }
}
report.initialization={sizeScale:1.5,capacity:39,minimumSeparatingGapMm:capacityGap,defaultGeometryPreserved:true};scaled.dispose();
for(const count of [18,30,36]) {
 const sim=createChipPhysics(RAPIER,cad,{count,sizeScale:1.5}),initial=sim.poses();
 let minInitialClearance=Infinity,convexityWorst=0;
 for(const chip of sim.chips){assert.ok(signedVolume(chip)>0,'outward winding');for(let i=0;i<chip.indices.length;i+=3){const [a,b,c]=chip.indices.slice(i,i+3).map(j=>chip.vertices[j]);const ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]),normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...normal);for(const vertex of chip.vertices){const side=vertex.reduce((sum,v,k)=>sum+(v-a[k])*normal[k]/length,0);convexityWorst=Math.max(convexityWorst,side);assert.ok(side<1e-8,'render hull must be convex');}}}
 const initialWorld=sim.chips.map((c,i)=>transformVertices(c,initial[i]));
 for(let i=0;i<count;i++)for(let j=i+1;j<count;j++) {
  const a=initial[i].positionMm,b=initial[j].positionMm;
  const xyClearance=Math.hypot(a[0]-b[0],a[1]-b[1])-Math.max(...sim.chips[i].vertices.map(v=>Math.hypot(v[0],v[1])))-Math.max(...sim.chips[j].vertices.map(v=>Math.hypot(v[0],v[1])));
  const zClearance=Math.max(Math.min(...initialWorld[j].map(v=>v[2]))-Math.max(...initialWorld[i].map(v=>v[2])),Math.min(...initialWorld[i].map(v=>v[2]))-Math.max(...initialWorld[j].map(v=>v[2])));
  const gap=Math.max(xyClearance,zClearance);assert.ok(gap>0,'initial convex chips must have separating axis');minInitialClearance=Math.min(minInitialClearance,gap);
 }
 let maxLeakMm=0,maxDelta=0,maxRotation=0;const timings=[],activeTimings=[];
 function checkBounds(){const poses=sim.poses();for(let i=0;i<count;i++)for(const v of transformVertices(sim.chips[i],poses[i]))maxLeakMm=Math.max(maxLeakMm,Math.hypot(v[0],v[1])-19,-.5-v[2],v[2]-10);return poses;}
 function run(seconds){for(let i=0;i<seconds*60;i++){const start=performance.now();const moved=sim.step(1/60),elapsed=performance.now()-start;timings.push(elapsed);if(moved)activeTimings.push(elapsed);const poses=checkBounds();for(let j=0;j<count;j++){maxDelta=Math.max(maxDelta,Math.hypot(...poses[j].positionMm.map((v,k)=>v-initial[j].positionMm[k])));const dot=Math.abs(poses[j].rotation.reduce((s,v,k)=>s+v*initial[j].rotation[k],0));maxRotation=Math.max(maxRotation,2*Math.acos(Math.min(1,dot))*180/Math.PI);}}}
 checkBounds();assert.ok(maxLeakMm<.00001,'initial vertices must fit chamber');
 run(8);const firstSettle=sim.snapshot();
 assert.ok(maxDelta>5,'gravity must move chips');assert.ok(maxRotation>10,'collisions must tumble chips');
 assert.equal(firstSettle.moving,false,'assembly must settle and sleep');
 const idleSteps=firstSettle.steps;for(let i=0;i<60;i++)assert.equal(sim.step(1/60),false);assert.equal(sim.snapshot().steps,idleSteps,'idle must skip world.step');
 assert.equal(sim.orient(0,0),false);assert.equal(sim.snapshot().moving,false,'unchanged orientation must stay asleep');
 sim.orient(120,35);assert.equal(sim.snapshot().sleeping,0,'orientation wakes assembly');run(8);assert.equal(sim.snapshot().moving,false,'tilted gravity must settle');
 sim.orient(-90,-70);run(8);assert.equal(sim.snapshot().moving,false,'reverse gravity must settle');
 sim.shake();assert.equal(sim.snapshot().sleeping,0,'shake wakes assembly');run(8);assert.equal(sim.snapshot().moving,false,'shake must settle');
 sim.step(10);checkBounds();
 assert.ok(maxLeakMm<.02,`transformed convex vertices leaked ${maxLeakMm}mm`);
 const result={count,initialSeparatingGapMm:minInitialClearance,convexityWorstMm:convexityWorst,maxGravityTranslationMm:maxDelta,maxTumbleDegrees:maxRotation,maxBoundaryLeakMm:maxLeakMm,activeFrameCpu:{samples:activeTimings.length,meanMs:activeTimings.reduce((s,v)=>s+v,0)/activeTimings.length,p95Ms:p95(activeTimings),maxMs:Math.max(...activeTimings)},frameCpu:{samples:timings.length,meanMs:timings.reduce((s,v)=>s+v,0)/timings.length,p95Ms:p95(timings),maxMs:Math.max(...timings)},firstSettleSeconds:firstSettle.actionAgeSeconds,snapshot:sim.snapshot()};report.scenarios.push(result);sim.reset(0);assert.equal(sim.chips.length,0);assert.equal(sim.snapshot().moving,false);sim.reset(3);assert.equal(sim.chips.length,3);assert.equal(sim.snapshot().moving,true);const beforeHighRefresh=sim.snapshot().steps;for(let frame=0;frame<144;frame++){sim.orient(frame,0);sim.step(1/144);}assert.ok(sim.snapshot().steps-beforeHighRefresh>=119,'orientation must preserve accumulator at144Hz');sim.dispose();
}
fs.writeFileSync(new URL('./chips-physics.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({hardware:report.hardware,scenarios:report.scenarios.map(s=>({count:s.count,solidFraction:s.snapshot.nominalSolidFraction,activeCpu:s.activeFrameCpu,boundaryLeakMm:s.maxBoundaryLeakMm,initialGapMm:s.initialSeparatingGapMm,settleSeconds:s.firstSettleSeconds}))},null,2));
