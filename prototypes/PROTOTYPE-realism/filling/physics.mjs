import {LabPhysics} from '../physics.mjs';
import {transformVertices,volumeMm3} from '../geometry.mjs';
import {LEVELS,random,shard,quaternion} from './shards.mjs';
import {cadContainment,pairPenetration} from './containment.mjs';
import {sampleFreeSpace} from './free-space.mjs';
export const PHYSICS_PROFILE=Object.freeze({hz:960,frameSubstepsAt60Hz:16,lengthUnit:1000,allowedErrorMm:.01,predictionMm:1,solverIterations:24,contactFrequency:960});
export const QUIESCENCE=Object.freeze({durationSeconds:2,maxVertexDisplacementMm:.05,maxLinearSpeedMmS:.5,maxAngularSpeedRadS:.2,maxPenetrationMm:.2});
export const FIXED_POINT='056ff8ecec0d2fb359f3d371107495d1902effec';
export class FillingPhysics extends LabPhysics {
 constructor(R,chamber,{seed=41,level='medium',automaticSleep=true}={}){super(R,chamber,0);this.automaticSleep=!!automaticSleep;this.world.integrationParameters.normalizedPredictionDistance=.001;this.world.integrationParameters.numSolverIterations=24;this.world.integrationParameters.contact_natural_frequency=960;this.containment=cadContainment(chamber);this.configure({seed,level});}
 // LabPhysics constructs its shared CAD world then invokes reset. No shared edits.
 reset(){for(const body of this.bodies||[])this.world.removeRigidBody(body);this.chips=[];this.bodies=[];this.colliders=[];this.lastQuiescence=null;this.quietWindow=null;this.sleepCause=null;}
 configure({seed=this.seed,level=this.level}={}){
  if(!(level in LEVELS)||!Number.isInteger(seed))throw Error('Invalid filling seed/level');
  this.reset();this.seed=seed;this.level=level;this.replaying=false;this.replayPoses=null;this.recording=null;this.roll=this.targetRoll=0;this.tilt=this.targetTilt=0;this.paused=false;
  const rng=random(seed),chamberVolume=Math.PI*this.chamber.radiusMm**2*this.chamber.nominalGapMm,target=LEVELS[level]*chamberVolume;let volume=0,attempts=0,rejectedShapes=0;
  while(volume<target){
   const chip=shard(this.chips.length,rng),desc=this.R.ColliderDesc.convexHull(new Float32Array(chip.vertices.flat()));if(!desc)throw Error('Non-convex shard');
   const body=this.world.createRigidBody(this.R.RigidBodyDesc.dynamic().setCanSleep(this.automaticSleep).setCcdEnabled(true).setLinearDamping(.25).setAngularDamping(.3));
   const collider=this.world.createCollider(desc.setDensity(2.5e-6).setFriction(.35).setRestitution(.03),body);let placed=false;
   for(let trial=0;trial<30000;trial++){
    attempts++;const r=Math.sqrt(rng())*(this.chamber.radiusMm-1),angle=rng()*Math.PI*2,q=quaternion(rng),pose={positionMm:[r*Math.cos(angle),r*Math.sin(angle),this.chamber.floorEnvelopeMm+rng()*this.chamber.nominalGapMm],rotation:q};
    const vertices=transformVertices(chip,pose);if(vertices.some(([x,y,z])=>Math.hypot(x,y)>this.chamber.radiusMm-.1||z<this.chamber.floorEnvelopeMm+.1||z>this.chamber.ceilingMm-.1))continue;
    body.setTranslation({x:pose.positionMm[0],y:pose.positionMm[1],z:pose.positionMm[2]},false);body.setRotation({x:q[0],y:q[1],z:q[2],w:q[3]},false);this.world.propagateModifiedBodyPositionsToColliders();
    if(this.colliders.some(c=>{const hit=collider.contactCollider(c,.05);return hit&&hit.distance<.05;}))continue;
    placed=true;break;
   }
   if(!placed){this.world.removeRigidBody(body);rejectedShapes++;if(rejectedShapes>100)throw Error(`Cannot safely pack ${level} seed ${seed} at ${volume/chamberVolume}`);continue;}
   this.chips.push(chip);this.bodies.push(body);this.colliders.push(collider);volume+=chip.volumeMm3;
  }
  this.packing={attempts,rejectedShapes,chamberVolumeMm3:chamberVolume,nominalTargetFraction:LEVELS[level]};this.freeSpace=sampleFreeSpace(this.chamber,this.chips,this.poses());this.wake();return this.snapshot();
 }
 wake(){this.quietWindow=null;this.sleepCause=null;super.wake();}
 orient(roll,tilt){this.quietWindow=null;this.sleepCause=null;super.orient(roll,tilt);}
 shake(){this.quietWindow=null;this.sleepCause=null;this.bodies.forEach((b,i)=>{const a=i*2.39996;b.setLinvel({x:Math.cos(a)*130,y:100,z:Math.sin(a)*110},true);b.setAngvel({x:4*Math.sin(a),y:4*Math.cos(a),z:3},true);});}
 step(frames=1){if(this.replaying||this.paused)return 0;let taken=0;for(let i=0;i<frames;i++){const n=super.step(1);if(!n)break;taken+=n;this.considerQuiescence(n);}if(taken&&this.recording)this.recording.frames.push(this.capture());return taken;}
 considerQuiescence(taken){
  if(this.roll!==this.targetRoll||this.tilt!==this.targetTilt){this.quietWindow=null;return;}
  if(this.bodies.every(b=>b.isSleeping())){this.sleepCause='native-auto';return;}
  const speed=b=>{const v=b.linvel(),w=b.angvel();return Math.hypot(v.x,v.y,v.z)<=QUIESCENCE.maxLinearSpeedMmS&&Math.hypot(w.x,w.y,w.z)<=QUIESCENCE.maxAngularSpeedRadS;};
  if(!this.bodies.every(speed)){this.quiescenceRejectedBySpeed=(this.quiescenceRejectedBySpeed||0)+1;this.quietWindow=null;return;}
  const poses=super.poses(),vertices=this.chips.map((c,i)=>transformVertices(c,poses[i]));
  const maxLinearSpeedMmS=Math.max(...this.bodies.map(b=>{const v=b.linvel();return Math.hypot(v.x,v.y,v.z);})),maxAngularSpeedRadS=Math.max(...this.bodies.map(b=>{const v=b.angvel();return Math.hypot(v.x,v.y,v.z);}));
  if(!this.quietWindow){this.quietWindow={anchor:vertices,elapsed:0,maxDisplacementMm:0,maxLinearSpeedMmS,maxAngularSpeedRadS};return;}
  const displacement=Math.max(...vertices.flatMap((vs,i)=>vs.map((p,j)=>Math.hypot(...p.map((x,k)=>x-this.quietWindow.anchor[i][j][k])))));
  if(displacement>QUIESCENCE.maxVertexDisplacementMm){this.quiescenceRejectedByDrift=(this.quiescenceRejectedByDrift||0)+1;this.quietWindow={anchor:vertices,elapsed:0,maxDisplacementMm:0,maxLinearSpeedMmS,maxAngularSpeedRadS};return;}
  this.quietWindow.maxLinearSpeedMmS=Math.max(this.quietWindow.maxLinearSpeedMmS,maxLinearSpeedMmS);this.quietWindow.maxAngularSpeedRadS=Math.max(this.quietWindow.maxAngularSpeedRadS,maxAngularSpeedRadS);this.quietWindow.maxDisplacementMm=Math.max(this.quietWindow.maxDisplacementMm,displacement);this.quietWindow.elapsed+=taken*this.world.timestep;
  if(this.quietWindow.elapsed<QUIESCENCE.durationSeconds)return;
  let invalid=vertices.some((vs,i)=>this.containment(vs,this.chips[i].indices)>=QUIESCENCE.maxPenetrationMm);
  for(let i=0;i<vertices.length&&!invalid;i++)for(let j=i+1;j<vertices.length;j++)if(pairPenetration(vertices[i],vertices[j],this.chips[i].indices,this.chips[j].indices)>=QUIESCENCE.maxPenetrationMm){invalid=true;break;}
  for(const c of this.colliders)for(const other of [...this.boundaries,...this.colliders])if(c!==other)this.world.contactPair(c,other,m=>{for(let k=0;k<m.numContacts();k++)if(-m.contactDist(k)>=QUIESCENCE.maxPenetrationMm)invalid=true;});
  if(invalid){this.quietWindow=null;return;}
  this.lastQuiescence={durationSeconds:this.quietWindow.elapsed,maxVertexDisplacementMm:this.quietWindow.maxDisplacementMm,maxLinearSpeedMmS:this.quietWindow.maxLinearSpeedMmS,maxAngularSpeedRadS:this.quietWindow.maxAngularSpeedRadS,posesBefore:poses};
  // User-authorized whole-pile stop, only after all bodies are demonstrably still.
  for(const b of this.bodies)b.sleep();this.sleepCause='verified-quiescence';this.quietWindow=null;
 }
 poses(){return this.replaying&&this.replayPoses?this.replayPoses.map(p=>({...p,positionMm:[...p.positionMm],rotation:[...p.rotation]})):super.poses();}
 capture(){return {steps:this.steps,roll:this.roll,tilt:this.tilt,poses:this.poses()};}
 startRecording(){if(this.replaying)throw Error('Exit replay before recording');this.recording={version:1,units:'mm',fixedPoint:FIXED_POINT,seed:this.seed,level:this.level,chips:this.chips.map(c=>({...c})),frames:[this.capture()]};return this.recording;}
 stopRecording(){const result=this.recording;this.recording=null;return result;}
 replay(recording,index=0){
  if(recording.version!==1||recording.units!=='mm'||recording.chips.length!==this.chips.length||recording.chips.some((c,i)=>JSON.stringify(c.vertices)!==JSON.stringify(this.chips[i].vertices)))throw Error('Replay requires matching shard geometry');
  const frame=recording.frames[index];if(!frame||frame.poses.length!==this.bodies.length)throw Error('Invalid replay frame');this.replaying=true;this.recording=null;this.replayPoses=frame.poses.map(p=>({...p,positionMm:[...p.positionMm],rotation:[...p.rotation]}));
  frame.poses.forEach((p,i)=>{const [x,y,z]=p.positionMm,[qx,qy,qz,w]=p.rotation,b=this.bodies[i];b.setTranslation({x,y,z},false);b.setRotation({x:qx,y:qy,z:qz,w},false);b.setLinvel({x:0,y:0,z:0},false);b.setAngvel({x:0,y:0,z:0},false);b.sleep();});this.world.propagateModifiedBodyPositionsToColliders();this.roll=frame.roll;this.tilt=frame.tilt;this.targetRoll=this.roll;this.targetTilt=this.tilt;
  return this.capture();
 }
 endReplay(){this.replaying=false;this.replayPoses=null;this.wake();}
 fillAudit(){const visible=this.chips.reduce((s,c)=>s+volumeMm3(c.vertices,c.indices),0),physical=this.colliders.reduce((s,c)=>s+c.volume(),0);return {...this.packing,sampledFreeSpace:this.freeSpace,visibleVolumeMm3:visible,physicalVolumeMm3:physical,visibleFraction:visible/this.packing.chamberVolumeMm3,physicalFraction:physical/this.packing.chamberVolumeMm3,unoccupiedNominalFraction:1-physical/this.packing.chamberVolumeMm3,geometryNote:'Сумма выпуклых объёмов, не измеренный объём объединения; CAD-рельеф добавляет местный зазор ниже номинальной плоскости.'};}
 snapshot(){return {...super.snapshot(),seed:this.seed,level:this.level,replaying:!!this.replaying,sleepCause:this.sleepCause||null,physicsProfile:PHYSICS_PROFILE,automaticSleep:this.automaticSleep,quiescence:this.lastQuiescence?{durationSeconds:this.lastQuiescence.durationSeconds,maxVertexDisplacementMm:this.lastQuiescence.maxVertexDisplacementMm,maxLinearSpeedMmS:this.lastQuiescence.maxLinearSpeedMmS,maxAngularSpeedRadS:this.lastQuiescence.maxAngularSpeedRadS}:null,...(this.packing?{fill:this.fillAudit()}:{} )};}
}
