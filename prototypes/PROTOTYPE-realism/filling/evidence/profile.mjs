import {readFileSync} from 'node:fs';
import R from '../../../PROTOTYPE-optics/vendor/rapier.js';
import {chamberFromCAD,transformVertices} from '../../geometry.mjs';
import {FillingPhysics} from '../physics.mjs';
import {cadContainment,pairPenetration} from '../containment.mjs';
await R.init();const chamber=chamberFromCAD(JSON.parse(readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)))),contain=cadContainment(chamber);
const run=process.argv[2]||'base',prediction={base:.002,p05:.0005,p01:.0001,p002:.00002,p005:.00005,noCAD:.002}[run];const lab=new FillingPhysics(R,chamber,{seed:41,level:'loose'});lab.world.integrationParameters.numSolverIterations=12;lab.world.integrationParameters.contact_natural_frequency=240;lab.world.profilerEnabled=true;if(prediction!==undefined)lab.world.integrationParameters.normalizedPredictionDistance=prediction;
if(run==='noCAD')for(const c of lab.boundaries)c.setEnabled(false);
lab.orient(90,70);const times=[],sum={};let maxNative=0,maxBoundary=0,maxPair=0;
for(let i=0;i<480;i++){
 const t=performance.now();lab.step();times.push(performance.now()-t);
 for(const k of ['timingStep','timingCollisionDetection','timingBroadPhase','timingNarrowPhase','timingSolver','timingVelocityAssembly','timingVelocityResolution','timingCcd','timingCcdToiComputation','timingCcdBroadPhase','timingCcdNarrowPhase','timingCcdSolver','timingIslandConstruction'])sum[k]=(sum[k]||0)+lab.world[k]();
 if(i%120===0||i===479){const ps=lab.poses(),vs=lab.chips.map((c,j)=>transformVertices(c,ps[j]));for(let j=0;j<vs.length;j++){if(run!=='noCAD')maxBoundary=Math.max(maxBoundary,contain(vs[j],lab.chips[j].indices));for(let k=j+1;k<vs.length;k++)maxPair=Math.max(maxPair,pairPenetration(vs[j],vs[k],lab.chips[j].indices,lab.chips[k].indices));}
 for(const c of lab.colliders)for(const b of [...lab.boundaries,...lab.colliders])if(c!==b)lab.world.contactPair(c,b,m=>{for(let j=0;j<m.numContacts();j++)maxNative=Math.max(maxNative,-m.contactDist(j));});
 }
}
const contactCounts={};for(const c of lab.colliders)for(let k=0;k<lab.boundaries.length;k++)lab.world.contactPair(c,lab.boundaries[k],m=>{const name=chamber.parts[k].name;contactCounts[name]=(contactCounts[name]||0)+m.numContacts();});
const sorted=times.slice().sort((a,b)=>a-b);console.log(JSON.stringify({run,count:lab.chips.length,predictionMm:lab.world.integrationParameters.normalizedPredictionDistance*1000,allowedErrorMm:lab.world.integrationParameters.normalizedAllowedLinearError*1000,cpuMs:times.reduce((a,b)=>a+b,0),cpuMsPerSimSecond:times.reduce((a,b)=>a+b,0)*2,stepP95Ms:sorted[Math.ceil(sorted.length*.95)-1],profile:sum,contactCounts,maxNative,maxBoundary,maxPair,steps:lab.steps},null,2));lab.dispose();
