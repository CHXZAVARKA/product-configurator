// PROTOTYPE: independent rigid-body chamber and mirror geometry in CAD millimetres.
import * as C from 'cannon-es';
export const OPTICS = Object.freeze({ inradius: 6.13952809568071, entryZ: 192, exitZ: 12, chamberRadius: 18.8, floorZ: 0, ceilingZ: 10 });
export const NORMALS = [[0,-1],[Math.sqrt(3)/2,.5],[-Math.sqrt(3)/2,.5]];
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
export function makeShard(sx,sy,h){
 const vertices=[[-sx,-.7*sy,-h],[sx,-.7*sy,-h],[0,sy,-h],[-sx,-.7*sy,h],[sx,-.7*sy,h],[0,sy,h]].map(v=>new C.Vec3(...v));
 const faces=[[2,1,0],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]];
 return new C.ConvexPolyhedron({vertices,faces});
}
export class Filling {
 constructor(count=24,seed=71){this.depth=10;this.reset(count,seed);}
 reset(count=24,seed=71){
  this.seed=seed;this.tick=0;this.paused=false;this.roll=0;this.tilt=0;
  this.world=new C.World({gravity:new C.Vec3(0,-981,0),allowSleep:true});
  this.world.solver.iterations=18;this.world.defaultContactMaterial.friction=.26;this.world.defaultContactMaterial.restitution=.13;
  this.world.defaultContactMaterial.contactEquationStiffness=1e7;
  const solid=new C.Body({mass:0});
  solid.addShape(new C.Box(new C.Vec3(3,3,.2)),new C.Vec3(0,0,-.2));
  solid.addShape(new C.Box(new C.Vec3(3,3,.2)),new C.Vec3(0,0,this.depth/10+.2));
  for(let i=0;i<48;i++){const a=i*Math.PI*2/48,q=new C.Quaternion();q.setFromAxisAngle(new C.Vec3(0,0,1),a);solid.addShape(new C.Box(new C.Vec3(.2,.16,this.depth/20+.1)),new C.Vec3(Math.cos(a)*2.08,Math.sin(a)*2.08,this.depth/20),q);}
  this.world.addBody(solid);const rand=rng(seed);this.pieces=[];
  const slots=[];for(let y=-12;y<=12;y+=6)for(let x=-12;x<=12;x+=6)if(Math.hypot(x,y)<15)slots.push([x,y]);
  for(let i=0;i<count;i++){
   const sx=1.65+rand()*.7,sy=1.8+rand()*.55,h=.48+rand()*.17;
   const body=new C.Body({mass:.01,shape:makeShard(sx/10,sy/10,h/10),linearDamping:.15,angularDamping:.35,sleepSpeedLimit:.8,sleepTimeLimit:.7});
   const [x,y]=slots[i%slots.length];body.position.set(x/10,y/10,.16+Math.floor(i/slots.length)*.32);
   body.quaternion.setFromAxisAngle(new C.Vec3(0,0,1),rand()*Math.PI*2);
   this.world.addBody(body);this.pieces.push({body,sx,sy,h,color:i%4,anchor:body.position.clone(),anchorQ:body.quaternion.clone(),quiet:0});
  }
  this.setOrientation(0,0);
 }
 setOrientation(roll,tilt){this.roll=roll;this.tilt=tilt;const q=new C.Quaternion();q.setFromEuler((tilt-90)*Math.PI/180,0,roll*Math.PI/180,'XYZ');q.conjugate().vmult(new C.Vec3(0,-981,0),this.world.gravity);this.pieces.forEach(p=>{p.body.wakeUp();p.quiet=0;});}
 shake(){const rand=rng(this.seed+this.tick+313);this.pieces.forEach(p=>{const {body}=p;p.quiet=0;body.wakeUp();body.velocity.x+=(rand()-.5)*21;body.velocity.y+=(rand()-.5)*21;body.velocity.z+=(rand()-.5)*9.5;body.angularVelocity.set((rand()-.5)*20,(rand()-.5)*20,(rand()-.5)*20);});}
 step(){
  if(this.paused)return;
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
 state(){let moving=0,energy=0,escaped=0;for(const {body,sx,sy,h} of this.pieces){const v=body.velocity.length();if(v>.2)moving++;energy+=v*v;for(const vertex of body.shapes[0].vertices){const p=body.quaternion.vmult(vertex);p.vadd(body.position,p);if(p.z<-.045||p.z>this.depth/10+.045||Math.hypot(p.x,p.y)>1.93)escaped++;}}return {count:this.pieces.length,moving,energy,escaped,tick:this.tick,paused:this.paused,roll:this.roll,tilt:this.tilt};}
}
