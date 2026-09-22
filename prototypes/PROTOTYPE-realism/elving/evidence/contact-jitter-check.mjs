import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createChipPhysics} from '../chips-physics.mjs';
const vendor=fs.readFileSync(new URL('../../../PROTOTYPE-optics/vendor/rapier.js',import.meta.url));
const {default:RAPIER}=await import(`data:text/javascript;base64,${vendor.toString('base64')}`);await RAPIER.init();
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
const results=[];
for(const action of ['initial','turn','reverse','shake']){
 const sim=createChipPhysics(RAPIER,cad,{count:36,sizeScale:1.5});
 if(action!=='initial')for(let i=0;i<180;i++)sim.step(1/60);
 if(action==='turn')sim.orient(317,70);
 if(action==='reverse')sim.orient(120,-65);
 if(action==='shake')sim.shake();
 // 512 pixels across 44 mm: 0.086 mm is one source pixel before mirrors.
 let previous=sim.poses(),previousDeltas=[],reversals=0,maxDelta=0,initialTravel=0,shakeDeltas=[],movingFrameMax=[];
 for(let frame=0;frame<420;frame++){
  sim.step(1/60);const next=sim.poses(),deltas=next.map((p,i)=>p.positionMm.map((v,k)=>v-previous[i].positionMm[k]));
  const lengths=deltas.map(d=>Math.hypot(...d));
  if(sim.snapshot().shaking)shakeDeltas.push(...lengths);
  if(sim.snapshot().moving)movingFrameMax.push(Math.max(...lengths));
  for(let i=0;i<deltas.length;i++){
   const d=deltas[i],length=lengths[i];
   if(frame<60)initialTravel+=length;
   if(frame>=60&&frame<120){maxDelta=Math.max(maxDelta,length);if(length>.086&&previousDeltas[i]&&d.reduce((sum,v,k)=>sum+v*previousDeltas[i][k],0)<0)reversals++;}
  }
  previous=next;previousDeltas=deltas;
 }
 const stopped=sim.poses(),steps=sim.snapshot().steps;
 for(let i=0;i<60;i++)sim.step(1/60);
 assert.deepEqual(sim.poses(),stopped,'No idle motion');assert.equal(sim.snapshot().steps,steps,'No idle solver work');
 const tail=movingFrameMax.slice(-45),shakeDeltaP95Mm=shakeDeltas.length?percentile(shakeDeltas,.95):0;
 results.push({action,reversalsBetween1And2Seconds:reversals,maxFrameDeltaMm:maxDelta,initialTravelMm:initialTravel,shakeDeltaP95Mm,preStopTailMaxMm:tail.length?Math.max(...tail):0,settleSeconds:sim.snapshot().actionAgeSeconds});
 sim.dispose();
}
console.log(JSON.stringify(results,null,2));
assert(results.every(r=>r.initialTravelMm>5),'Real motion must remain after each action');
assert(results.filter(r=>r.action!=='shake').every(r=>r.reversalsBetween1And2Seconds<10),'Resting pile repeatedly reverses by more than a visible source pixel');
const shake=results.find(r=>r.action==='shake');
assert(shake.shakeDeltaP95Mm<1.25,'Shake moves chips too far per display frame to read as physical motion');
assert(shake.preStopTailMaxMm<.086,'A chip still jitters by more than one source pixel immediately before rest');
fs.writeFileSync(new URL('contact-jitter.json',import.meta.url),JSON.stringify({passed:true,sourcePixelMm:.086,results},null,2)+'\n');
