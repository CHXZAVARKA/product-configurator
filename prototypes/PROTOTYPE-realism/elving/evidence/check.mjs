import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {CADOpticalSolid,BASE_SHA,add,sub,scale,dot,cross,normalize,refract,fresnel} from '../cad-solid.mjs';
import {viewingRay,planePoint,renderFrame,CADRayFieldCache} from '../render.mjs';
const cad=JSON.parse(readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url))).elving;
const solid=new CADOpticalSolid(cad),checks=[],controls=[];
const near=(actual,expected,tolerance=1e-6)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} ≠ ${expected}`);
const vectorNear=(a,b,tolerance=1e-6)=>a.forEach((v,i)=>near(v,b[i],tolerance));
const check=(name,fn)=>{const result=fn();checks.push({name,passed:true,...result});};
// Independent exhaustive plane/barycentric oracle, no BVH and no Möller-Trumbore.
function exhaustiveHit(ray) {
 let best=null;const d=normalize(ray.direction);
 for(const t of solid.triangles){
  const denominator=dot(t.normal,d);if(Math.abs(denominator)<1e-10)continue;
  const distance=dot(t.normal,sub(t.a,ray.origin))/denominator;if(distance<=1e-5||(best&&distance>=best.t))continue;
  const p=add(ray.origin,scale(d,distance)),v=sub(p,t.a),aa=dot(t.e1,t.e1),bb=dot(t.e2,t.e2),ab=dot(t.e1,t.e2),va=dot(v,t.e1),vb=dot(v,t.e2),det=aa*bb-ab*ab;
  const u=(bb*va-ab*vb)/det,w=(aa*vb-ab*va)/det;
  if(u>=-1e-7&&w>=-1e-7&&u+w<=1+1e-7)best={t:distance,point:p,normal:t.normal,triangle:t.id};
 }
 return best;
}
check('actual-STEP-provenance-closed-outward-solid',()=>{
 assert.equal(solid.audit.triangles,20932);assert.equal(solid.audit.vertices,10468);
 near(solid.audit.signedVolumeMm3,16478.45405733847,.003);
 vectorNear(solid.bounds.min,[-20.779303199766357,-20.7499992102385,-17.653710126876838],.00001);
 vectorNear(solid.bounds.max,[20.913192146303103,20.7499992102385,-.5],.00001);
 assert.equal(solid.audit.nonManifoldEdges,0);assert.equal(solid.audit.inconsistentEdges,0);
 return {audit:solid.audit,STEPVolumeMm3:16478.45405733847,exportVolumeErrorMm3:solid.audit.signedVolumeMm3-16478.45405733847};
});
check('both-directions-BVH-matches-exhaustive-actual-triangles',()=>{
 let rays=0;for(const sign of [-1,1])for(let i=0;i<32;i++){
  const ray={origin:[Math.sin(i*1.83)*24+.131,Math.cos(i*.91)*24+.317,sign*45],direction:normalize([Math.sin(i*.7)*.11,Math.cos(i*.3)*.05,-sign])};
  const b=solid.intersect(ray),r=exhaustiveHit(ray);assert.equal(!!b,!!r);if(b){near(b.t,r.t,1e-7);vectorNear(b.point,r.point,1e-7);vectorNear(b.normal,r.normal,1e-6);}rays++;
 }return {rays};
});
check('IOR-one-identity-through-both-real-interfaces-and-local-thickness',()=>{
 let rays=0,min=Infinity,max=0,flatTop=0,bevelTop=0;for(let y=-17;y<=17;y+=2)for(let x=-17;x<=17;x+=2){
  if(Math.hypot(x,y)>18)continue;const ray=viewingRay(x+.037,y+.071),t=solid.trace(ray,{ior:1,absorption:[0,0,0]});
  assert.equal(t.status,'transmitted');assert.equal(t.interfaces.length,2);vectorNear(t.ray.direction,ray.direction);vectorNear(planePoint(t.ray),planePoint(ray));vectorNear(t.transmittance,[1,1,1]);near(t.reflectance,0);
  const exit=t.interfaces[1];assert(exit.point[2]<=-.5+1e-6);if(Math.abs(exit.point[2]+.5)<1e-6){vectorNear(exit.normal,[0,0,1]);flatTop++;}else bevelTop++;
  near(t.pathMm,Math.hypot(...sub(exit.point,t.interfaces[0].point)),1e-8);
  min=Math.min(min,t.pathMm);max=Math.max(max,t.pathMm);rays++;
 }assert(max-min>.5,'Actual CAD thickness must vary');assert(flatTop>0&&bevelTop>0);return {rays,flatTop,bevelTop,thicknessMm:{min,max}};
});
check('Snell-Beer-Fresnel-reciprocity-rotation-and-real-grid-displacement',()=>{
 let rays=0,reciprocal=0,displaced=0,interfaceCount=0,maxDisplacement=0;const outcomes={};
 for(const rotationDeg of [0,17])for(let y=-15;y<=15;y+=3)for(let x=-15;x<=15;x+=3){
  const ray=viewingRay(x+.137,y+.231,rotationDeg?11:0),options={pose:{rotationDeg:[0,rotationDeg,0]}},t=solid.trace(ray,options);outcomes[t.status]=(outcomes[t.status]||0)+1;rays++;
  assert(!['open-path','invalid-orientation','origin-inside-unsupported'].includes(t.status));assert(t.internalReflections<=4);
  if(t.status!=='transmitted')continue;
  const end=planePoint(t.ray),direct=planePoint(ray);if(end&&direct){const distance=Math.hypot(...sub(end,direct));maxDisplacement=Math.max(maxDisplacement,distance);if(distance>.05)displaced++;}
  let throughput=1;
  for(const h of t.interfaces){
   assert(dot(h.incident,h.normal)*(h.event==='enter'?-1:1)>0);
   near(Math.hypot(...h.normal),1);near(Math.hypot(...h.incident),1);
   if(h.event==='tir'){assert.equal(refract(h.incident,scale(h.normal,-1),1.5),null);continue;}
   const sinIn=Math.hypot(...cross(h.incident,h.normal)),sinOut=Math.hypot(...cross(h.outgoing,h.normal));near(h.n1*sinIn,h.n2*sinOut,1e-6);interfaceCount++;
   throughput*=1-fresnel(Math.abs(dot(h.incident,h.normal)),h.n1,h.n2);
  }
  t.transmittance.forEach((v,i)=>near(v,throughput*Math.exp(-[.006,.003,.002][i]*t.pathMm)));
  const reverse=solid.trace({origin:add(t.ray.origin,scale(t.ray.direction,8)),direction:scale(t.ray.direction,-1)},options);
  assert.equal(reverse.status,'transmitted');vectorNear(reverse.ray.direction,scale(ray.direction,-1),1e-6);vectorNear(reverse.interfaces.at(-1).point,t.interfaces[0].point,2e-5);near(reverse.pathMm,t.pathMm,2e-5);reciprocal++;
  if(controls.length<6&&Math.abs(x)<4&&Math.abs(y)<4)controls.push({rotationDeg,inputRay:ray,forward:t,reverse});
 }
 assert(displaced>100);assert(maxDisplacement>2);return {rays,reciprocal,displaced,interfaceCount,maxBackgroundDisplacementMm:maxDisplacement,outcomes};
});
check('critical-angle-and-energy',()=>{
 near(fresnel(1,1,1.5),.04);near(fresnel(1,1.5,1),.04);
 assert.equal(refract(normalize([.8,0,.6]),[0,0,-1],1.5),null);near(fresnel(.6,1.5,1),1);
 return {normalReflectance:.04,criticalAngleDeg:Math.asin(1/1.5)*180/Math.PI};
});
check('actual-CAD-TIR-ray-reciprocity-and-explicit-reflection-budget',()=>{
 const ray=viewingRay(-5.863,-19.769),t=solid.trace(ray);assert.equal(t.status,'transmitted');assert.equal(t.internalReflections,3);
 for(const h of t.interfaces.filter(h=>h.event==='tir')){assert.equal(refract(h.incident,scale(h.normal,-1),1.5),null);near(fresnel(dot(h.incident,h.normal),1.5,1),1);}
 const reverse=solid.trace({origin:add(t.ray.origin,scale(t.ray.direction,8)),direction:scale(t.ray.direction,-1)});assert.equal(reverse.status,'transmitted');assert.equal(reverse.internalReflections,3);vectorNear(reverse.interfaces.at(-1).point,t.interfaces[0].point,2e-5);near(reverse.pathMm,t.pathMm,2e-5);
 const limit=solid.trace(viewingRay(3.137,-19.269));assert.equal(limit.status,'reflection-limit');assert.equal(limit.internalReflections,4);assert.equal(limit.interfaces.at(-1).event,'reflection-limit');
 controls.push({TIRRay:ray,forward:t,reverse,reflectionLimit:limit});return {TIRReflections:t.internalReflections,pathMm:t.pathMm,reflectionLimit:limit.internalReflections};
});
check('deterministic-frame-light-and-view-response-no-autonomous-flow',()=>{
 const sample=(x,y)=>[Math.floor(x/2)%2===0?.8:.2,Math.floor(y/2)%2===0?.7:.1,.4];
 const a=renderFrame(solid,sample,{size:64}),b=renderFrame(solid,sample,{size:64}),light=renderFrame(solid,sample,{size:64,lightDeg:55}),view=renderFrame(solid,sample,{size:64,viewDeg:15});
 assert.deepEqual(a.pixels,b.pixels);assert.notDeepEqual(a.pixels,light.pixels);assert.notDeepEqual(a.pixels,view.pixels);assert(a.stats.geometryBuilt);assert(!b.stats.geometryBuilt);assert(!light.stats.geometryBuilt);assert(view.stats.geometryBuilt);
 return {pixels:a.pixels.length/4,staticIdentical:true,lightChanged:true,viewChanged:true,status:a.stats.status};
});
check('packed-ray-field-reuse-camera-invalidation-and-direct-CAD-agreement',()=>{
 const cache=new CADRayFieldCache(solid),field=cache.get({size:32}),same=cache.get({size:32});assert.strictEqual(same,field);assert.equal(cache.builds,1);
 for(const i of [512,527,750]){
  const x=i%32,y=Math.floor(i/32),direct=solid.trace(viewingRay(((x+.5)/32*2-1)*22,(1-(y+.5)/32*2)*22));assert.equal(field.statusAt(i),direct.status);vectorNear(field.rayAt(i).origin,direct.ray.origin,4e-6);vectorNear(field.rayAt(i).direction,direct.ray.direction,1e-7);vectorNear(field.weightAt(i),direct.transmittance,1e-7);
 }
 const changed=cache.get({size:32,viewDeg:7});assert.notStrictEqual(changed,field);assert.equal(cache.builds,2);
 const custom=cache.get({size:8,rayKey:'eye-pose-fixed',rayForPixel:(x,y)=>viewingRay(x-.1,y-.2)});assert.equal(custom.rayKey,'eye-pose-fixed');assert.equal(cache.fields.size,2);
 assert.throws(()=>cache.get({rayForPixel:()=>viewingRay(0,0)}),/rayKey/);
 const noAbsorption=field.weightAt(527,[0,0,0]),absorbed=field.weightAt(527,[.06,.03,.02]);assert(absorbed[0]<noAbsorption[0]);assert.equal(cache.builds,3);
 return {builds:cache.builds,capacity:cache.fields.size,packedPixels:field.statuses.length,geometryMilliseconds:field.geometryMilliseconds,reuseReturnsIdenticalObject:true};
});
const result={baseSHA:BASE_SHA,generated:new Date().toISOString(),passed:true,checks,controlRays:controls};
writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,controlRays:`${controls.length} full reversible rays saved`},null,2));
