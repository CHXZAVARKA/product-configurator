// Regression: the initial shake of a full bed used to keep solver jitter alive forever.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {Filling,PHYSICS_HZ,maximum} from './contact-check.mjs';
const rows=[];
for(const seed of [71,107,213]){
 const f=new Filling(96,seed);f.shake();
 for(let i=0;i<PHYSICS_HZ*15&&!f.settled;i++)f.step();
 const tick=f.tick,poses=JSON.stringify(f.pieces.map(p=>[p.body.position,p.body.quaternion]));
 for(let i=0;i<PHYSICS_HZ;i++)f.step();
 rows.push({seed,settled:f.settled,seconds:tick/PHYSICS_HZ,penetrationMm:maximum(f),stoppedWorld:f.tick===tick,stoppedPoses:poses===JSON.stringify(f.pieces.map(p=>[p.body.position,p.body.quaternion]))});f.dispose();
}
writeFileSync(new URL('./startup-sleep-check.json',import.meta.url),JSON.stringify(rows,null,2));console.log(rows);
assert(rows.every(r=>r.settled&&r.stoppedWorld&&r.stoppedPoses&&r.penetrationMm<.3));
