// Reproduce the failed current geometry without advancing the simulation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import R from '../../../PROTOTYPE-optics/vendor/rapier.js';
import {chamberFromCAD,transformVertices} from '../../geometry.mjs';
import {FillingPhysics,FIXED_POINT} from '../physics.mjs';
import {pairPenetration} from '../containment.mjs';
await R.init();
const checks=JSON.parse(readFileSync(new URL('checks.json',import.meta.url)));
const failed=checks.runs.find(run=>run.currentGeometryWitness);
assert.equal(checks.passed,false);
assert(failed,'A current-geometry witness is required');
const chamber=chamberFromCAD(JSON.parse(readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url))));
const lab=new FillingPhysics(R,chamber,{seed:failed.seed,level:failed.level});
try {
 const {pair,poses}=failed.currentGeometryWitness;
 for(let k=0;k<pair.length;k++){
  const body=lab.bodies[pair[k]],p=poses[k], [x,y,z]=p.positionMm,[qx,qy,qz,w]=p.rotation;
  body.setTranslation({x,y,z},false);body.setRotation({x:qx,y:qy,z:qz,w},false);
 }
 lab.world.propagateModifiedBodyPositionsToColliders();
 const freshNativeMm=Math.max(0,-lab.colliders[pair[0]].contactCollider(lab.colliders[pair[1]],2).distance);
 const vertices=pair.map((id,k)=>transformVertices(lab.chips[id],poses[k]));
 const independentSATMm=pairPenetration(vertices[0],vertices[1],lab.chips[pair[0]].indices,lab.chips[pair[1]].indices);
 assert(freshNativeMm>=checks.thresholdMm);assert(independentSATMm>=checks.thresholdMm);
 assert(Math.abs(freshNativeMm-failed.currentGeometryWitness.freshNativeMm)<1e-5);
 assert(Math.abs(independentSATMm-failed.currentGeometryWitness.independentSATMm)<1e-5);
 assert.equal(lab.steps,0);
 const report={fixedPoint:FIXED_POINT,generated:new Date().toISOString(),seed:failed.seed,level:failed.level,count:lab.chips.length,pair,thresholdMm:checks.thresholdMm,freshNativeMm,independentSATMm,solverSteps:lab.steps,failedGeometryReproduced:true};
 writeFileSync(new URL('witness.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {lab.dispose();}
