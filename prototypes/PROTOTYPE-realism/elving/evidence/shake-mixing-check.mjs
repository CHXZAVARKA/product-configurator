import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createChipPhysics} from '../chips-physics.mjs';
import R from '../../../PROTOTYPE-optics/tooling/node_modules/@dimforge/rapier3d-compat/rapier.mjs';
await R.init();
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const p95=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)];
const results=[];
for(const [roll,tilt] of [[0,0],[120,35],[-90,-70]]){
 const sim=createChipPhysics(R,cad,{count:36,sizeScale:1.5});sim.orient(roll,tilt);for(let i=0;i<300;i++)sim.step(1/60);
 const before=sim.poses();sim.shake();let previous=before,gestureTravelMm=0,gestureDeltas=[],gestureFrames=0;
 for(let frame=0;frame<480;frame++){
  sim.step(1/60);const next=sim.poses();
  if(sim.snapshot().shaking){gestureFrames++;for(let i=0;i<next.length;i++){const distance=Math.hypot(...next[i].positionMm.map((v,k)=>v-previous[i].positionMm[k]));gestureTravelMm+=distance;gestureDeltas.push(distance);}}
  previous=next;
 }
 assert(gestureTravelMm/36>10,'A bounded chamber gesture must visibly redistribute the filling');
 assert(p95(gestureDeltas)<1.75,'A chamber gesture must not launch chips across the view in one display frame');
 const distances=sim.poses().map((p,i)=>Math.hypot(...p.positionMm.map((v,k)=>v-before[i].positionMm[k])));
 const result={roll,tilt,gestureFrames,gestureMeanTravelMm:gestureTravelMm/36,gestureFrameDeltaP95Mm:p95(gestureDeltas),movedOver2Mm:distances.filter(d=>d>2).length,meanMm:distances.reduce((a,b)=>a+b,0)/36,sleeping:sim.snapshot().sleeping};
 assert(result.movedOver2Mm>=18,'At least half the filling should settle over 2 mm from its previous position');
 assert.equal(result.sleeping,36,'Mixing must settle again');
 results.push(result);sim.dispose();
}

const repeatedSim=createChipPhysics(R,cad,{count:36,sizeScale:1.5});
for(let i=0;i<420;i++)repeatedSim.step(1/60);
const repeated=[];
for(let shake=0;shake<6;shake++){
 const before=repeatedSim.poses();let previous=before,paths=Array(36).fill(0),wallFrames=0;
 repeatedSim.shake();
 for(;wallFrames<480&&repeatedSim.snapshot().moving;wallFrames++){
  repeatedSim.step(1/60);const next=repeatedSim.poses();
  for(let i=0;i<next.length;i++)paths[i]+=Math.hypot(...next[i].positionMm.map((v,k)=>v-previous[i].positionMm[k]));
  previous=next;
 }
 const result={shake,wallFrames,minPathMm:Math.min(...paths),medianPathMm:[...paths].sort((a,b)=>a-b)[18],pathsUnder2_5Mm:paths.filter(distance=>distance<2.5).length};
 assert(result.wallFrames<=240,'Shake and settling must stop within four display seconds');
 assert.equal(result.pathsUnder2_5Mm,0,'Every chip must leave its local jam during each repeated shake');
 repeated.push(result);
}
repeatedSim.dispose();

console.log(JSON.stringify({orientations:results,repeated},null,2));
fs.writeFileSync(new URL('shake-mixing.json',import.meta.url),JSON.stringify({passed:true,orientations:results,repeated},null,2)+'\n');
