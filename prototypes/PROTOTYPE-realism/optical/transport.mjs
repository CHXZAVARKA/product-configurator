import {makeChip, transformVertices} from '../geometry.mjs';
export const FIXED_BASE='0d51e61579e1a49aff5c4811ab2ce1b48c712ed6';
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const unit=a=>scale(a,1/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function quaternion(axis,angle){return [...scale(unit(axis),Math.sin(angle/2)),Math.cos(angle/2)];}
export const FROZEN_POSES=Object.freeze([{positionMm:[-1,0,5.8],rotation:quaternion([1,.7,.2],.42)},{positionMm:[1,.2,1],rotation:quaternion([.3,1,.2],-.36)}]);
export function solidFromChip(chip,pose,absorption=[.07,.012,.022],ior=1.5){
 const vertices=transformVertices(chip,pose),planes=[];
 for(let i=0;i<chip.indices.length;i+=3){const [a,b,c]=chip.indices.slice(i,i+3).map(j=>vertices[j]),normal=unit(cross(add(b,scale(a,-1)),add(c,scale(a,-1)))),offset=dot(normal,a);
 if(!planes.some(p=>Math.abs(p.offset-offset)<1e-6&&dot(p.normal,normal)>.999999))planes.push({normal,offset});}
 return {id:chip.id,vertices,indices:chip.indices,planes,absorption,ior,pose:structuredClone(pose)};
}
export function frozenScene(count=2,{thicknessScale=1}={}){if(count<1||count>2)throw Error('Frozen fixture has one or two shards');return Array.from({length:count},(_,i)=>{const chip=makeChip(i),scaled={...chip,vertices:chip.vertices.map(([x,y,z])=>[x,y,z*thicknessScale]),thicknessMm:chip.thicknessMm*thicknessScale};return solidFromChip(scaled,FROZEN_POSES[i],i?[.012,.065,.025]:[.075,.012,.018]);});}
export function intersectSolid(origin,direction,solid){let enter=-Infinity,exit=Infinity,entryNormal,exitNormal;
 for(const {normal,offset} of solid.planes){const d=dot(normal,direction),v=offset-dot(normal,origin);if(Math.abs(d)<1e-10){if(v<0)return null;continue;}const t=v/d;if(d<0){if(t>enter){enter=t;entryNormal=normal;}}else if(t<exit){exit=t;exitNormal=normal;}}
 if(enter>exit||exit<1e-5)return null;return enter>1e-5?{t:enter,normal:entryNormal,entering:true}:{t:exit,normal:exitNormal,entering:false};}
export function refract(direction,outward,etaFrom,etaTo){const n=dot(direction,outward)<0?outward:scale(outward,-1),cos=-dot(n,direction),eta=etaFrom/etaTo,k=1-eta*eta*(1-cos*cos);return k<0?null:unit(add(scale(direction,eta),scale(n,eta*cos-Math.sqrt(k))));}
export function fresnel(direction,normal,from,to){const c=Math.abs(dot(direction,normal)),sin2=(from/to)**2*(1-c*c);if(sin2>=1)return 1;const ct=Math.sqrt(1-sin2),rs=(from*c-to*ct)/(from*c+to*ct),rp=(to*c-from*ct)/(to*c+from*ct);return (rs*rs+rp*rp)/2;}
export const beer=(absorption,length)=>absorption.map(a=>Math.exp(-a*length));
export function background(point){const [x,y]=point,grid=Math.min(Math.abs(x-Math.round(x)),Math.abs(y-Math.round(y)));if(grid<.045)return [.06,.09,.14];if(Math.abs(x)<.055||Math.abs(y)<.055)return [.15,.25,.65];return ((Math.floor(x/2)+Math.floor(y/2))%2===0)?[1,.97,.88]:[.83,.87,.92];}
export function nearestInterface(o,d,scene){let result;for(let index=0;index<scene.length;index++){const h=intersectSolid(o,d,scene[index]);if(h&&(!result||h.t<result.t))result={...h,index};}return result;}
export function transmittedRay(origin,direction,scene,{backgroundZ=-18,maxInterfaces=16}={}){let o=[...origin],d=unit(direction),inside=scene.findIndex(s=>s.planes.every(p=>dot(p.normal,origin)<p.offset-1e-6)),weight=[1,1,1],lengths=scene.map(()=>0),interfaces=0;
 for(let bounce=0;bounce<maxInterfaces;bounce++){const hit=nearestInterface(o,d,scene),tb=(backgroundZ-o[2])/d[2];if(!hit||(tb>0&&tb<hit.t)){if(tb>0&&Number.isFinite(tb))return {point:add(o,scale(d,tb)),ray:{origin:o,direction:d},weight,lengths,interfaces};return {point:null,ray:{origin:o,direction:d},weight,lengths,interfaces,status:'environment'};}
 if(inside>=0){lengths[inside]+=hit.t;const a=beer(scene[inside].absorption,hit.t);weight=weight.map((v,i)=>v*a[i]);}
 const s=scene[hit.index],from=inside<0?1:scene[inside].ior,to=hit.entering?s.ior:1,F=fresnel(d,hit.normal,from,to),next=refract(d,hit.normal,from,to);const point=add(o,scale(d,hit.t));if(!next){d=unit(add(d,scale(hit.normal,-2*dot(d,hit.normal))));o=add(point,scale(d,1e-4));interfaces++;continue;}weight=weight.map(v=>v*(1-F));inside=hit.entering?hit.index:-1;d=next;o=add(point,scale(d,1e-4));
 interfaces++;
 }
 return {point:null,weight:[0,0,0],lengths,interfaces};}
// Monte Carlo delta-dielectric path sampling, luminous calibrated grid + broad environment lamps.
// Russian roulette on Fresnel chooses real reflected paths; max depth is a convergence limit.
export function traceSample(origin,direction,scene,random=Math.random,maxDepth=24,backgroundZ=-18){let o=[...origin],d=unit(direction),inside=scene.findIndex(s=>s.planes.every(p=>dot(p.normal,origin)<p.offset-1e-6)),weight=[1,1,1];
 for(let b=0;b<maxDepth;b++){const h=nearestInterface(o,d,scene),tb=(backgroundZ-o[2])/d[2];
 if(!h||(tb>0&&tb<h.t)){let light;if(tb>0&&Number.isFinite(tb))light=background(add(o,scale(d,tb)));else {const lamp=dot(d,unit([-.4,.5,-1]));light=lamp>.94?[3,2.9,2.7]:[.14,.18,.24];}return weight.map((v,i)=>v*light[i]);}
 if(inside>=0){const a=beer(scene[inside].absorption,h.t);weight=weight.map((v,i)=>v*a[i]);}
 const s=scene[h.index],from=inside<0?1:scene[inside].ior,to=h.entering?s.ior:1,F=fresnel(d,h.normal,from,to),point=add(o,scale(d,h.t));
 if(random()<F)d=unit(add(d,scale(h.normal,-2*dot(d,h.normal))));else{d=refract(d,h.normal,from,to);inside=h.entering?h.index:-1;}
 o=add(point,scale(d,1e-4));
 }return [0,0,0];
}
export function seededRandom(seed=1){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function cameraRay(x,y,width,height,jitter=[.5,.5],angle=0){const dir=unit([Math.sin(angle),0,-Math.cos(angle)]);return {origin:[((x+jitter[0])/width-.5)*16, (.5-(y+jitter[1])/height)*16*height/width,18],direction:dir};}
