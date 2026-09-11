// PROTOTYPE: independent rigid-body chamber and mirror geometry in CAD millimetres.
import * as C from 'cannon-es';
export const OPTICS = Object.freeze({ inradius: 6.13952809568071, entryZ: 192, exitZ: 12, chamberRadius: 18.8, floorZ: 0, ceilingZ: 10 });
export const NORMALS = [[0,-1],[Math.sqrt(3)/2,.5],[-Math.sqrt(3)/2,.5]];
const SHAKE_TICKS = 360;
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
export function makeShard(sx,sy,h,variant=0){
 // Convex, irregular five-sided chip. Bevels are shared by physics and ray optics.
 const profiles=[ [[-1,-.5],[.35,-.9],[1,-.15],[.55,.8],[-.65,1]], [[-.9,-.8],[.55,-.65],[1,.4],[-.15,1],[-1,.2]], [[-.8,-1],[.7,-.55],[1,.15],[.2,.95],[-1,.55]] ];
 const polygon=profiles[variant%3],vertices=[];
 for(const [scale,z] of [[.94,-h],[1,0],[.92,h]])for(const [x,y] of polygon)vertices.push(new C.Vec3(x*sx*scale,y*sy*scale,z));
 const faces=[[4,3,2,1,0],[10,11,12,13,14]];
 for(let ring=0;ring<2;ring++)for(let i=0;i<5;i++){const j=(i+1)%5;faces.push([ring*5+i,ring*5+j,(ring+1)*5+j,(ring+1)*5+i]);}
 return new C.ConvexPolyhedron({vertices,faces});
}
export class Filling {
 constructor(count=24,seed=71){this.depth=10;this.reset(count,seed);}
 reset(count=24,seed=71){
  this.seed=seed;this.tick=0;this.paused=false;this.roll=0;this.tilt=0;this.shakeLeft=0;this.shakePhase=[0,0,0];this.baseGravity=new C.Vec3(0,0,-981);
  this.world=new C.World({gravity:new C.Vec3(0,-981,0),allowSleep:true});
  this.world.solver.iterations=18;this.world.defaultContactMaterial.friction=.26;this.world.defaultContactMaterial.restitution=.13;
  this.world.defaultContactMaterial.contactEquationStiffness=1e7;
  const solid=new C.Body({mass:0});
  solid.addShape(new C.Box(new C.Vec3(3,3,.2)),new C.Vec3(0,0,-.2));
  solid.addShape(new C.Box(new C.Vec3(3,3,.2)),new C.Vec3(0,0,this.depth/10+.2));
  for(let i=0;i<48;i++){const a=i*Math.PI*2/48,q=new C.Quaternion();q.setFromAxisAngle(new C.Vec3(0,0,1),a);solid.addShape(new C.Box(new C.Vec3(.2,.16,this.depth/20+.1)),new C.Vec3(Math.cos(a)*2.08,Math.sin(a)*2.08,this.depth/20),q);}
  this.world.addBody(solid);const rand=rng(seed);this.pieces=[];
  const slots=[];for(let y=-9;y<=9;y+=9)for(let x=-9;x<=9;x+=9)if(Math.hypot(x,y)<14)slots.push([x,y]);
  for(let i=0;i<count;i++){
   const sx=3.7+rand()*.7,sy=3.4+rand()*1.0,h=.62+rand()*.22;
   const body=new C.Body({mass:.01,shape:makeShard(sx/10,sy/10,h/10,i),linearDamping:.15,angularDamping:.35,sleepSpeedLimit:.8,sleepTimeLimit:.7});
   const [x,y]=slots[i%slots.length];body.position.set(x/10,y/10,.12+Math.floor(i/slots.length)*.25);
   body.quaternion.setFromAxisAngle(new C.Vec3(0,0,1),rand()*Math.PI*2);
   this.world.addBody(body);this.pieces.push({body,sx,sy,h,color:i%4,anchor:body.position.clone(),anchorQ:body.quaternion.clone(),quiet:0});
  }
  this.setOrientation(0,0);
 }
 setOrientation(roll,tilt){this.roll=roll;this.tilt=tilt;const q=new C.Quaternion();q.setFromEuler((tilt-90)*Math.PI/180,0,roll*Math.PI/180,'XYZ');q.conjugate().vmult(new C.Vec3(0,-981,0),this.baseGravity);this.world.gravity.copy(this.baseGravity);this.pieces.forEach(p=>{p.body.wakeUp();p.quiet=0;});}
 shake(){const rand=rng(this.seed+this.tick+313);this.shakeLeft=SHAKE_TICKS;this.shakePhase=[rand()*Math.PI*2,rand()*Math.PI*2,rand()*Math.PI*2];this.pieces.forEach(p=>{const {body}=p;p.quiet=0;body.wakeUp();body.velocity.x+=(rand()-.5)*21;body.velocity.y+=(rand()-.5)*21;body.velocity.z+=(rand()-.5)*9.5;body.angularVelocity.set((rand()-.5)*20,(rand()-.5)*20,(rand()-.5)*20);});}
 shaking(){return this.shakeLeft>0;}
 step(){
  if(this.paused)return;
  if(this.shakeLeft>0){
   // In the chamber frame a shaken container is a fictitious force added to gravity. Tuned to reshuffle in place:
   // ~0.6 g lateral at 12-16 Hz slides shards a few mm, ~1.5 g axial at 14 Hz makes them hop and flip; more lateral force
   // throws the whole filling to the wall within one half-cycle. Fades out over the last eighth of a second.
   const t=(SHAKE_TICKS-this.shakeLeft)/720,fade=Math.min(1,this.shakeLeft/90),a=600*fade,[p0,p1,p2]=this.shakePhase,g=this.baseGravity;
   this.world.gravity.set(g.x+a*Math.sin(2*Math.PI*12*t+p0),g.y+a*Math.sin(2*Math.PI*15.6*t+p1),g.z+1500*fade*Math.sin(2*Math.PI*14*t+p2));
   if(this.shakeLeft%60===0)this.pieces.forEach(p=>{p.quiet=0;p.body.wakeUp();});
   if(--this.shakeLeft===0)this.world.gravity.copy(this.baseGravity);
  }
  this.world.step(1/720);
  // Hard-wall stabilization after the iterative solver. Project actual vertices,
  // then remove outward velocity; this prevents thin fast shards tunnelling.
  for(const {body} of this.pieces){
   if(body.sleepState===C.Body.SLEEPING)continue;
   for(let pass=0;pass<4;pass++){
    let low=Infinity,high=-Infinity;
    for(const vertex of body.shapes[0].vertices){
     const p=body.quaternion.vmult(vertex);p.vadd(body.position,p);low=Math.min(low,p.z);high=Math.max(high,p.z);
     const r=Math.hypot(p.x,p.y);
     if(r>1.92){const nx=p.x/r,ny=p.y/r;body.position.x-=(r-1.89)*nx;body.position.y-=(r-1.89)*ny;const vn=body.velocity.x*nx+body.velocity.y*ny;if(vn>0){body.velocity.x-=1.08*vn*nx;body.velocity.y-=1.08*vn*ny;}}
    }
    if(low<-.04){body.position.z-=low+.01;if(body.velocity.z<0)body.velocity.z*=-.08;}
    if(high>this.depth/10+.04){body.position.z-=high-this.depth/10-.01;if(body.velocity.z>0)body.velocity.z*=-.08;}
   }
   body.aabbNeedsUpdate=true;
  }
  this.tick++;
  // A resting-contact sleep window suppresses solver jitter at this small scale.
  // Bodies still wake on impacts, a changed orientation, or a shake.
  if(this.tick%180===0){
   const touching=new Set();for(const c of this.world.contacts){touching.add(c.bi);touching.add(c.bj);}
   for(const piece of this.pieces){const b=piece.body,q=b.quaternion,a=piece.anchorQ;
    const dot=Math.abs(q.x*a.x+q.y*a.y+q.z*a.z+q.w*a.w);
    if(touching.has(b)&&b.position.distanceTo(piece.anchor)<.06&&dot>.985)piece.quiet++;else piece.quiet=0;
    if(piece.quiet>=3)b.sleep();
    piece.anchor.copy(b.position);piece.anchorQ.copy(q);
   }
  }
 }
 state(){let moving=0,energy=0,escaped=0;for(const {body,sx,sy,h} of this.pieces){const v=body.velocity.length();if(v>.2)moving++;energy+=v*v;for(const vertex of body.shapes[0].vertices){const p=body.quaternion.vmult(vertex);p.vadd(body.position,p);if(p.z<-.045||p.z>this.depth/10+.045||Math.hypot(p.x,p.y)>1.93)escaped++;}}return {count:this.pieces.length,moving,energy,escaped,tick:this.tick,paused:this.paused,shaking:this.shakeLeft>0,roll:this.roll,tilt:this.tilt};}
}
