import {AUTHOR_FILL_COLORS,AUTHOR_FILL_DEPTH_MM,AUTHOR_FILL_MASS_G,PHOTO_FILL_PROFILE,makeBrokenChip} from './broken-chip.mjs';
import { chamberFromCAD } from '../geometry.mjs';

export {AUTHOR_FILL_COLORS,AUTHOR_FILL_DEPTH_MM,AUTHOR_FILL_MASS_G,PHOTO_FILL_PROFILE};

const FIXED_DT = 1 / 240;
const PLAYBACK_RATE = .5;
const GRAVITY_MM_S2 = 9810;
const SHAKE_DURATION_SECONDS = 1.5;
const SETTLE_WINDOW_SECONDS = .4;
const MAX_COUNT = 140;
const WALLS = 32;
const CLEARANCE = .16;
const DENSITY_KG_MM3 = 2.5e-6;
const randomFrom = seed => { let n = seed >>> 0; return () => { n += 0x6d2b79f5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
export function chipChamberAudit(cad,{measuredDepthMm=null}={}) {
 const c=chamberFromCAD(cad), radiusMm=c.radiusMm-CLEARANCE,ceilingMm=measuredDepthMm===null?c.ceilingMm:c.floorEnvelopeMm+measuredDepthMm;
 return Object.freeze({radiusMm:c.radiusMm,floorEnvelopeMm:c.floorEnvelopeMm,ceilingMm,measuredDepthMm,wallSegments:WALLS,solverWallApothemMm:radiusMm*Math.cos(Math.PI/WALLS),solverFloorMm:c.floorEnvelopeMm+CLEARANCE,solverCeilingMm:ceilingMm-CLEARANCE,clearanceMm:CLEARANCE,hardProjectionWallApothemMm:(c.radiusMm-.01)*Math.cos(Math.PI/WALLS),hardProjectionFloorMm:c.floorEnvelopeMm+.01,hardProjectionCeilingMm:ceilingMm-.01,approximation:'Conservative 32-sided inscribed cylinder and planar floor envelope; measured depth overrides the CAD ceiling for the photo profile. Actual Elving recesses and surface facets do not participate in chip contacts.',nominalVolumeMm3:Math.PI*c.radiusMm**2*(ceilingMm-c.floorEnvelopeMm)});
}

export function createChipPhysics(RAPIER,cad,{count=108,seed=0x4e17a9,sizeScale=1,sizeVariation=0,bulk=.65,profile=null}={}) {
 if(!Number.isFinite(sizeScale)||sizeScale<=0)throw Error('Chip sizeScale must be a positive finite number');
 if(!Number.isFinite(sizeVariation)||sizeVariation<0||sizeVariation>=1)throw Error('Chip sizeVariation must be finite and between zero and one');
 const chamber=chipChamberAudit(cad,{measuredDepthMm:profile?AUTHOR_FILL_DEPTH_MM:null}), world=new RAPIER.World({x:0,y:-GRAVITY_MM_S2,z:0});
 world.timestep=FIXED_DT;
 const p=world.integrationParameters;
 // Geometry is authored in millimetres. Rapier's normalized tolerances are
 // multiplied by lengthUnit, so keep the physical contact slop explicit.
 p.lengthUnit=1000;
 p.normalizedAllowedLinearError=.00005;
 p.normalizedPredictionDistance=.0002;
 // Sixteen iterations keep the more irregular corner-cut fragments stable
 // under steep gravity changes, without suppressing tumbling or user motion.
 p.numSolverIterations=16;
 p.contact_natural_frequency=120;
 p.numInternalPgsIterations=1;
 p.maxCcdSubsteps=1;
 const R=RAPIER, fixed=R.RigidBodyDesc.fixed();
 const wallNormals=Array.from({length:WALLS},(_,i)=>[Math.cos(i*2*Math.PI/WALLS),Math.sin(i*2*Math.PI/WALLS)]);
 const wallBody=world.createRigidBody(fixed);
 const wallRadius=chamber.solverWallApothemMm, projectionWallRadius=chamber.hardProjectionWallApothemMm, wallDepth=3, halfWidth=wallRadius*Math.tan(Math.PI/WALLS)+.5,wallHalfHeight=(chamber.solverCeilingMm-chamber.solverFloorMm)/2+4,wallCenterZ=(chamber.solverCeilingMm+chamber.solverFloorMm)/2;
 for(let i=0;i<WALLS;i++) {
  const a=i*2*Math.PI/WALLS, q={x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)};
  world.createCollider(R.ColliderDesc.cuboid(wallDepth/2,halfWidth,wallHalfHeight).setTranslation(Math.cos(a)*(wallRadius+wallDepth/2),Math.sin(a)*(wallRadius+wallDepth/2),wallCenterZ).setRotation(q).setFriction(.3).setRestitution(.015),wallBody);
 }
 for(const z of [chamber.solverFloorMm-2,chamber.solverCeilingMm+2]) world.createCollider(R.ColliderDesc.cuboid(23,23,2).setTranslation(0,0,z).setFriction(.3).setRestitution(.015),wallBody);
 let chips=[],bodies=[],colliders=[],accumulator=0,steps=0,roll=0,tilt=0,moving=true,stableFor=0,actionAge=0,lastRmsLinear=0,lastRmsAngular=0,smoothLinear=0,smoothAngular=0,freezeReason=null,disposed=false,boundaryCorrections=0,maxBoundaryCorrectionMm=0,maxInitialPenetrationMm=0;
 let random=randomFrom(seed),shakeMotion=null,shakeSerial=0;
 const api={get chips(){return chips;},chamberAudit:chamber,poses,step,orient,shake,reset,snapshot,dispose};
 function gravityForOrientation() {
  const r=roll*Math.PI/180,t=tilt*Math.PI/180;
  return {x:Math.sin(r)*Math.cos(t)*GRAVITY_MM_S2,y:-Math.cos(r)*Math.cos(t)*GRAVITY_MM_S2,z:-Math.sin(t)*GRAVITY_MM_S2};
 }
 function wake() { for(const b of bodies)b.wakeUp(); moving=true;stableFor=0;actionAge=0;smoothLinear=0;smoothAngular=0;freezeReason=null; }
 function reset(nextCount=count,shape={}) {
  if(shape.bulk!==undefined)bulk=Math.max(0,Math.min(1,Number(shape.bulk)||0));
  if(disposed)throw Error('Chip physics is disposed');
  const maximumScale=sizeScale*(1+sizeVariation),enlarged=maximumScale>1,layerPitch=2.195*maximumScale+.03;
  const layerCapacity=enlarged?Math.floor((chamber.solverCeilingMm-chamber.solverFloorMm+.03)/layerPitch):0;
  const capacity=enlarged?Math.min(MAX_COUNT,13*layerCapacity):MAX_COUNT;
  count=Math.max(0,Math.min(profile?profile.length:capacity,Math.round(Number(nextCount)||0)));
  random=randomFrom(seed);shakeMotion=null;shakeSerial=0;world.gravity=gravityForOrientation();
  for(const b of bodies)world.removeRigidBody(b);
  bodies=[];colliders=[];chips=[];accumulator=0;maxInitialPenetrationMm=0;boundaryCorrections=0;maxBoundaryCorrectionMm=0;
  if(profile){
   // Keep all three dimensions tied to the photographed fragment and measured
   // heights. A small common height correction makes the full 40-piece fill
   // agree with the weighed 11.4 g while staying within measurement error.
   const prepared=Array.from({length:count},(_,i)=>{
    const spec=profile[i],chip=makeBrokenChip(i,random,false,{bulk,colorId:spec.colorId,family:spec.family,ice:spec.ice,photo:true});
    const diameter=2*Math.max(...chip.vertices.map(([x,y])=>Math.hypot(x,y)));
    return {chip,spec,xyScale:spec.diameterMm/diameter};
   });
   const uncorrectedVolume=prepared.reduce((sum,{chip,spec,xyScale})=>sum+chip.volumeMm3*xyScale**2*spec.heightMm/chip.thicknessMm,0);
   const targetVolumeMm3=AUTHOR_FILL_MASS_G/(DENSITY_KG_MM3*1000);
   const heightCorrection=count===profile.length?targetVolumeMm3/uncorrectedVolume:1;
   for(const {chip,spec,xyScale} of prepared){
    const zScale=spec.heightMm*heightCorrection/chip.thicknessMm;
    chip.vertices=chip.vertices.map(([x,y,z])=>[x*xyScale,y*xyScale,z*zScale]);
    chip.thicknessMm*=zScale;chip.volumeMm3*=xyScale**2*zScale;
    chip.boundingRadiusMm=Math.max(...chip.vertices.map(v=>Math.hypot(...v)));
    chip.photoDiameterMm=spec.diameterMm;chip.photoHeightMm=spec.heightMm;chip.sizeScale=xyScale;
   }
   // Interleave the three size classes. Probe real Rapier hulls for free
   // positions, then relax the tightest placements before showing a frame.
   // Keep the chamber weightless until the initial arrangement is ready.
   world.gravity={x:0,y:0,z:0};world.step();
   const bySize=prepared.map((entry,i)=>({...entry,i})).sort((a,b)=>b.spec.diameterMm-a.spec.diameterMm);
   const largePieces=bySize.filter(e=>e.spec.heightMm>=5),mediumPieces=bySize.filter(e=>e.spec.heightMm===3),smallPieces=bySize.filter(e=>e.spec.heightMm<3);
   const placed=[];
   while(largePieces.length||mediumPieces.length||smallPieces.length){if(largePieces.length)placed.push(largePieces.shift());if(mediumPieces.length)placed.push(mediumPieces.shift());if(mediumPieces.length)placed.push(mediumPieces.shift());if(smallPieces.length)placed.push(smallPieces.shift());}
   let packed=false,bestPlaced=0;
   for(let restart=0;restart<32&&!packed;restart++){
    for(const body of bodies)if(body)world.removeRigidBody(body);
    chips=[];bodies=[];colliders=[];world.step();
    let largePlaced=0,failed=false;
   for(const {chip,i} of placed){
    const shape=new R.ConvexPolyhedron(new Float32Array(chip.vertices.flat()));
    const large=chip.photoHeightMm>=5;
    let pose=null,fallback=null,minHits=Infinity;
    for(let attempt=0;attempt<1600;attempt++){
     const yaw=random()*Math.PI*2,tilt=(random()-.5)*(large?.24:1.35);
     const sy=Math.sin(yaw/2),cy=Math.cos(yaw/2),st=Math.sin(tilt/2),ct=Math.cos(tilt/2);
     const q={x:cy*st,y:sy*st,z:sy*ct,w:cy*ct};
     const points=chip.vertices.map(([vx,vy,vz])=>{
      const tx=2*(q.y*vz-q.z*vy),ty=2*(q.z*vx-q.x*vz),tz=2*(q.x*vy-q.y*vx);
      return [vx+q.w*tx+q.y*tz-q.z*ty,vy+q.w*ty+q.z*tx-q.x*tz,vz+q.w*tz+q.x*ty-q.y*tx];
     });
     const zMin=chamber.solverFloorMm-Math.min(...points.map(p=>p[2]))+.06;
     const zMax=chamber.solverCeilingMm-Math.max(...points.map(p=>p[2]))-.06;
     const maxRadius=wallRadius-Math.max(...points.map(([x,y])=>Math.hypot(x,y)))-.06;
     if(zMin>zMax||maxRadius<=0)continue;
     const azimuth=random()*Math.PI*2,radius=maxRadius*Math.sqrt(random());
     const x=radius*Math.cos(azimuth),y=radius*Math.sin(azimuth),z=large?(largePlaced%2?zMax:zMin):(random()<.5?zMin:zMax);
     if(wallNormals.some(([nx,ny])=>points.some(([vx,vy])=>(x+vx)*nx+(y+vy)*ny>wallRadius-.01)))continue;
     let hits=0;
     world.intersectionsWithShape({x,y,z},q,shape,()=>{hits++;return true;});
     if(hits<minHits){minHits=hits;fallback={x,y,z,q};}
     if(!hits){pose={x,y,z,q};break;}
    }
    if(!pose)pose=fallback;
    if(!pose){failed=true;break;}
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pose.x,pose.y,pose.z).setRotation(pose.q).setCcdEnabled(true).setLinearDamping(3).setAngularDamping(35).setCanSleep(true));
    const hull=R.ColliderDesc.convexHull(new Float32Array(chip.vertices.flat()));
    if(!hull)throw Error(`Invalid photo glass hull ${i}`);
    const collider=world.createCollider(hull.setDensity(DENSITY_KG_MM3).setFriction(.34).setRestitution(.015),body);
    chips[i]=chip;bodies[i]=body;colliders[i]=collider;for(let j=0;j<(minHits?12:1);j++)world.step();
    if(large)largePlaced++;
   }
    bestPlaced=Math.max(bestPlaced,bodies.filter(Boolean).length);
    packed=!failed;
   }
   if(!packed)throw Error(`The photographed filling cannot be packed in the CAD chamber (best ${bestPlaced}/${count})`);
   // Settle the few unavoidable close placements before the first visible frame.
   for(let j=0;j<480;j++){world.step();enforceBoundary();}
   for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)world.contactPair(colliders[i],colliders[j],manifold=>{for(let k=0;k<manifold.numContacts();k++)maxInitialPenetrationMm=Math.max(maxInitialPenetrationMm,-manifold.contactDist(k));});
   world.gravity=gravityForOrientation();wake();if(count===0)moving=false;
   return;
  }
  const slots=[];
  const xyPitch=enlarged?5.6*maximumScale+.02:5.65;
  for(let q=-3;q<=3;q++)for(let r=-3;r<=3;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=3&&q*q+q*r+r*r<(enlarged?4:9))slots.push([xyPitch*(q+r*.5),xyPitch*Math.sqrt(3)/2*r]);
  slots.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
  const layers=enlarged?layerCapacity:count>124?5:4, pitch=enlarged?layerPitch:layers===5?1.91:2.35;
  for(let i=0;i<count;i++) {
   const chip=makeBrokenChip(i,random,!enlarged&&layers===5,{bulk}),xy=slots[i%slots.length],layer=Math.floor(i/slots.length);
   const chipScale=sizeScale*(sizeVariation?1+(random()*2-1)*sizeVariation:1);
   if(chipScale!==1){chip.vertices=chip.vertices.map(p=>p.map(v=>v*chipScale));chip.thicknessMm*=chipScale;chip.volumeMm3*=chipScale**3;}
   chip.sizeScale=chipScale;
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
    if(bestSupport>wallRadius-.005)throw Error(`Scaled chip ${i} cannot fit its chamber slot at sizeScale ${chipScale}`);
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
  roll=nextRoll;tilt=nextTilt;world.gravity=gravityForOrientation();wake();return true;
 }
 function shake() {
  // A real hand never repeats the exact same stroke. Rotate the next bounded
  // chamber trajectory by the golden angle so repeated clicks release a
  // different part of the pile without applying per-chip randomness.
  wake();shakeMotion={elapsed:0,azimuth:(shakeSerial++*2.399963229728653)%(Math.PI*2)};return true;
 }
 function advanceShake(dt) {
  if(!shakeMotion)return;
  // Simulate one bounded hand movement in the chamber's non-inertial frame.
  // Each axis is the second derivative of a windowed displacement: position,
  // velocity and acceleration all return smoothly to zero. Every chip receives
  // the same inertial load through world gravity, never a random velocity kick.
  const motion=shakeMotion,t=motion.elapsed,base=gravityForOrientation();
  if(t>=SHAKE_DURATION_SECONDS){world.gravity=base;shakeMotion=null;stableFor=0;return;}
  const gLength=Math.hypot(base.x,base.y,base.z)||1,nx=base.x/gLength,ny=base.y/gLength,nz=base.z/gLength;
  let ux=-ny,uy=nx,uz=0,uLength=Math.hypot(ux,uy,uz);
  if(uLength<.01){ux=1;uy=0;uz=0;uLength=1;}
  ux/=uLength;uy/=uLength;uz/=uLength;
  let vx=ny*uz-nz*uy,vy=nz*ux-nx*uz,vz=nx*uy-ny*ux;
  const ca=Math.cos(motion.azimuth),sa=Math.sin(motion.azimuth),baseU=[ux,uy,uz];
  ux=baseU[0]*ca+vx*sa;uy=baseU[1]*ca+vy*sa;uz=baseU[2]*ca+vz*sa;
  vx=vx*ca-baseU[0]*sa;vy=vy*ca-baseU[1]*sa;vz=vz*ca-baseU[2]*sa;
  const k=Math.PI/SHAKE_DURATION_SECONDS,s=Math.sin(k*t),c=Math.cos(k*t),window=s**3;
  const windowVelocity=3*k*s*s*c,windowAcceleration=6*k*k*s*c*c-3*k*k*s**3;
  const acceleration=(amplitudeMm,frequencyHz,phase)=>{const omega=2*Math.PI*frequencyHz,q=omega*t+phase;return amplitudeMm*((windowAcceleration-omega*omega*window)*Math.sin(q)+2*omega*windowVelocity*Math.cos(q));};
  // Smaller fragments have more room to accelerate before contact, so the
  // same hand stroke needs less displacement than the former oversized pile.
  const lateral=acceleration(52.5,2,0),cross=acceleration(31.5,2.6,Math.PI/3),normal=acceleration(59.5,1.7,Math.PI/2);
  world.gravity={x:base.x-ux*lateral-vx*cross-nx*normal,y:base.y-uy*lateral-vy*cross-ny*normal,z:base.z-uz*lateral-vz*cross-nz*normal};
  motion.elapsed+=dt;
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
  // Half-speed playback preserves the simulated trajectory while keeping the
  // millimetre-scale motion legible. At 60 Hz this still runs two 240 Hz steps.
  accumulator+=Math.max(0,Math.min(Number(dtSeconds)||0,1/30))*PLAYBACK_RATE;
  let moved=false,taken=0;
  while(accumulator>=FIXED_DT&&taken<4&&moving) {
   advanceShake(FIXED_DT);world.step();enforceBoundary();steps++;taken++;accumulator-=FIXED_DT;actionAge+=FIXED_DT;moved=true;
   let linearEnergy=0,angularEnergy=0,awake=0;
   for(const b of bodies){if(b.isSleeping())continue;awake++;const v=b.linvel(),w=b.angvel();linearEnergy+=v.x*v.x+v.y*v.y+v.z*v.z;angularEnergy+=w.x*w.x+w.y*w.y+w.z*w.z;}
   const rmsLinear=Math.sqrt(linearEnergy/Math.max(1,bodies.length)),rmsAngular=Math.sqrt(angularEnergy/Math.max(1,bodies.length));lastRmsLinear=rmsLinear;lastRmsAngular=rmsAngular;
   // Native sleep is authoritative. Dense contact stacks may jitter below visual resolution;
   // after a sustained low-energy interval, explicitly sleep the complete stable assembly.
   // Limits are 8 mm/s translation and 3 rad/s angular RMS, smoothed over
   // roughly 0.2 simulation seconds. One 240 Hz step then moves about 0.03 mm.
   smoothLinear+=(rmsLinear-smoothLinear)*.04;smoothAngular+=(rmsAngular-smoothAngular)*.04;
   stableFor=!shakeMotion&&actionAge>1.5&&smoothLinear<8&&smoothAngular<3?stableFor+FIXED_DT:0;
   if(!shakeMotion&&(awake===0||stableFor>SETTLE_WINDOW_SECONDS)){if(awake){for(const b of bodies)b.sleep();freezeReason='stable-subpixel-contact-jitter';}else freezeReason='rapier-sleep';moving=false;accumulator=0;}
  }
  return moved;
 }
 function snapshot(){const sleeping=bodies.filter(b=>b.isSleeping()).length,solidVolumeMm3=chips.reduce((sum,c)=>sum+c.volumeMm3,0),chipScales=chips.map(chip=>chip.sizeScale);return {moving,sleeping,steps,shaking:shakeMotion!==null,count:chips.length,sizeScale,sizeVariation,chipScaleRange:chipScales.length?[Math.min(...chipScales),Math.max(...chipScales)]:[0,0],bulk,rollDeg:roll,tiltDeg:tilt,fixedDtSeconds:FIXED_DT,playbackRate:PLAYBACK_RATE,shakeDurationSeconds:SHAKE_DURATION_SECONDS,maxCatchupSteps:4,stableForSeconds:stableFor,smoothedRmsLinearMmPerSecond:smoothLinear,smoothedRmsAngularRadPerSecond:smoothAngular,actionAgeSeconds:actionAge,freezeReason,lastRmsLinearMmPerSecond:lastRmsLinear,lastRmsAngularRadPerSecond:lastRmsAngular,boundaryCorrections,maxBoundaryCorrectionMm,maxInitialPenetrationMm,hardBoundaryProjection:true,settlePolicy:{minActionAgeSeconds:1.5,sustainedSeconds:SETTLE_WINDOW_SECONDS,smoothedRmsLinearLimitMmPerSecond:8,smoothedRmsAngularLimitRadPerSecond:3,linearDamping:3,angularDamping:35},solidVolumeMm3,nominalSolidFraction:solidVolumeMm3/chamber.nominalVolumeMm3,chamberAudit:chamber};}
 function dispose(){if(!disposed){world.free();disposed=true;moving=false;}}
 reset(count);return api;
}
