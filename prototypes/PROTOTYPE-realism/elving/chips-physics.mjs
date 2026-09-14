import { chamberFromCAD, volumeMm3 } from '../geometry.mjs';

const FIXED_DT = 1 / 120;
const MAX_COUNT = 140;
const WALLS = 32;
const CLEARANCE = .16;
const DENSITY_KG_MM3 = 2.5e-6;
const randomFrom = seed => { let n = seed >>> 0; return () => { n += 0x6d2b79f5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const colors = [[.02,.68,.72],[.86,.04,.51],[.035,.18,.77],[1,.43,.025],[.42,.08,.68],[.025,.56,.13]];

function makeConvexChip(id, random, thin) {
 const n = 5 + Math.floor(random() * 2), contour = [];
 const radius = 2.73 + random() * .07;
 // Irregular angular spacing on one ellipse stays strictly convex.
 const ellipse = .94 + random() * .06;
 for (let i = 0; i < n; i++) { const a = (i + (random() - .5) * .8) * Math.PI * 2 / n; contour.push([Math.cos(a)*radius, Math.sin(a)*radius*ellipse]); }
 const thicknessMm = thin ? 1.68 + random()*.08 : 1.94 + random()*.14;
 const slopeX = (random()-.5)*.028, slopeY = (random()-.5)*.028;
 const vertices = [];
 for (const [scale,z] of [[.92,-thicknessMm/2],[1,0],[.92,thicknessMm/2]]) for (const [x,y] of contour) vertices.push([x*scale,y*scale,z+slopeX*x*scale+slopeY*y*scale]);
 const indices = [];
 for (let i=1;i<n-1;i++) { indices.push(0,i+1,i); indices.push(2*n,2*n+i,2*n+i+1); }
 for (let ring=0;ring<2;ring++) for (let i=0;i<n;i++) { const j=(i+1)%n,a=ring*n+i,b=ring*n+j,c=(ring+1)*n+j,d=(ring+1)*n+i; indices.push(a,b,c,a,c,d); }
 return {id,vertices,indices,color:[...colors[id%colors.length]],thicknessMm,volumeMm3:volumeMm3(vertices,indices),provenance:'Procedural loose glass hypothesis: convex beveled 5–6 mm shards, glass density 2500 kg/m³; not measured STEP parts.'};
}

export function chipChamberAudit(cad) {
 const c=chamberFromCAD(cad), radiusMm=c.radiusMm-CLEARANCE;
 return Object.freeze({radiusMm:c.radiusMm,floorEnvelopeMm:c.floorEnvelopeMm,ceilingMm:c.ceilingMm,wallSegments:WALLS,solverWallApothemMm:radiusMm*Math.cos(Math.PI/WALLS),solverFloorMm:c.floorEnvelopeMm+CLEARANCE,solverCeilingMm:c.ceilingMm-CLEARANCE,clearanceMm:CLEARANCE,hardProjectionWallApothemMm:(c.radiusMm-.01)*Math.cos(Math.PI/WALLS),hardProjectionFloorMm:c.floorEnvelopeMm+.01,hardProjectionCeilingMm:c.ceilingMm-.01,approximation:'Conservative 32-sided inscribed cylinder and planar maximum-z CAD floor envelope. Actual Elving recesses and surface facets do not participate in chip contacts.',nominalVolumeMm3:Math.PI*c.radiusMm**2*c.nominalGapMm});
}

export function createChipPhysics(RAPIER,cad,{count=108,seed=0x4e17a9}={}) {
 const chamber=chipChamberAudit(cad), world=new RAPIER.World({x:0,y:-9810,z:0});
 world.timestep=FIXED_DT;
 const p=world.integrationParameters;
 p.lengthUnit=10;
 p.normalizedAllowedLinearError=.0004;
 p.numSolverIterations=3;
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
 let random=randomFrom(seed);
 const api={get chips(){return chips;},chamberAudit:chamber,poses,step,orient,shake,reset,snapshot,dispose};
 function wake() { for(const b of bodies)b.wakeUp(); moving=true;stableFor=0;actionAge=0;smoothLinear=0;smoothAngular=0;freezeReason=null; }
 function reset(nextCount=count) {
  if(disposed)throw Error('Chip physics is disposed');
  count=Math.max(0,Math.min(MAX_COUNT,Math.round(Number(nextCount)||0)));
  random=randomFrom(seed);
  for(const b of bodies)world.removeRigidBody(b);
  bodies=[];colliders=[];chips=[];accumulator=0;
  const slots=[];
  for(let q=-3;q<=3;q++)for(let r=-3;r<=3;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=3&&q*q+q*r+r*r<9)slots.push([5.65*(q+r*.5),5.65*Math.sqrt(3)/2*r]);
  slots.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
  const layers=count>124?5:4, pitch=layers===5?1.91:2.35;
  for(let i=0;i<count;i++) {
   const chip=makeConvexChip(i,random,layers===5),xy=slots[i%slots.length],layer=Math.floor(i/slots.length),a=random()*Math.PI*2,z=4.75+(layer-(layers-1)/2)*pitch;
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
  wake();for(const b of bodies){b.setLinvel({x:(random()-.5)*240,y:(random()-.5)*240,z:(random()-.5)*160},true);b.setAngvel({x:(random()-.5)*14,y:(random()-.5)*14,z:(random()-.5)*14},true);}return true;
 }
 // A hard unilateral boundary projection supplements CCD at this display-rate timestep.
 // It uses every rendered hull vertex, removes outward linear velocity, and never teleports
 // between interior poses. Chip/chip contacts remain the Rapier convex contact solver.
 function enforceBoundary() {
  for(let i=0;i<bodies.length;i++) {
   const b=bodies[i];if(b.isSleeping())continue;
   const t=b.translation(),bound=3.2;
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
   world.step();enforceBoundary();steps++;taken++;accumulator-=FIXED_DT;actionAge+=FIXED_DT;moved=true;
   let linearEnergy=0,angularEnergy=0,awake=0;
   for(const b of bodies){if(b.isSleeping())continue;awake++;const v=b.linvel(),w=b.angvel();linearEnergy+=v.x*v.x+v.y*v.y+v.z*v.z;angularEnergy+=w.x*w.x+w.y*w.y+w.z*w.z;}
   const rmsLinear=Math.sqrt(linearEnergy/Math.max(1,bodies.length)),rmsAngular=Math.sqrt(angularEnergy/Math.max(1,bodies.length));lastRmsLinear=rmsLinear;lastRmsAngular=rmsAngular;
   // Native sleep is authoritative. Dense contact stacks may jitter below visual resolution;
   // after a sustained low-energy interval, explicitly sleep the complete stable assembly.
   // Limits are8mm/s translation and3rad/s angular RMS, smoothed over~0.2s;
   // one120Hz step of a5.6mm shard then moves less than~0.14mm (below a256²/44mm pixel).
   smoothLinear+=(rmsLinear-smoothLinear)*.04;smoothAngular+=(rmsAngular-smoothAngular)*.04;
   stableFor=actionAge>1.5&&smoothLinear<8&&smoothAngular<3?stableFor+FIXED_DT:0;
   if(awake===0||stableFor>.8){if(awake){for(const b of bodies)b.sleep();freezeReason='stable-subpixel-contact-jitter';}else freezeReason='rapier-sleep';moving=false;accumulator=0;}
  }
  return moved;
 }
 function snapshot(){const sleeping=bodies.filter(b=>b.isSleeping()).length,solidVolumeMm3=chips.reduce((sum,c)=>sum+c.volumeMm3,0);return {moving,sleeping,steps,count:chips.length,rollDeg:roll,tiltDeg:tilt,fixedDtSeconds:FIXED_DT,maxCatchupSteps:4,stableForSeconds:stableFor,smoothedRmsLinearMmPerSecond:smoothLinear,smoothedRmsAngularRadPerSecond:smoothAngular,actionAgeSeconds:actionAge,freezeReason,lastRmsLinearMmPerSecond:lastRmsLinear,lastRmsAngularRadPerSecond:lastRmsAngular,boundaryCorrections,maxBoundaryCorrectionMm,hardBoundaryProjection:true,settlePolicy:{minActionAgeSeconds:1.5,sustainedSeconds:.8,smoothedRmsLinearLimitMmPerSecond:8,smoothedRmsAngularLimitRadPerSecond:3,linearDamping:3,angularDamping:35},solidVolumeMm3,nominalSolidFraction:solidVolumeMm3/chamber.nominalVolumeMm3,chamberAudit:chamber};}
 function dispose(){if(!disposed){world.free();disposed=true;moving=false;}}
 reset(count);return api;
}
