import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createChipPhysics} from '../chips-physics.mjs';
import R from '../../../PROTOTYPE-optics/tooling/node_modules/@dimforge/rapier3d-compat/rapier.mjs';
await R.init();
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const results=[];
for(const [roll,tilt] of [[0,0],[120,35],[-90,-70]]){
 const sim=createChipPhysics(R,cad,{count:36,sizeScale:1.5});sim.orient(roll,tilt);for(let i=0;i<300;i++)sim.step(1/60);
 const before=sim.poses();sim.shake();for(let i=0;i<300;i++)sim.step(1/60);
 const distances=sim.poses().map((p,i)=>Math.hypot(...p.positionMm.map((v,k)=>v-before[i].positionMm[k])));
 const result={roll,tilt,movedOver2Mm:distances.filter(d=>d>2).length,meanMm:distances.reduce((a,b)=>a+b,0)/36,sleeping:sim.snapshot().sleeping};
 assert(result.movedOver2Mm>=18,'At least half the filling should settle over 2 mm from its previous position');
 assert.equal(result.sleeping,36,'Mixing must settle again');
 results.push(result);sim.dispose();
}

console.log(JSON.stringify(results,null,2));
fs.writeFileSync(new URL('shake-mixing.json',import.meta.url),JSON.stringify({passed:true,results},null,2)+'\n');
