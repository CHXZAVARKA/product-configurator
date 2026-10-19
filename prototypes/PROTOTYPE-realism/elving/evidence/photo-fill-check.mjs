import fs from 'node:fs';
import assert from 'node:assert/strict';
import RAPIER from '../../../PROTOTYPE-optics/tooling/node_modules/@dimforge/rapier3d-compat/rapier.mjs';
import {createChipPhysics,PHOTO_FILL_PROFILE} from '../chips-physics.mjs';
import {buildChipSurface} from '../chip-surface.mjs';
import {transformVertices} from '../../geometry.mjs';

await RAPIER.init();
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const counts=[2.5,3,5].map(height=>PHOTO_FILL_PROFILE.filter(piece=>piece.heightMm===height).length);
assert.deepEqual(counts,[9,19,12]);
const sim=createChipPhysics(RAPIER,cad,{count:40,profile:PHOTO_FILL_PROFILE});
assert.equal(sim.chips.length,40);
assert.equal(sim.chamberAudit.measuredDepthMm,14);
assert.equal(sim.chamberAudit.ceilingMm-sim.chamberAudit.floorEnvelopeMm,14);
assert.ok(Math.abs(sim.snapshot().solidVolumeMm3-4560)<1e-6);
assert.ok(sim.snapshot().maxInitialPenetrationMm<.1,'pre-relaxed glass has no deep intersections');
let visualTriangles=0;
for(let i=0;i<40;i++){
 const chip=sim.chips[i],spec=PHOTO_FILL_PROFILE[i];
 assert.equal(chip.shapeAudit.photoFracture,true,'photo filling uses the fractured-sheet generator');
 assert.ok(chip.shapeAudit.faceCount>=10,'photo fragments have independently cut faces');
 assert.ok(Math.abs(chip.thicknessMm/spec.heightMm-1)<.08,'height correction stays within photo estimate');
 assert.ok(Math.abs(2*Math.max(...chip.vertices.map(([x,y])=>Math.hypot(x,y)))-spec.diameterMm)<1e-6);
 const surface=buildChipSurface(chip,{depth:.75,edgeChips:.6,detail:.65});
 assert.equal(surface.audit.subdivisions,3);
 assert.ok(surface.audit.scarCount>=5&&surface.audit.scarCount<=9);
 assert.ok(surface.audit.cleavageCount>=1,'broad faces receive actual geometric cleavage');
 assert.ok(surface.audit.maxDeviationMm<=.550001&&surface.audit.maxOutsideHullMm<1e-8);
 assert.ok(surface.audit.minOutwardDot>0&&surface.audit.minTriangleAreaMm2>1e-6);
 visualTriangles+=surface.audit.visualTriangles;
}
assert.ok(visualTriangles>90000&&visualTriangles<150000);
function checkBounds(){
 const poses=sim.poses();
 for(let i=0;i<40;i++)for(const [x,y,z] of transformVertices(sim.chips[i],poses[i])){
  assert.ok(Math.hypot(x,y)<19.02,'glass remains within measured radius');
  assert.ok(z>-.51&&z<13.51,'glass remains within measured 14 mm depth');
 }
}
checkBounds();
for(let frame=0;frame<8*60;frame++){sim.step(1/60);checkBounds();}
assert.equal(sim.snapshot().moving,false,'photo filling settles');
sim.shake();
for(let frame=0;frame<8*60;frame++){sim.step(1/60);checkBounds();}
assert.equal(sim.snapshot().moving,false,'shaken photo filling settles');
console.log(JSON.stringify({count:40,groups:{small:counts[0],medium:counts[1],large:counts[2]},visualTriangles,modeledMassG:sim.snapshot().solidVolumeMm3*.0025,measuredDepthMm:sim.chamberAudit.measuredDepthMm,maxInitialPenetrationMm:sim.snapshot().maxInitialPenetrationMm,maxBoundaryCorrectionMm:sim.snapshot().maxBoundaryCorrectionMm,settled:true}));
sim.dispose();
