import {add,sub,scale,dot,normalize,reflect} from './cad-solid.mjs';
export const BACKGROUND_Z_MM=28;
export function viewingRay(x,y,viewDeg=0) {
 const angle=viewDeg*Math.PI/180,direction=[Math.sin(angle),0,Math.cos(angle)],right=[Math.cos(angle),0,-Math.sin(angle)];
 const target=add([-0,0,-9.076855],add(scale(right,-x),[0,y,0]));
 return {origin:sub(target,scale(direction,48)),direction};
}
export const RAY_STATUS=Object.freeze({miss:0,transmitted:1,'reflection-limit':2,'open-path':3,'invalid-orientation':4,'origin-inside-unsupported':5});
const STATUS_NAME=Object.fromEntries(Object.entries(RAY_STATUS).map(([name,id])=>[id,name]));
// Packed, cacheable eye -> CAD exit rays. Light, image and Beer absorption are
// deliberately absent from the key: moving shards consume the same exit field.
export class CADRayFieldCache {
 constructor(solid,{capacity=2}={}){this.solid=solid;this.capacity=capacity;this.fields=new Map();this.builds=0;}
 get({size=256,halfSizeMm=22,viewDeg=0,pose={},ior=1.5,maxInternalReflections=4,rayForPixel=null,rayKey=null}={}) {
  if(rayForPixel&&!(typeof rayKey==='string'&&rayKey.length))throw Error('Custom rays require a stable rayKey that changes with the camera');
  const canonical={size,halfSizeMm,viewDeg,pose:{rotationDeg:pose.rotationDeg||[0,0,0],translationMm:pose.translationMm||[0,0,0]},ior,maxInternalReflections,rayKey:rayForPixel?rayKey:null},key=JSON.stringify(canonical);
  if(this.fields.has(key)){const field=this.fields.get(key);this.fields.delete(key);this.fields.set(key,field);return field;}
  if(!Number.isInteger(size)||size<1||size>2048||halfSizeMm<=0)throw Error('Invalid ray field size');
  const start=performance.now(),count=size*size,origins=new Float32Array(count*3),directions=new Float32Array(count*3),fresnelWeights=new Float32Array(count),pathsMm=new Float32Array(count),firstNormals=new Float32Array(count*3),firstIncidents=new Float32Array(count*3),statuses=new Uint8Array(count),statusCounts={},controls=[];
  let pathSum=0,transmitted=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const index=y*size+x,ray=rayForPixel?rayForPixel(x,y,size):viewingRay(((x+.5)/size*2-1)*halfSizeMm,(1-(y+.5)/size*2)*halfSizeMm,viewDeg),t=this.solid.trace(ray,{pose:canonical.pose,ior,maxInternalReflections,absorption:[0,0,0]});
   origins.set(t.ray.origin,index*3);directions.set(t.ray.direction,index*3);fresnelWeights[index]=t.transmittance[0];pathsMm[index]=t.pathMm;statuses[index]=RAY_STATUS[t.status];statusCounts[t.status]=(statusCounts[t.status]||0)+1;
   if(t.interfaces.length){firstNormals.set(t.interfaces[0].normal,index*3);firstIncidents.set(t.interfaces[0].incident,index*3);}
   if(t.status==='transmitted'){pathSum+=t.pathMm;transmitted++;}
   if((x===size>>1&&y===size>>1)||(x===size>>2&&y===size>>1))controls.push(t);
  }
  const field={key,...canonical,origins,directions,fresnelWeights,pathsMm,firstNormals,firstIncidents,statuses,statusCounts,meanPathMm:transmitted?pathSum/transmitted:0,geometryMilliseconds:performance.now()-start,controls,
   rayAt:index=>({origin:Array.from(origins.subarray(index*3,index*3+3)),direction:Array.from(directions.subarray(index*3,index*3+3))}),
   weightAt:(index,absorption=[.006,.003,.002])=>absorption.map(a=>fresnelWeights[index]*Math.exp(-a*pathsMm[index])),
   statusAt:index=>STATUS_NAME[statuses[index]]};
  this.fields.set(key,field);this.builds++;while(this.fields.size>this.capacity)this.fields.delete(this.fields.keys().next().value);return field;
 }
 clear(){this.fields.clear();}
}
const fieldCaches=new WeakMap();
export function rayFieldCacheFor(solid){if(!fieldCaches.has(solid))fieldCaches.set(solid,new CADRayFieldCache(solid));return fieldCaches.get(solid);}
export function planePoint(ray,z=BACKGROUND_Z_MM) {
 const t=(z-ray.origin[2])/ray.direction[2];
 return t>0 ? add(ray.origin,scale(ray.direction,t)) : null;
}
// A fixed emitting grid plane plus a controllable front environment lamp.
// Environment reflection is local, no multi-bounce caustic illumination solver.
export function shadeTransmission(trace,sample,{lightDeg=0,intensity=1}={}) {
 const p=planePoint(trace.ray),base=p?sample(p[0],p[1]):[.09,.12,.16];
 if(trace.status==='miss')return base.map(v=>v*intensity);
 if(trace.status!=='transmitted')return [.025,.032,.042];
 const a=lightDeg*Math.PI/180,lamp=normalize([Math.sin(a),.3,-Math.cos(a)]),first=trace.interfaces[0];
 const reflected=reflect(first.incident,first.normal),alignment=Math.max(0,dot(reflected,lamp));
 const environment=.11+.95*Math.pow(alignment,45);
 // Single local specular approximation. Transmission itself follows exact mesh faces.
 return base.map((v,i)=>v*trace.transmittance[i]*intensity+trace.reflectance*environment*intensity);
}
export function renderFrame(solid,sample,{size=256,enabled=true,rotationDeg=0,viewDeg=0,lightDeg=0,intensity=1,absorption=[.006,.003,.002]}={}) {
 const start=performance.now(),pixels=new Uint8Array(size*size*4),status={},traces=[];
 const half=22,pose={rotationDeg:[0,rotationDeg,0]},cache=rayFieldCacheFor(solid),buildsBefore=cache.builds,field=enabled?cache.get({size,viewDeg,pose}):null;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const sx=((x+.5)/size*2-1)*half,sy=(1-(y+.5)/size*2)*half,ray=viewingRay(sx,sy,viewDeg);
  const index=y*size+x,trace=enabled?{status:field.statusAt(index),ray:field.rayAt(index),pathMm:field.pathsMm[index],transmittance:field.weightAt(index,absorption),reflectance:1-field.fresnelWeights[index],interfaces:[{incident:Array.from(field.firstIncidents.subarray(index*3,index*3+3)),normal:Array.from(field.firstNormals.subarray(index*3,index*3+3))}]}:{status:'miss',ray,pathMm:0,transmittance:[1,1,1],interfaces:[]};
  status[trace.status]=(status[trace.status]||0)+1;
  if(!enabled&&((x===size>>1&&y===size>>1)||(x===size>>2&&y===size>>1)))traces.push(trace);
  const color=shadeTransmission(trace,sample,{lightDeg,intensity}),i=(y*size+x)*4;
  for(let c=0;c<3;c++)pixels[i+c]=Math.round(Math.min(1,Math.max(0,color[c]))**(1/2.2)*255);
  pixels[i+3]=255;
 }
 const geometricTraces=field?field.controls.map(t=>({...t,transmittance:t.transmittance.map((v,i)=>v*Math.exp(-absorption[i]*t.pathMm))})):traces;
 return {pixels,size,stats:{milliseconds:performance.now()-start,status,meanPathMm:field?.meanPathMm||0,traces:geometricTraces,geometryBuilt:cache.builds!==buildsBefore,geometryMilliseconds:field?.geometryMilliseconds||0,cacheBuilds:cache.builds}};
}
