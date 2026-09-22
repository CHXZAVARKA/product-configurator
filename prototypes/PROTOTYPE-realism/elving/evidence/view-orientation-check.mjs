import assert from 'node:assert/strict';
import {viewOrientation,rotateVector} from '../view-orientation.mjs';
let cases=0;
for(const roll of [0,35,90,180,359])for(const tilt of [-70,-18,0,38,70])for(const yaw of [0,55,150,360]){
 const m=viewOrientation(roll,tilt,yaw),r=roll*Math.PI/180,t=tilt*Math.PI/180;
 const g=rotateVector(m.worldToView,[0,-1,0]),expected=[Math.sin(r)*Math.cos(t),-Math.cos(r)*Math.cos(t),-Math.sin(t)];
 assert(g.every((v,k)=>Math.abs(v-expected[k])<1e-12),'Same frame as Rapier gravity');
 for(const v of [[1,0,0],[0,1,0],[0,0,-1]])assert(rotateVector(m.environmentToView,rotateVector(m.viewToEnvironment,v)).every((n,k)=>Math.abs(n-v[k])<1e-12));
 cases++;
}
assert.notDeepEqual(rotateVector(viewOrientation(0,45,0).viewToWorld,[0,0,-1]),[0,0,-1]);
console.log(JSON.stringify({passed:true,cases,contract:'One rigid eye/chamber frame for HDRI background, reflected world light and gravity'}));
