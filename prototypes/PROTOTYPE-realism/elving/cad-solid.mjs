// Actual exported STEP triangles, in assembly millimetres. No height-map assumption.
export const BASE_SHA = '0d51e61579e1a49aff5c4811ab2ce1b48c712ed6';
export const ELVING_STEP_SHA256 = '2b92aa152d8576d1eb1616d54e6d247afe33757b87c49bfabe9e79ac3b0e16b0';
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const scale=(a,s)=>a.map(x=>x*s);
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const normalize=a=>{const n=Math.hypot(...a);if(!n)throw Error('Zero direction');return scale(a,1/n);};
const EPS=1e-5;
export function refract(direction, opposedNormal, eta) {
 const c=-dot(direction,opposedNormal), k=1-eta*eta*(1-c*c);
 return k<0 ? null : normalize(add(scale(direction,eta),scale(opposedNormal,eta*c-Math.sqrt(k))));
}
export const reflect=(d,n)=>normalize(sub(d,scale(n,2*dot(d,n))));
export function fresnel(cosIncident,n1,n2) {
 const ci=Math.max(0,Math.min(1,cosIncident));
 const st2=(n1/n2)**2*(1-ci*ci);if(st2>=1)return 1;
 const ct=Math.sqrt(1-st2),rs=(n1*ci-n2*ct)/(n1*ci+n2*ct),rp=(n2*ci-n1*ct)/(n2*ci+n1*ct);
 return (rs*rs+rp*rp)/2;
}
// Rz * Ry * Rx, using degrees. Rotate around the native CAD bounds centre.
function rotation(degrees=[0,0,0]) {
 const [x,y,z]=degrees.map(v=>v*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];
}
const multiply=(m,v)=>[dot(m.slice(0,3),v),dot(m.slice(3,6),v),dot(m.slice(6,9),v)];
const transpose=m=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
function bounds(triangles) {
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const t of triangles)for(const p of [t.a,t.b,t.c])for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 return {min,max};
}
function buildBVH(triangles) {
 const box=bounds(triangles);if(triangles.length<=8)return {...box,triangles};
 const axis=box.max.map((v,i)=>v-box.min[i]).indexOf(Math.max(...box.max.map((v,i)=>v-box.min[i])));
 triangles.sort((a,b)=>a.center[axis]-b.center[axis]);const mid=triangles.length>>1;
 return {...box,left:buildBVH(triangles.slice(0,mid)),right:buildBVH(triangles.slice(mid))};
}
function boxNear(node,origin,direction,limit) {
 let lo=EPS,hi=limit;
 for(let i=0;i<3;i++){
  if(Math.abs(direction[i])<1e-12){if(origin[i]<node.min[i]-EPS||origin[i]>node.max[i]+EPS)return Infinity;continue;}
  let a=(node.min[i]-origin[i])/direction[i],b=(node.max[i]-origin[i])/direction[i];if(a>b)[a,b]=[b,a];
  lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi+EPS)return Infinity;
 }
 return lo;
}
function triangleHit(t,o,d) {
 const h=cross(d,t.e2),det=dot(t.e1,h);if(Math.abs(det)<1e-11)return null;
 const inv=1/det,s=sub(o,t.a),u=inv*dot(s,h);if(u<-1e-8||u>1+1e-8)return null;
 const q=cross(s,t.e1),v=inv*dot(d,q);if(v<-1e-8||u+v>1+1e-8)return null;
 const distance=inv*dot(t.e2,q);return distance>EPS ? {t:distance,point:add(o,scale(d,distance)),normal:t.normal,triangle:t.id,barycentric:[1-u-v,u,v]} : null;
}
function intersectBVH(node,o,d,limit=Infinity) {
 if(boxNear(node,o,d,limit)===Infinity)return null;
 let best=null;
 if(node.triangles){for(const t of node.triangles){const hit=triangleHit(t,o,d);if(hit&&hit.t<limit){best=hit;limit=hit.t;}}return best;}
 const ln=boxNear(node.left,o,d,limit),rn=boxNear(node.right,o,d,limit),first=ln<=rn?node.left:node.right,second=ln<=rn?node.right:node.left;
 best=intersectBVH(first,o,d,limit);if(best)limit=best.t;const other=intersectBVH(second,o,d,limit);return other||best;
}
export class CADOpticalSolid {
 constructor(cad) {
  if(cad.sha256!==ELVING_STEP_SHA256)throw Error('Unverified elving CAD source');
  this.source={file:cad.source,stepSHA256:cad.sha256,units:'mm',vertices:cad.positions.length/3,triangles:cad.indices.length/3};
  this.triangles=[];let signedVolume=0;const edgeCounts=new Map(),edgeDirections=new Map();
  for(let i=0;i<cad.indices.length;i+=3){
   const ids=cad.indices.slice(i,i+3),[a,b,c]=ids.map(j=>cad.positions.slice(j*3,j*3+3)),e1=sub(b,a),e2=sub(c,a),n=cross(e1,e2);
   if(Math.hypot(...n)<1e-9)throw Error(`Degenerate triangle ${i/3}`);
   signedVolume+=dot(a,cross(b,c))/6;
   for(let k=0;k<3;k++){const j=ids[k],l=ids[(k+1)%3],key=[Math.min(j,l),Math.max(j,l)].join(':');edgeCounts.set(key,(edgeCounts.get(key)||0)+1);edgeDirections.set(key,(edgeDirections.get(key)||0)+(j<l?1:-1));}
   this.triangles.push({a,b,c,e1,e2,normal:normalize(n),center:scale(add(add(a,b),c),1/3),id:i/3});
  }
  if(signedVolume<=0||[...edgeCounts.values()].some(n=>n!==2)||[...edgeDirections.values()].some(n=>n!==0))throw Error('CAD export must be a closed consistently outward-oriented solid');
  this.bounds=bounds(this.triangles);this.center=scale(add(this.bounds.min,this.bounds.max),.5);
  this.audit={...this.source,boundsMm:this.bounds,signedVolumeMm3:signedVolume,edges:edgeCounts.size,nonManifoldEdges:0,inconsistentEdges:0};
  this.bvh=buildBVH([...this.triangles]);
 }
 poseTransform(pose={}) {
  const r=rotation(pose.rotationDeg),inv=transpose(r),translation=pose.translationMm||[0,0,0],center=this.center;
  return {toLocalPoint:p=>add(center,multiply(inv,sub(sub(p,translation),center))),toWorldPoint:p=>add(add(center,multiply(r,sub(p,center))),translation),toLocalDirection:d=>multiply(inv,d),toWorldDirection:d=>multiply(r,d)};
 }
 intersect(ray,pose={}) {
  const t=this.poseTransform(pose),o=t.toLocalPoint(ray.origin),d=normalize(t.toLocalDirection(ray.direction)),h=intersectBVH(this.bvh,o,d);
  return h ? {...h,point:t.toWorldPoint(h.point),normal:t.toWorldDirection(h.normal)} : null;
 }
 // External incident ray. Follow transmission through ALL actual subsequent faces.
 // TIR follows a reflected ray inside the same solid, bounded explicitly.
 trace(ray,{ior=1.5,absorption=[.006,.003,.002],pose={},maxInternalReflections=4}={}) {
  if(!(ior>=1)||absorption.some(x=>x<0))throw Error('Invalid optical parameters');
  const transform=this.poseTransform(pose);let origin=transform.toLocalPoint(ray.origin),direction=normalize(transform.toLocalDirection(ray.direction));
  const first=intersectBVH(this.bvh,origin,direction),interfaces=[];let pathMm=0,transmission=1,reflectionCount=0;
  const finish=status=>({status,ray:{origin:transform.toWorldPoint(origin),direction:transform.toWorldDirection(direction)},pathMm,transmittance:absorption.map(a=>transmission*Math.exp(-a*pathMm)),reflectance:1-transmission,interfaces,internalReflections:reflectionCount});
  if(!first)return finish('miss');
  if(dot(direction,first.normal)>=0)return finish('origin-inside-unsupported');
  const record=(h,event,incident,outgoing,n1,n2)=>interfaces.push({...h,point:transform.toWorldPoint(h.point),normal:transform.toWorldDirection(h.normal),event,incident:transform.toWorldDirection(incident),outgoing:outgoing&&transform.toWorldDirection(outgoing),n1,n2});
  let outgoing=refract(direction,first.normal,1/ior);transmission*=1-fresnel(-dot(direction,first.normal),1,ior);record(first,'enter',direction,outgoing,1,ior);
  direction=outgoing;origin=add(first.point,scale(direction,EPS*4));
  for(let step=0;step<maxInternalReflections+2;step++){
   const h=intersectBVH(this.bvh,origin,direction);if(!h)return finish('open-path');
   pathMm+=h.t+EPS*4;
   if(dot(direction,h.normal)<=0){record(h,'invalid-orientation',direction,null,ior,1);return finish('invalid-orientation');}
   outgoing=refract(direction,scale(h.normal,-1),ior);
   if(outgoing){transmission*=1-fresnel(dot(direction,h.normal),ior,1);record(h,'exit',direction,outgoing,ior,1);direction=outgoing;origin=add(h.point,scale(direction,EPS*4));return finish('transmitted');}
   if(reflectionCount>=maxInternalReflections){record(h,'reflection-limit',direction,null,ior,1);origin=h.point;return finish('reflection-limit');}
   outgoing=reflect(direction,h.normal);record(h,'tir',direction,outgoing,ior,1);reflectionCount++;
   direction=outgoing;origin=add(h.point,scale(direction,EPS*4));
  }
  return finish('reflection-limit');
 }
}
