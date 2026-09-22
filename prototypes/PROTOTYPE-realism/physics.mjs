import {makeChip, transformVertices} from './geometry.mjs';
const MM=1; // Rapier millimetres; public poses are also mm. Avoid tiny convex GJK geometry.
// Dependency injection keeps Node checks and offline builds on the same implementation.
export class LabPhysics {
 constructor(RAPIER,chamber,count=2) {
  this.R=RAPIER;this.chamber=chamber;this.world=new RAPIER.World({x:0,y:-9810,z:0});
  this.world.timestep=1/960;this.world.integrationParameters.lengthUnit=1000;
  this.world.integrationParameters.normalizedAllowedLinearError=0.00001;
  this.world.integrationParameters.numSolverIterations=12;
  this.world.integrationParameters.contact_natural_frequency=240;
  this.world.integrationParameters.maxCcdSubsteps=4;

  this.paused=false;this.steps=0;this.roll=0;this.tilt=0;this.targetRoll=0;this.targetTilt=0;
  this.boundaries=chamber.parts.map(part=>this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(part.positions.map(v=>v*MM)),new Uint32Array(part.indices)).setFriction(.35).setRestitution(.03)));
  this.reset(count);
 }
 reset(count=2) {
  for(const body of this.bodies||[])this.world.removeRigidBody(body);
  this.chips=Array.from({length:count},(_,i)=>makeChip(i));this.bodies=[];this.colliders=[];
  this.chips.forEach((chip,i)=>{
   const body=this.world.createRigidBody(this.R.RigidBodyDesc.dynamic().setTranslation((i?5:-5)*MM,3*MM,5*MM).setRotation({x:.12*(i+1),y:0,z:0,w:Math.sqrt(1-.0144*(i+1)**2)}).setCcdEnabled(true).setLinearDamping(.25).setAngularDamping(.3));
   const desc=this.R.ColliderDesc.convexHull(new Float32Array(chip.vertices.flat().map(v=>v*MM)));
   if(!desc)throw Error('Invalid closed convex solid');
   const collider=this.world.createCollider(desc.setDensity(2.5e-6).setFriction(.35).setRestitution(.03),body);
   this.bodies.push(body);this.colliders.push(collider);
  });this.wake();
 }
 wake(){for(const b of this.bodies)b.wakeUp();}
 orient(roll,tilt){this.targetRoll=roll;this.targetTilt=tilt;this.wake();}
 updateOrientation(){const move=(v,target)=>v+Math.max(-90*this.world.timestep,Math.min(90*this.world.timestep,target-v));this.roll=move(this.roll,this.targetRoll);this.tilt=move(this.tilt,this.targetTilt);const r=this.roll*Math.PI/180,t=this.tilt*Math.PI/180;this.world.gravity={x:Math.sin(r)*Math.cos(t)*9810,y:-Math.cos(r)*Math.cos(t)*9810,z:-Math.sin(t)*9810};}

 shake(){this.bodies.forEach((b,i)=>{b.setLinvel({x:(i?-130:130),y:100,z:140},true);b.setAngvel({x:6,y:i?-5:5,z:3},true);});}
 setPaused(value){this.paused=!!value;}
 step(frames=1){if(this.paused)return 0;const rotating=this.roll!==this.targetRoll||this.tilt!==this.targetTilt;if(rotating)this.wake();if(!rotating&&this.bodies.every(b=>b.isSleeping()))return 0;let taken=0;for(let i=0;i<frames;i++){this.updateOrientation();this.world.step();this.steps++;taken++;}return taken;}
 poses(){return this.bodies.map((b,i)=>{const p=b.translation(),q=b.rotation();return {id:this.chips[i].id,positionMm:[p.x/MM,p.y/MM,p.z/MM],rotation:[q.x,q.y,q.z,q.w],sleeping:b.isSleeping()};});}
 snapshot(){return {steps:this.steps,paused:this.paused,count:this.chips.length,roll:this.roll,tilt:this.tilt,poses:this.poses(),moving:this.bodies.filter(b=>!b.isSleeping()).length};}
 geometryAudit(){return this.chips.map((chip,i)=>({id:chip.id,visualVerticesMm:chip.vertices.map(v=>[...v]),colliderVerticesMm:Array.from(this.colliders[i].shape.vertices).reduce((r,v,j)=>{if(j%3===0)r.push([]);r.at(-1).push(v/MM);return r;},[]),colliderVolumeMm3:this.colliders[i].volume()/MM**3,worldVerticesMm:transformVertices(chip,this.poses()[i])}));}
 dispose(){this.world.free();}
}
