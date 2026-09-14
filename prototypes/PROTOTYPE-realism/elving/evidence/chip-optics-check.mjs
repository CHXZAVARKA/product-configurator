import assert from 'node:assert/strict';
import {vertexThickness} from '../chip-optics.mjs';
import {buildChipSurface} from '../chip-surface.mjs';
import {makeBrokenChip} from '../broken-chip.mjs';
const box={id:0,thicknessMm:2,vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
const surface=buildChipSurface(box,{depth:0,edgeChips:0,detail:0}),thickness=vertexThickness(box,surface);
let faceCenters=0;
surface.vertices.forEach((v,i)=>{if(v.filter(x=>Math.abs(x)<1e-9).length===2){assert(Math.abs(thickness[i]-2)<1e-8,'Known box face-normal chord is 2 mm');faceCenters++;}});
assert.equal(faceCenters,6);
let seed=314159;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(let i=0;i<36;i++){
 const chip=makeBrokenChip(i,random),skin=buildChipSurface(chip),values=vertexThickness(chip,skin);
 const diameter=Math.max(...chip.vertices.flatMap(a=>chip.vertices.map(b=>Math.hypot(...a.map((v,k)=>v-b[k])))));
 assert(values.every(v=>Number.isFinite(v)&&v>0&&v<=diameter+1e-8));
 assert(Math.max(...values)-Math.min(...values)>.1,'Geometric thickness varies across a shard');
}
console.log('PASS: six analytic box chords; 36 bounded varying shard thickness fields.');
