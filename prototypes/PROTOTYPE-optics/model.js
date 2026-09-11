// PROTOTYPE: independent rigid-body chamber and mirror geometry in CAD millimetres.
import * as C from 'cannon-es';
import RAPIER from 'rapier';
await RAPIER.init();
export const OPTICS = Object.freeze({ inradius: 6.13952809568071, entryZ: 192, exitZ: 12, chamberRadius: 18.8, floorZ: 0, ceilingZ: 10 });
export const NORMALS = [[0,-1],[Math.sqrt(3)/2,.5],[-Math.sqrt(3)/2,.5]];
export const PHYSICS_HZ = 240;
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
export function makeShard(sx,sy,h,variant=0,beveled=true,profile=null){
 // Collision uses a convex polygon prism; the render adds fractured faces inside it.
 const profiles=[ [[-1,-.5],[.35,-.9],[1,-.15],[.55,.8],[-.65,1]], [[-.9,-.8],[.55,-.65],[1,.4],[-.15,1],[-1,.2]], [[-.8,-1],[.7,-.55],[1,.15],[.2,.95],[-1,.55]] ];
 const polygon=profile||profiles[variant%3],vertices=[],n=polygon.length;
 const layers=beveled?[[.94,-h],[1,0],[.92,h]]:[[1,-h],[1,h]];
 for(const [scale,z] of layers)for(const [x,y] of polygon)vertices.push(new C.Vec3(x*sx*scale,y*sy*scale,z));
 const top=(layers.length-1)*n;
 const faces=[Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>top+i)];
 for(let ring=0;ring<layers.length-1;ring++)for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([ring*n+i,ring*n+j,(ring+1)*n+j,(ring+1)*n+i]);}
 return new C.ConvexPolyhedron({vertices,faces});
}
// A cracked sheet makes irregular convex chips without initial intersections.
// Three separated layers leave room to slide and tip in the 10 mm chamber.
function packedChips(count,seed){
 const rand=rng(seed),chips=[];
 for(let layer=0;chips.length<count;layer++){
  const angle=rand()*Math.PI*2,sites=[[0,0]];
  for(const [n,r] of [[7,6],[12,11.2],[12,16.2]])for(let j=0;j<n;j++){const a=angle+j*2*Math.PI/n;sites.push([Math.cos(a)*r+(rand()-.5)*1.5,Math.sin(a)*r+(rand()-.5)*1.5]);}
  for(const [index,site] of sites.entries()){
   let polygon=Array.from({length:24},(_,i)=>[18.5*Math.cos(i*Math.PI/12),18.5*Math.sin(i*Math.PI/12)]);
   for(const other of sites){if(other===site)continue;const nx=other[0]-site[0],ny=other[1]-site[1],d=(other[0]**2+other[1]**2-site[0]**2-site[1]**2)/2,cut=[];
    for(let j=0;j<polygon.length;j++){const a=polygon[j],b=polygon[(j+1)%polygon.length],da=a[0]*nx+a[1]*ny-d,db=b[0]*nx+b[1]*ny-d;if(da<=0)cut.push(a);if((da<=0)!==(db<=0)){const t=da/(da-db);cut.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}polygon=cut;
   }
   const center=polygon.reduce((v,p)=>[v[0]+p[0]/polygon.length,v[1]+p[1]/polygon.length],[0,0]);
   const profile=polygon.map(p=>[(p[0]-center[0])*.86,(p[1]-center[1])*.86]);
   let diameter=0;for(const a of profile)for(const b of profile)diameter=Math.max(diameter,Math.hypot(a[0]-b[0],a[1]-b[1]));
   if(diameter>9.1)profile.forEach(p=>{p[0]*=9.1/diameter;p[1]*=9.1/diameter;});
   chips.push({x:center[0],y:center[1],z:1.55+layer*3.1,h:1.15+rand()*.15,profile,color:(index+layer*3)%8});
   if(chips.length===count)break;
  }
 }
 return chips;
}

export function fracturedSurface(p,i){
 // An irregular fractured surface sits inside the simpler collision prism.
 const profile=p.profile,n=profile.length,pos=[],indices=[];
   const random=k=>{const x=Math.sin((i+1)*127.1+k*311.7)*43758.5453;return x-Math.floor(x);};
   for(let ring=0;ring<3;ring++)for(let j=0;j<n;j++){
    const a=profile[j],b=profile[(j+1)%n],mix=.03+random(j+ring*31)*.11,scale=ring===1?.98:.84+random(j+ring*47)*.14;
    pos.push((a[0]*(1-mix)+b[0]*mix)*scale,(a[1]*(1-mix)+b[1]*mix)*scale,(ring-1)*p.h*(.78+.22*random(j+ring*13)));
   }
   pos.push(0,0,-p.h*.9,0,0,p.h*.93);
   for(let j=0;j<n;j++){const k=(j+1)%n;indices.push(3*n,k,j,3*n+1,2*n+j,2*n+k);for(let ring=0;ring<2;ring++)indices.push(ring*n+j,ring*n+k,(ring+1)*n+k,ring*n+j,(ring+1)*n+k,(ring+1)*n+j);}
 return {positions:pos,indices};
}

const rotation=(roll,tilt)=>{const q=new C.Quaternion();q.setFromEuler((tilt-90)*Math.PI/180,0,roll*Math.PI/180,'XYZ');return q;};
const angleBetween=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)/Math.sqrt((a.x*a.x+a.y*a.y+a.z*a.z+a.w*a.w)*(b.x*b.x+b.y*b.y+b.z*b.z+b.w*b.w))));
export class Filling {
 constructor(count=96,seed=71){this.depth=10;this.reset(count,seed);}
 reset(count=96,seed=71){
  if(!Number.isInteger(count)||count<0||count>96)throw Error('The 10 mm chamber supports 0–96 chips');
  this.world?.free();this.seed=seed;this.tick=0;this.paused=false;this.roll=0;this.tilt=0;this.shakeLeft=0;
  this.orientation=rotation(0,0);this.target=this.orientation.clone();this.center=new C.Vec3();
  this.world=new RAPIER.World({x:0,y:-9810,z:0});this.world.timestep=FIXED_STEP;this.world.lengthUnit=1000;
  this.world.integrationParameters.normalizedAllowedLinearError=.00002;this.world.integrationParameters.normalizedPredictionDistance=.0002;
  this.world.integrationParameters.contact_natural_frequency=1000;this.world.numSolverIterations=4;this.world.integrationParameters.maxCcdSubsteps=4;
  this.chamber=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setRotation(this.orientation));
  const wallMaterial=collider=>collider.setFriction(.45).setRestitution(.015).setContactSkin(.08);
  for(const z of [-this.depth/2-2,this.depth/2+2])this.world.createCollider(wallMaterial(RAPIER.ColliderDesc.cuboid(30,30,2).setTranslation(0,0,z)),this.chamber);
  for(let i=0;i<32;i++){const a=i*Math.PI*2/32,q=new C.Quaternion();q.setFromAxisAngle(new C.Vec3(0,0,1),a);this.world.createCollider(wallMaterial(RAPIER.ColliderDesc.cuboid(2,2.1,this.depth/2+1).setTranslation(Math.cos(a)*20.8,Math.sin(a)*20.8,0).setRotation(q)),this.chamber);}
  this.pieces=[];
  for(const chip of packedChips(count,seed)){
   const {h,profile}=chip,shape=makeShard(.1,.1,h/10,0,false,profile);
   const position=this.orientation.vmult(new C.Vec3(chip.x,chip.y,chip.z-this.depth/2));
   const rigid=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x,position.y,position.z).setRotation(this.orientation).setCcdEnabled(false).setCanSleep(false).setLinearDamping(.03).setAngularDamping(.08));
   const points=Float32Array.from(shape.vertices.flatMap(v=>[v.x*10,v.y*10,v.z*10]));
   const collider=RAPIER.ColliderDesc.roundConvexHull(points,.3);if(!collider)throw Error('Invalid collision hull');
   this.world.createCollider(collider.setMass(.01).setFriction(.32).setRestitution(.015),rigid);
   const body={position:new C.Vec3(),quaternion:new C.Quaternion(),velocity:new C.Vec3(),angularVelocity:new C.Vec3(),shapes:[shape],sleepState:0};
   this.pieces.push({...chip,sx:1,sy:1,body,rigid});
  }
  this.sync();this.resetRest();
 }
 sync(){
  const q=this.chamber.rotation();this.orientation.set(q.x,q.y,q.z,q.w);const p=this.chamber.translation();this.center.set(p.x,p.y,p.z);
  const inverse=this.orientation.conjugate(),linear=this.chamber.linvel(),angular=this.chamber.angvel(),omega=new C.Vec3(angular.x,angular.y,angular.z);
  for(const {body,rigid} of this.pieces){
   const p=rigid.translation(),q=rigid.rotation(),v=rigid.linvel(),w=rigid.angvel(),r=new C.Vec3(p.x-this.center.x,p.y-this.center.y,p.z-this.center.z),wallVelocity=omega.cross(r);
   inverse.vmult(r,body.position);body.position.z+=this.depth/2;body.position.scale(.1,body.position);
   inverse.mult(new C.Quaternion(q.x,q.y,q.z,q.w),body.quaternion);
   inverse.vmult(new C.Vec3(v.x-linear.x-wallVelocity.x,v.y-linear.y-wallVelocity.y,v.z-linear.z-wallVelocity.z),body.velocity);body.velocity.scale(.1,body.velocity);
   inverse.vmult(new C.Vec3(w.x-angular.x,w.y-angular.y,w.z-angular.z),body.angularVelocity);body.sleepState=rigid.isSleeping()?2:0;
  }
 }
 resetRest(){this.settled=false;this.quietSeconds=0;this.restTicks=0;this.windowStable=true;this.restPoses=this.pieces.map(({body})=>({position:body.position.clone(),quaternion:body.quaternion.clone()}));this.poseSums=this.pieces.map(()=>({position:new C.Vec3(),quaternion:[0,0,0,0]}));}
 wake(){this.resetRest();this.pieces.forEach(p=>{p.rigid.wakeUp();p.body.sleepState=0;});}
 setOrientation(roll,tilt){this.roll=roll;this.tilt=tilt;this.target=rotation(roll,tilt);this.wake();}
 shake(){this.shakeLeft=SHAKE_TICKS;this.wake();}
 shaking(){return this.shakeLeft>0;}
 rotating(){return angleBetween(this.orientation,this.target)>.0001;}
 moveChamber(){
  const angle=angleBetween(this.orientation,this.target),next=this.orientation.slerp(this.target,Math.min(1,1.2*FIXED_STEP/Math.max(angle,1e-9)));
  this.chamber.setNextKinematicRotation(next);
  let displacement=new C.Vec3();
  if(this.shaking()){
   const progress=(SHAKE_TICKS-this.shakeLeft+1)/SHAKE_TICKS,t=progress*.5,envelope=Math.sin(progress*Math.PI)**2;
   displacement.set(1.1*Math.sin(t*2*Math.PI*8)*envelope,.7*Math.sin(t*2*Math.PI*11)*envelope,1.6*Math.sin(t*2*Math.PI*9)*envelope);this.shakeLeft--;
  }
  displacement.scale(.5,displacement);displacement=next.vmult(displacement);this.chamber.setNextKinematicTranslation(displacement);
 }
 contain(){
  for(const {body,rigid} of this.pieces){
   const vertices=body.shapes[0].vertices.map(v=>body.quaternion.vmult(v)),p=body.position.clone();
   p.z=Math.max(-Math.min(...vertices.map(v=>v.z)),Math.min(this.depth/10-Math.max(...vertices.map(v=>v.z)),p.z));
   for(let pass=0;pass<3;pass++)for(const v of vertices){const x=p.x+v.x,y=p.y+v.y,r=Math.hypot(x,y);if(r>1.88){p.x-=x/r*(r-1.88);p.y-=y/r*(r-1.88);}}
   if(p.distanceTo(body.position)>.00001){const world=this.orientation.vmult(new C.Vec3(p.x*10,p.y*10,p.z*10-this.depth/2)).vadd(this.center);rigid.setTranslation(world,true);body.position.copy(p);}
  }
 }
 step(){
  if(this.paused||this.settled)return;
  this.moveChamber();this.world.step();this.tick++;this.sync();this.contain();
  this.windowStable=this.windowStable&&!this.shaking()&&!this.rotating();
  for(const [i,{body}] of this.pieces.entries()){
   const reference=this.restPoses[i],sum=this.poseSums[i],q=body.quaternion;
   // Reject large excursions; accept tiny solver rocking only when its mean is stationary.
   const excursion=body.position.distanceTo(reference.position)+.5*angleBetween(q,reference.quaternion);
   if(excursion>.2)this.windowStable=false;
   sum.position.vadd(body.position,sum.position);
   const sign=q.x*reference.quaternion.x+q.y*reference.quaternion.y+q.z*reference.quaternion.z+q.w*reference.quaternion.w<0?-1:1;
   [q.x,q.y,q.z,q.w].forEach((v,j)=>sum.quaternion[j]+=v*sign);
  }
  if(++this.restTicks>=PHYSICS_HZ/4){
   this.pieces.forEach((p,i)=>{
    const sum=this.poseSums[i],reference=this.restPoses[i];sum.position.scale(1/this.restTicks,sum.position);
    const q=new C.Quaternion(...sum.quaternion);q.normalize();
    if(sum.position.distanceTo(reference.position)>=.03||angleBetween(q,reference.quaternion)>=.06)this.windowStable=false;
    reference.position.copy(sum.position);reference.quaternion.copy(q);sum.position.set(0,0,0);sum.quaternion.fill(0);
   });
   this.quietSeconds=this.windowStable?this.quietSeconds+.25:0;this.restTicks=0;this.windowStable=true;
   if(this.quietSeconds>=.75){this.pieces.forEach(p=>p.rigid.sleep());this.settled=true;this.sync();}
  }
 }
 state(){let moving=0,energy=0,escaped=0;for(const {body} of this.pieces){const v=body.velocity.length();if(v>.2)moving++;energy+=v*v;for(const vertex of body.shapes[0].vertices){const p=body.quaternion.vmult(vertex).vadd(body.position);if(p.z<-.045||p.z>this.depth/10+.045||Math.hypot(p.x,p.y)>1.93)escaped++;}}return{count:this.pieces.length,moving,energy,escaped,tick:this.tick,paused:this.paused,shaking:this.shaking(),roll:this.roll,tilt:this.tilt};}
 dispose(){this.world.free();}
}
