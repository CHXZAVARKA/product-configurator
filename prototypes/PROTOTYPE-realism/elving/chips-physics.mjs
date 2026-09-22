import {AUTHOR_FILL_COLORS,AUTHOR_FILL_MASS_G,makeBrokenChip} from './broken-chip.mjs';
import { chamberFromCAD } from '../geometry.mjs';

export {AUTHOR_FILL_COLORS,AUTHOR_FILL_MASS_G};

const FIXED_DT = 1 / 120;
const MAX_COUNT = 140;
const WALLS = 32;
const CLEARANCE = .16;
const DENSITY_KG_MM3 = 2.5e-6;
const randomFrom = seed => { let n = seed >>> 0; return () => { n += 0x6d2b79f5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
export function chipChamberAudit(cad) {
 const c=chamberFromCAD(cad), radiusMm=c.radiusMm-CLEARANCE;
 return Object.freeze({radiusMm:c.radiusMm,floorEnvelopeMm:c.floorEnvelopeMm,ceilingMm:c.ceilingMm,wallSegments:WALLS,solverWallApothemMm:radiusMm*Math.cos(Math.PI/WALLS),solverFloorMm:c.floorEnvelopeMm+CLEARANCE,solverCeilingMm:c.ceilingMm-CLEARANCE,clearanceMm:CLEARANCE,hardProjectionWallApothemMm:(c.radiusMm-.01)*Math.cos(Math.PI/WALLS),hardProjectionFloorMm:c.floorEnvelopeMm+.01,hardProjectionCeilingMm:c.ceilingMm-.01,approximation:'Conservative 32-sided inscribed cylinder and planar maximum-z CAD floor envelope. Actual Elving recesses and surface facets do not participate in chip contacts.',nominalVolumeMm3:Math.PI*c.radiusMm**2*c.nominalGapMm});
}

export function createChipPhysics(RAPIER,cad,{count=108,seed=0x4e17a9,sizeScale=1,bulk=.65}={}) {
 if(!Number.isFinite(sizeScale)||sizeScale<=0)throw Error('Chip sizeScale must be a positive finite number');
 const chamber=chipChamberAudit(cad), world=new RAPIER.World({x:0,y:-9810,z:0});
 world.timestep=FIXED_DT;
 const p=world.integrationParameters;
 p.lengthUnit=10;
 p.normalizedAllowedLinearError=.0004;
 // Sixteen iterations keep the more irregular corner-cut fragments stable
 // under steep gravity changes, without suppressing tumbling or user motion.
 p.numSolverIterations=16;
 p.contact_natural_frequency=120;
 p.numInternalPgsIterations=1;
 p.maxCcdSubsteps=1;
 const R=RAPIER, fixed=R.RigidBodyDesc.fixed();
 const wallNormals=Array.from({length:WALLS},(_,i)=>[Math.cos(i*2*Math.PI/WALLS),Math.sin(i*2*Math.PI/WALLS)]);
 const wallBody=world.createRigidBody(fixed);
 const wallRadius=chamber.solverWallApothemMm, projectionWallRadius=chamber.hardProjectionWallApothemMm, wallDepth=3, halfWidth=wallRadius*Math.tan(Math.PI/WALLS)+.5;
 for(let i=0;i<WALLS;i++) {
  const a=i*2*Math.PI/WALLS, q={x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)};
  world.createCollider(R.ColliderDesc.cuboid(wallDepth/2,halfWidth,9).setTranslation(Math.cos(a)*(wallRadius+wallDepth/2),Math.sin(a)*(wallRadius+wallDepth/2),4.75).setRotation(q).setFriction(.3).setRestitution(.015),wallBody);
 }
 for(const z of [chamber.solverFloorMm-2,chamber.solverCeilingMm+2]) world.createCollider(R.ColliderDesc.cuboid(23,23,2).setTranslation(0,0,z).setFriction(.3).setRestitution(.015),wallBody);
 let chips=[],bodies=[],colliders=[],accumulator=0,steps=0,roll=0,tilt=0,moving=true,stableFor=0,actionAge=0,lastRmsLinear=0,lastRmsAngular=0,smoothLinear=0,smoothAngular=0,freezeReason=null,disposed=false,boundaryCorrections=0,maxBoundaryCorrectionMm=0;
 let random=randomFrom(seed),shakeMotion=null;
 const api={get chips(){return chips;},chamberAudit:chamber,poses,step,orient,shake,reset,snapshot,dispose};
 function wake() { for(const b of bodies)b.wakeUp(); moving=true;stableFor=0;actionAge=0;smoothLinear=0;smoothAngular=0;freezeReason=null; }
 function reset(nextCount=count,shape={}) {
  if(shape.bulk!==undefined)bulk=Math.max(0,Math.min(1,Number(shape.bulk)||0));
  if(disposed)throw Error('Chip physics is disposed');
  const enlarged=sizeScale>1,layerPitch=2.195*sizeScale+.03;
  const layerCapacity=enlarged?Math.floor((chamber.solverCeilingMm-chamber.solverFloorMm+.03)/layerPitch):0;
  const capacity=enlarged?Math.min(MAX_COUNT,13*layerCapacity):MAX_COUNT;
  count=Math.max(0,Math.min(capacity,Math.round(Number(nextCount)||0)));
  random=randomFrom(seed);shakeMotion=null;
  for(const b of bodies)world.removeRigidBody(b);
  bodies=[];colliders=[];chips=[];accumulator=0;
  const slots=[];
  const xyPitch=enlarged?5.6*sizeScale+.02:5.65;
  for(let q=-3;q<=3;q++)for(let r=-3;r<=3;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=3&&q*q+q*r+r*r<(enlarged?4:9))slots.push([xyPitch*(q+r*.5),xyPitch*Math.sqrt(3)/2*r]);
  slots.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
  const layers=enlarged?layerCapacity:count>124?5:4, pitch=enlarged?layerPitch:layers===5?1.91:2.35;
  for(let i=0;i<count;i++) {
   const chip=makeBrokenChip(i,random,!enlarged&&layers===5,{bulk}),xy=slots[i%slots.length],layer=Math.floor(i/slots.length);
   if(sizeScale!==1){chip.vertices=chip.vertices.map(p=>p.map(v=>v*sizeScale));chip.thicknessMm*=sizeScale;chip.volumeMm3*=sizeScale**3;}
   chip.boundingRadiusMm=Math.max(...chip.vertices.map(v=>Math.hypot(...v)));
   let a=random()*Math.PI*2;
   // Outer hex slots fit broad glass fragments when their actual support is
   // aligned with the chamber. Test the rendered vertices, never shrink a hull.
   if(enlarged){
    let bestAngle=a,bestSupport=Infinity;
    for(let turn=0;turn<360;turn++){
     const candidate=a+turn*Math.PI/180,c=Math.cos(candidate),s=Math.sin(candidate);
     const support=Math.max(...chip.vertices.flatMap(([x,y])=>wallNormals.map(([nx,ny])=>(xy[0]+x*c-y*s)*nx+(xy[1]+x*s+y*c)*ny)));
     if(support<bestSupport){bestSupport=support;bestAngle=candidate;}
    }
    if(bestSupport>wallRadius-.005)throw Error(`Scaled chip ${i} cannot fit its chamber slot at sizeScale ${sizeScale}`);
    a=bestAngle;
   }
   const z=(chamber.solverFloorMm+chamber.solverCeilingMm)/2+(layer-(layers-1)/2)*pitch;
   const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(xy[0],xy[1],z).setRotation({x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)}).setCcdEnabled(true).setLinearDamping(3).setAngularDamping(35).setCanSleep(true));
   const hull=R.ColliderDesc.convexHull(new Float32Array(chip.vertices.flat()));
   if(!hull)throw Error('Invalid convex chip hull');
   const collider=world.createCollider(hull.setDensity(DENSITY_KG_MM3).setFriction(.34).setRestitution(.015),body);
   chips.push(chip);bodies.push(body);colliders.push(collider);
  }
  wake();if(count===0)moving=false;
 }
 function poses(){return bodies.map((b,i)=>{const p=b.translation(),q=b.rotation();return {id:chips[i].id,positionMm:[p.x,p.y,p.z],rotation:[q.x,q.y,q.z,q.w],sleeping:b.isSleeping()};});}
 function orient(nextRoll,nextTilt) {
  nextRoll=Number(nextRoll)||0;nextTilt=Number(nextTilt)||0;
  if(nextRoll===roll&&nextTilt===tilt)return false;
  roll=nextRoll;tilt=nextTilt;const r=roll*Math.PI/180,t=tilt*Math.PI/180;
  world.gravity={x:Math.sin(r)*Math.cos(t)*9810,y:-Math.cos(r)*Math.cos(t)*9810,z:-Math.sin(t)*9810};wake();return true;
 }
 function shake() {
  wake();shakeMotion={elapsed:0,pulse:-1,kicks:[]};return true;
 }
 function advanceShake(dt) {
  if(!shakeMotion)return;
  // Three finite hand-like strokes, integrated by the physics clock. Pausing
  // pauses the stroke too; repeated clicks restart it without stacking timers.
  const motion=shakeMotion,spacing=.30,duration=.14,pulse=Math.floor(motion.elapsed/spacing);
  if(pulse>=3){shakeMotion=null;return;}
  const g=world.gravity,length=Math.hypot(g.x,g.y,g.z)||1;
  if(pulse!==motion.pulse){
   motion.pulse=pulse;
   motion.kicks=bodies.map(()=>{
    const lift=420+random()*180;
    return {v:[-g.x/length*lift+(random()-.5)*600,-g.y/length*lift+(random()-.5)*600,-g.z/length*lift+(random()-.5)*400],w:[(random()-.5)*32,(random()-.5)*32,(random()-.5)*32]};
   });
  }
  const phase=motion.elapsed-pulse*spacing;
  if(phase<duration){
   const end=Math.min(duration,phase+dt),portion=(Math.cos(Math.PI*phase/duration)-Math.cos(Math.PI*end/duration))/2;
   for(let i=0;i<bodies.length;i++){
    const body=bodies[i],v=body.linvel(),w=body.angvel(),kick=motion.kicks[i];
    body.setLinvel({x:v.x+kick.v[0]*portion-g.x*(end-phase),y:v.y+kick.v[1]*portion-g.y*(end-phase),z:v.z+kick.v[2]*portion-g.z*(end-phase)},true);
    body.setAngvel({x:w.x+kick.w[0]*portion,y:w.y+kick.w[1]*portion,z:w.z+kick.w[2]*portion},true);
   }
  }
  motion.elapsed+=dt;
  if(motion.elapsed>=2*spacing+duration)shakeMotion=null;
 }
 // A hard unilateral boundary projection supplements CCD at this display-rate timestep.
 // It uses every rendered hull vertex, removes outward linear velocity, and never teleports
 // between interior poses. Chip/chip contacts remain the Rapier convex contact solver.
 function enforceBoundary() {
  for(let i=0;i<bodies.length;i++) {
   const b=bodies[i];if(b.isSleeping())continue;
   const t=b.translation(),bound=chips[i].boundingRadiusMm;
   if(Math.hypot(t.x,t.y)+bound<projectionWallRadius&&t.z-bound>chamber.hardProjectionFloorMm&&t.z+bound<chamber.hardProjectionCeilingMm)continue;
   const q=b.rotation(),v=b.linvel(),w=b.angvel();
   const points=chips[i].vertices.map(a=>{const tx=2*(q.y*a[2]-q.z*a[1]),ty=2*(q.z*a[0]-q.x*a[2]),tz=2*(q.x*a[1]-q.y*a[0]);return [a[0]+q.w*tx+q.y*tz-q.z*ty,a[1]+q.w*ty+q.z*tx-q.x*tz,a[2]+q.w*tz+q.x*ty-q.y*tx];});
   let changed=false;
   function project(amount,nx,ny,nz,point) { if(amount<=.00001)return;t.x-=amount*nx;t.y-=amount*ny;t.z-=amount*nz;const outward=v.x*nx+v.y*ny+v.z*nz;if(outward>0){v.x-=outward*nx;v.y-=outward*ny;v.z-=outward*nz;}if(point){const rx=point[1]*nz-point[2]*ny,ry=point[2]*nx-point[0]*nz,rz=point[0]*ny-point[1]*nx,rotationOutward=w.x*rx+w.y*ry+w.z*rz,norm=rx*rx+ry*ry+rz*rz;if(rotationOutward>0&&norm>1e-9){w.x-=rotationOutward*rx/norm;w.y-=rotationOutward*ry/norm;w.z-=rotationOutward*rz/norm;}}changed=true;boundaryCorrections++;maxBoundaryCorrectionMm=Math.max(maxBoundaryCorrectionMm,amount); }
   const zs=points.map(a=>a[2]);
   project(t.z+Math.max(...zs)-chamber.hardProjectionCeilingMm,0,0,1,points[zs.indexOf(Math.max(...zs))]);
   project(chamber.hardProjectionFloorMm-t.z-Math.min(...zs),0,0,-1,points[zs.indexOf(Math.min(...zs))]);
   for(let pass=0;pass<2;pass++)for(let k=0;k<WALLS;k++){const [nx,ny]=wallNormals[k],center=t.x*nx+t.y*ny;if(center+bound<projectionWallRadius)continue;let support=-Infinity,supportPoint;for(const v of points){const dot=v[0]*nx+v[1]*ny;if(dot>support){support=dot;supportPoint=v;}}project(center+support-projectionWallRadius,nx,ny,0,supportPoint);}
   if(changed){b.setTranslation(t,false);b.setLinvel(v,false);b.setAngvel(w,false);}
  }
 }
 function step(dtSeconds) {
  if(disposed||!moving)return false;
  accumulator+=Math.max(0,Math.min(Number(dtSeconds)||0,1/30));
  let moved=false,taken=0;
  while(accumulator>=FIXED_DT&&taken<4&&moving) {
   advanceShake(FIXED_DT);world.step();enforceBoundary();steps++;taken++;accumulator-=FIXED_DT;actionAge+=FIXED_DT;moved=true;
   let linearEnergy=0,angularEnergy=0,awake=0;
   for(const b of bodies){if(b.isSleeping())continue;awake++;const v=b.linvel(),w=b.angvel();linearEnergy+=v.x*v.x+v.y*v.y+v.z*v.z;angularEnergy+=w.x*w.x+w.y*w.y+w.z*w.z;}
   const rmsLinear=Math.sqrt(linearEnergy/Math.max(1,bodies.length)),rmsAngular=Math.sqrt(angularEnergy/Math.max(1,bodies.length));lastRmsLinear=rmsLinear;lastRmsAngular=rmsAngular;
   // Native sleep is authoritative. Dense contact stacks may jitter below visual resolution;
   // after a sustained low-energy interval, explicitly sleep the complete stable assembly.
   // Limits are8mm/s translation and3rad/s angular RMS, smoothed over~0.2s;
   // one120Hz step of a5.6mm shard then moves less than~0.14mm (below a256²/44mm pixel).
   smoothLinear+=(rmsLinear-smoothLinear)*.04;smoothAngular+=(rmsAngular-smoothAngular)*.04;
   stableFor=actionAge>1.5&&smoothLinear<8&&smoothAngular<3?stableFor+FIXED_DT:0;
   if(!shakeMotion&&(awake===0||stableFor>.8)){if(awake){for(const b of bodies)b.sleep();freezeReason='stable-subpixel-contact-jitter';}else freezeReason='rapier-sleep';moving=false;accumulator=0;}
  }
  return moved;
 }
 function snapshot(){const sleeping=bodies.filter(b=>b.isSleeping()).length,solidVolumeMm3=chips.reduce((sum,c)=>sum+c.volumeMm3,0);return {moving,sleeping,steps,shaking:shakeMotion!==null,count:chips.length,sizeScale,bulk,rollDeg:roll,tiltDeg:tilt,fixedDtSeconds:FIXED_DT,maxCatchupSteps:4,stableForSeconds:stableFor,smoothedRmsLinearMmPerSecond:smoothLinear,smoothedRmsAngularRadPerSecond:smoothAngular,actionAgeSeconds:actionAge,freezeReason,lastRmsLinearMmPerSecond:lastRmsLinear,lastRmsAngularRadPerSecond:lastRmsAngular,boundaryCorrections,maxBoundaryCorrectionMm,hardBoundaryProjection:true,settlePolicy:{minActionAgeSeconds:1.5,sustainedSeconds:.8,smoothedRmsLinearLimitMmPerSecond:8,smoothedRmsAngularLimitRadPerSecond:3,linearDamping:3,angularDamping:35},solidVolumeMm3,nominalSolidFraction:solidVolumeMm3/chamber.nominalVolumeMm3,chamberAudit:chamber};}
 function dispose(){if(!disposed){world.free();disposed=true;moving=false;}}
 reset(count);return api;
}
