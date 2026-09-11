// PROTOTYPE: independent rigid-body chamber and mirror geometry in CAD millimetres.
import * as C from 'cannon-es';
import RAPIER from 'rapier';
await RAPIER.init();
export const OPTICS = Object.freeze({ inradius: 6.13952809568071, entryZ: 192, exitZ: 12, chamberRadius: 18.8, floorZ: 0, ceilingZ: 10 });
export const NORMALS = [[0,-1],[Math.sqrt(3)/2,.5],[-Math.sqrt(3)/2,.5]];
export const PHYSICS_HZ = 480;
export const FIXED_STEP = 1 / PHYSICS_HZ;
const SHAKE_TICKS = PHYSICS_HZ * .5;
export function mirrorRay(origin, direction, limit=64) {
 const p=[...origin], d=[...direction]; let bounces=0;
 for(let i=0;i<limit;i++) {
  const end=(OPTICS.exitZ-p[2])/d[2]; let distance=end, wall=-1;
  NORMALS.forEach((n,index)=>{const den=n[0]*d[0]+n[1]*d[1]; if(den>1e-9){const t=(OPTICS.inradius-n[0]*p[0]-n[1]*p[1])/den; if(t>=-1e-5&&t<distance){distance=Math.max(0,t);wall=index;}}});
  for(let j=0;j<3;j++)p[j]+=d[j]*distance;
  if(wall<0)return {position:p,direction:d,bounces,complete:true};
  const n=NORMALS[wall], dot=n[0]*d[0]+n[1]*d[1];d[0]-=2*dot*n[0];d[1]-=2*dot*n[1];
  p[0]-=n[0]*1e-6;p[1]-=n[1]*1e-6;bounces++;
 }
 return {position:p,direction:d,bounces,complete:false};
}
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function makeShard(sx,sy,h,variant=0,beveled=true){
 // The render keeps bevels; collision uses the enclosing five-sided prism.
 const profiles=[ [[-1,-.5],[.35,-.9],[1,-.15],[.55,.8],[-.65,1]], [[-.9,-.8],[.55,-.65],[1,.4],[-.15,1],[-1,.2]], [[-.8,-1],[.7,-.55],[1,.15],[.2,.95],[-1,.55]] ];
 const polygon=profiles[variant%3],vertices=[];
 const layers=beveled?[[.94,-h],[1,0],[.92,h]]:[[1,-h],[1,h]];
 for(const [scale,z] of layers)for(const [x,y] of polygon)vertices.push(new C.Vec3(x*sx*scale,y*sy*scale,z));
 const top=(layers.length-1)*5;
 const faces=[[4,3,2,1,0],[top,top+1,top+2,top+3,top+4]];
 for(let ring=0;ring<layers.length-1;ring++)for(let i=0;i<5;i++){const j=(i+1)%5;faces.push([ring*5+i,ring*5+j,(ring+1)*5+j,(ring+1)*5+i]);}
 return new C.ConvexPolyhedron({vertices,faces});
}
export class Filling {
 constructor(count=24,seed=71){this.depth=10;this.reset(count,seed);}
 reset(count=24,seed=71){
  this.world?.free();this.seed=seed;this.tick=0;this.settled=false;this.quietSeconds=0;this.paused=false;this.roll=0;this.tilt=0;this.shakeLeft=0;this.shakePhase=[0,0,0];this.baseGravity=new C.Vec3(0,0,-981);
  // Rapier uses millimetres; the public pose adapter keeps the viewer in centimetres.
  this.world=new RAPIER.World({x:0,y:0,z:-9810});this.world.timestep=FIXED_STEP;this.world.lengthUnit=1000;this.world.integrationParameters.normalizedAllowedLinearError=.00002;this.world.integrationParameters.normalizedPredictionDistance=.0002;this.world.integrationParameters.contact_natural_frequency=1000;this.world.numSolverIterations=4;this.world.integrationParameters.maxCcdSubsteps=4;
  const fixed=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  this.world.createCollider(RAPIER.ColliderDesc.cuboid(30,30,2).setTranslation(0,0,-2).setContactSkin(.15),fixed);
  this.world.createCollider(RAPIER.ColliderDesc.cuboid(30,30,2).setTranslation(0,0,this.depth+2).setContactSkin(.15),fixed);
  for(let i=0;i<48;i++){const a=i*Math.PI*2/48,q=new C.Quaternion();q.setFromAxisAngle(new C.Vec3(0,0,1),a);this.world.createCollider(RAPIER.ColliderDesc.cuboid(2,1.6,this.depth/2+1).setTranslation(Math.cos(a)*20.8,Math.sin(a)*20.8,this.depth/2).setRotation(q).setContactSkin(.15),fixed);}
  const rand=rng(seed);this.pieces=[];const slots=[[0,0]];for(let j=0;j<7;j++)slots.push([13*Math.cos(j*2*Math.PI/7),13*Math.sin(j*2*Math.PI/7)]);
  for(let i=0;i<count;i++){
   const sx=3.7+rand()*.7,sy=3.4+rand(),h=.62+rand()*.22,shape=makeShard(sx/10,sy/10,h/10,i,false);
   // The lightweight pose object preserves the viewer's centimetre/quaternion interface.
   const body={position:new C.Vec3(),quaternion:new C.Quaternion(),velocity:new C.Vec3(),angularVelocity:new C.Vec3(),shapes:[shape],sleepState:0};
   const [x,y]=slots[i%slots.length];body.position.set(x/10,y/10,.1+Math.floor(i/slots.length)*.19);body.quaternion.setFromAxisAngle(new C.Vec3(0,0,1),rand()*Math.PI*2);
   const rigid=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(body.position.x*10,body.position.y*10,body.position.z*10).setRotation(body.quaternion).setCcdEnabled(true).setCanSleep(false).setLinearDamping(.15).setAngularDamping(.35));
   const points=Float32Array.from(shape.vertices.flatMap(v=>[v.x*10,v.y*10,v.z*10]));
   const collider=RAPIER.ColliderDesc.convexHull(points);if(!collider)throw new Error('Invalid glass collision hull');
   this.world.createCollider(collider.setMass(.01).setFriction(.26).setRestitution(.08),rigid);
   this.pieces.push({body,rigid,sx,sy,h,color:i%4});
  }
  this.setOrientation(0,0);this.sync();
 }
 sync(){for(const {body,rigid} of this.pieces){const p=rigid.translation(),q=rigid.rotation(),v=rigid.linvel(),w=rigid.angvel();body.position.set(p.x/10,p.y/10,p.z/10);body.quaternion.set(q.x,q.y,q.z,q.w);body.velocity.set(v.x/10,v.y/10,v.z/10);body.angularVelocity.set(w.x,w.y,w.z);body.sleepState=rigid.isSleeping()?2:0;}}
 resetRest(){this.settled=false;this.quietSeconds=0;this.restTicks=0;this.windowStable=true;this.restPoses=this.pieces.map(({body})=>({position:body.position.clone(),quaternion:body.quaternion.clone()}));}
 setOrientation(roll,tilt){this.resetRest();this.roll=roll;this.tilt=tilt;const q=new C.Quaternion();q.setFromEuler((tilt-90)*Math.PI/180,0,roll*Math.PI/180,'XYZ');q.conjugate().vmult(new C.Vec3(0,-981,0),this.baseGravity);this.world.gravity={x:this.baseGravity.x*10,y:this.baseGravity.y*10,z:this.baseGravity.z*10};this.pieces.forEach(p=>{p.rigid.wakeUp();p.body.sleepState=0;});}
 shake(){this.resetRest();const rand=rng(this.seed+this.tick+313);this.shakeLeft=SHAKE_TICKS;this.shakePhase=[rand()*Math.PI*2,rand()*Math.PI*2,rand()*Math.PI*2];this.pieces.forEach(({rigid,body})=>{const v=rigid.linvel();rigid.setLinvel({x:v.x+(rand()-.5)*210,y:v.y+(rand()-.5)*210,z:v.z+(rand()-.5)*95},true);rigid.setAngvel({x:(rand()-.5)*20,y:(rand()-.5)*20,z:(rand()-.5)*20},true);body.sleepState=0;});}
 // Thin-wall CCD can leave a vertex outside for one step. Enforce the closed
 // chamber as an analytic boundary, then let Rapier resolve chip contacts.
 contain(){
  for(const {body,rigid} of this.pieces){
   const vertices=body.shapes[0].vertices.map(v=>body.quaternion.vmult(v));
   const p=body.position.clone(),v=body.velocity.clone();
   const lo=Math.min(...vertices.map(v=>v.z)),hi=Math.max(...vertices.map(v=>v.z));
   if(p.z+lo<0){p.z=-lo;if(v.z<0)v.z=0;}
   if(p.z+hi>this.depth/10){p.z=this.depth/10-hi;if(v.z>0)v.z=0;}
   for(let pass=0;pass<4;pass++)for(const vertex of vertices){
    const x=p.x+vertex.x,y=p.y+vertex.y,r=Math.hypot(x,y);
    if(r>1.88){const nx=x/r,ny=y/r;p.x-=nx*(r-1.88);p.y-=ny*(r-1.88);const outward=v.x*nx+v.y*ny;if(outward>0){v.x-=outward*nx;v.y-=outward*ny;}}
   }
   if(p.distanceTo(body.position)>1e-7){rigid.setTranslation({x:p.x*10,y:p.y*10,z:p.z*10},true);rigid.setLinvel({x:v.x*10,y:v.y*10,z:v.z*10},true);body.position.copy(p);body.velocity.copy(v);}
  }
 }
 shaking(){return this.shakeLeft>0;}
 step(){
  if(this.paused||this.settled)return;
  if(this.shakeLeft>0){const t=(SHAKE_TICKS-this.shakeLeft)*FIXED_STEP,fade=Math.min(1,this.shakeLeft/(PHYSICS_HZ/8)),a=600*fade,[p0,p1,p2]=this.shakePhase,g=this.baseGravity;this.world.gravity={x:(g.x+a*Math.sin(2*Math.PI*12*t+p0))*10,y:(g.y+a*Math.sin(2*Math.PI*15.6*t+p1))*10,z:(g.z+1500*fade*Math.sin(2*Math.PI*14*t+p2))*10};if(this.shakeLeft%(PHYSICS_HZ/12)===0)this.pieces.forEach(p=>p.rigid.wakeUp());this.shakeLeft--;}
  else this.world.gravity={x:this.baseGravity.x*10,y:this.baseGravity.y*10,z:this.baseGravity.z*10};
  this.world.step();this.tick++;this.sync();this.contain();
  // Velocity impulses can jitter while the pose barely changes. Measure the
  // whole 250 ms window: <0.12 mm travel and <0.02 rad rotation for every chip.
  this.windowStable=this.windowStable&&!this.shaking()&&this.pieces.every(({body},i)=>{
   const previous=this.restPoses[i],a=body.quaternion,b=previous.quaternion;
   return body.position.distanceTo(previous.position)<.012&&Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)>Math.cos(.01);
  });
  if(++this.restTicks>=PHYSICS_HZ/4){
   this.quietSeconds=this.windowStable?this.quietSeconds+.25:0;this.restTicks=0;this.windowStable=true;
   this.pieces.forEach(({body},i)=>{this.restPoses[i].position.copy(body.position);this.restPoses[i].quaternion.copy(body.quaternion);});
   if(this.quietSeconds>=.5){this.pieces.forEach(p=>p.rigid.sleep());this.settled=true;this.sync();}
  }
 }
 state(){let moving=0,energy=0,escaped=0;for(const {body} of this.pieces){const v=body.velocity.length();if(v>.2)moving++;energy+=v*v;for(const vertex of body.shapes[0].vertices){const p=body.quaternion.vmult(vertex);p.vadd(body.position,p);if(p.z<-.045||p.z>this.depth/10+.045||Math.hypot(p.x,p.y)>1.93)escaped++;}}return{count:this.pieces.length,moving,energy,escaped,tick:this.tick,paused:this.paused,shaking:this.shakeLeft>0,roll:this.roll,tilt:this.tilt};}
 dispose(){this.world.free();}
}
