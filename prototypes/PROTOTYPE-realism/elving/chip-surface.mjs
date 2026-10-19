// The skin is a positive radial graph over the unchanged convex collider.
// Shared indices close every seam. Positive radial factors preserve each
// triangle's angular projection and outward determinant, preventing crossings.
const MAX_DEVIATION_MM=.55;
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>v.map(x=>x/Math.hypot(...v));
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
function hashChip(chip) {let hash=2166136261;const text=JSON.stringify([chip.id,chip.vertices,chip.indices,chip.thicknessMm]);for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return hash>>>0;}
function randomFrom(seed) {let n=seed;return()=>{n+=0x6d2b79f5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
function hullPlanes(chip) {
 const planes=[];
 for(let i=0;i<chip.indices.length;i+=3) {
  const ids=chip.indices.slice(i,i+3),[a,b,c]=ids.map(j=>chip.vertices[j]),raw=cross(sub(b,a),sub(c,a)),length=Math.hypot(...raw);
  if(length<1e-10)throw Error('Chip collider contains a degenerate triangle');
  const normal=raw.map(v=>v/length),offset=dot(normal,a);
  let plane=planes.find(p=>dot(p.normal,normal)>1-1e-9&&Math.abs(p.offset-offset)<1e-8);
  if(!plane){plane={normal,offset,ids:new Set(),area:0};planes.push(plane);}
  ids.forEach(j=>plane.ids.add(j));plane.area+=length/2;
 }
 return planes;
}
export function buildChipSurface(chip,options={}) {
 const depth=clamp(options.depth??.75),edgeChips=clamp(options.edgeChips??.6),detail=clamp(options.detail??.4);
 const seed=hashChip(chip),random=randomFrom(seed),planes=hullPlanes(chip);
 const center=[0,1,2].map(k=>chip.vertices.reduce((s,v)=>s+v[k],0)/chip.vertices.length);
 const scale=chip.thicknessMm/2.10;
 const subdivisions=chip.photoDiameterMm?3:chip.indices.length/3<16?4:3;
 let vertices=chip.vertices.map(v=>[...v]),indices=[...chip.indices];
 for(let level=0;level<subdivisions;level++) {
  const midpoints=new Map(),next=[];
  const midpoint=(a,b)=>{const key=a<b?`${a}:${b}`:`${b}:${a}`;if(!midpoints.has(key)){midpoints.set(key,vertices.length);vertices.push(mix(vertices[a],vertices[b],.5));}return midpoints.get(key);};
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}indices=next;
 }
 const reference=vertices.map(v=>[...v]);
 const fractureCount=2+Math.floor(random()*3);
 const candidates=planes.map(p=>({...p,score:p.area*(.8+random()*.4)})).sort((a,b)=>b.score-a.score);
 const fractures=candidates.slice(0,fractureCount).map(p=>{
  const points=[...p.ids].map(i=>chip.vertices[i]),faceCenter=[0,1,2].map(k=>points.reduce((s,v)=>s+v[k],0)/points.length);
  const u=unit(cross(Math.abs(p.normal[2])<.8?[0,0,1]:[0,1,0],p.normal)),v=cross(p.normal,u);
  const extentU=Math.max(...points.map(q=>Math.abs(dot(sub(q,faceCenter),u)))),extentV=Math.max(...points.map(q=>Math.abs(dot(sub(q,faceCenter),v))));
  const origin=faceCenter.map((x,k)=>x+u[k]*extentU*(random()-.5)*.20+v[k]*extentV*(random()-.5)*.16);
  return {...p,origin,u,v,radiusU:extentU*(.92+random()*.22),radiusV:extentV*(1.0+random()*.24),amplitude:(.40+random()*.18)*scale,phase:random()*6.283,arcAngle:random()*6.283};
 });
 const scars=chip.photoDiameterMm?Array.from({length:5+Math.floor(random()*5)},()=>{
  const p=candidates[Math.floor(random()*Math.min(planes.length,8))],points=[...p.ids].map(i=>chip.vertices[i]);
  const faceCenter=[0,1,2].map(k=>points.reduce((sum,v)=>sum+v[k],0)/points.length);
  const u=unit(cross(Math.abs(p.normal[2])<.8?[0,0,1]:[0,1,0],p.normal)),v=cross(p.normal,u);
  const extent=Math.min(Math.max(...points.map(q=>Math.abs(dot(sub(q,faceCenter),u)))),Math.max(...points.map(q=>Math.abs(dot(sub(q,faceCenter),v)))));
  const origin=faceCenter.map((value,k)=>value+u[k]*extent*(random()-.5)*.8+v[k]*extent*(random()-.5)*.8);
  return {normal:p.normal,offset:p.offset,origin,u,v,radius:(.29+random()*.36)*scale,stretch:.55+random()*.75,amplitude:(.022+random()*.025)*scale};
 }):[];
 const cleavages=chip.photoDiameterMm?candidates.filter(p=>Math.abs(p.normal[2])>.5).slice(0,3).map(p=>{
  const points=[...p.ids].map(i=>chip.vertices[i]);
  const origin=[0,1,2].map(k=>points.reduce((sum,v)=>sum+v[k],0)/points.length);
  const angle=random()*Math.PI*2;
  const u=unit(cross(Math.abs(p.normal[2])<.8?[0,0,1]:[0,1,0],p.normal));
  const v=cross(p.normal,u),axis=u.map((x,k)=>x*Math.cos(angle)+v[k]*Math.sin(angle));
  const across=u.map((x,k)=>-x*Math.sin(angle)+v[k]*Math.cos(angle));
  const extent=Math.max(...points.map(q=>Math.hypot(...sub(q,origin))));
  return {normal:p.normal,offset:p.offset,origin,axis,across,length:extent*(.7+random()*.3),width:(.23+random()*.20)*scale,amplitude:(.19+random()*.13)*scale,bias:(random()-.5)*.3*scale};
 }):[];
 const edgeCandidates=[];
 const seen=new Set();
 for(let i=0;i<chip.indices.length;i+=3)for(let k=0;k<3;k++) {
  const a=chip.indices[i+k],b=chip.indices[i+(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
  if(seen.has(key))continue;seen.add(key);
  const p=mix(chip.vertices[a],chip.vertices[b],.25+random()*.5);
  const length=Math.hypot(...sub(chip.vertices[a],chip.vertices[b]));
  if(length>.8*scale&&planes.filter(q=>Math.abs(q.offset-dot(q.normal,p))<1e-7).length>=2)edgeCandidates.push({p,radius:(.44+random()*.23)*scale,amplitude:(chip.photoDiameterMm?.18+random()*.08:.13+random()*.07)*scale,score:random(),step:.45+random()*.20});
 }
 // A few local ledges cross actual hull edges. Their inner shelf is stepped,
 // while the outer ramp and untouched corners keep the radial skin stable.
 const edgeCenters=edgeCandidates.sort((a,b)=>b.score-a.score).slice(0,(chip.photoDiameterMm?5:2)+Math.floor(random()*3));
 let maxDeviationMm=0,sumDeviationMm=0,maxOutsideHullMm=0,minRadialFactor=1,minTriangleAreaMm2=Infinity,minOutwardDot=Infinity;
 vertices=reference.map((original,index)=>{
  if(index<chip.vertices.length)return [...original]; // Collider support anchors.
  const ray=sub(original,center),radius=Math.hypot(...ray);
  const nearestCorner=Math.min(...chip.vertices.map(v=>Math.hypot(...sub(v,original))));
  const pinWeight=smooth(nearestCorner/(.24*scale));
  let relief=0;
  for(const f of fractures) {
   const delta=sub(original,f.origin),u=dot(delta,f.u)/f.radiusU,v=dot(delta,f.v)/f.radiusV,r=Math.hypot(u,v);
   if(r>=1)continue;
   const faceWeight=smooth(1-(f.offset-dot(f.normal,original))/(.12*scale));
   const bowl=(1-r*r)**2;
   // Arrest arcs are weak, interrupted, and concentric with their own break.
   const angle=Math.atan2(v,u),arcWindow=smooth((Math.cos(angle-f.arcAngle)+.35)/.45);
   const arcs=.018*scale*detail*Math.sin(r*24+f.phase+.35*Math.sin(angle*3))*arcWindow*bowl;
   relief=Math.max(relief,Math.max(0,f.amplitude*depth*bowl+arcs)*faceWeight);
  }
  for(const s of scars){
   const delta=sub(original,s.origin),r=Math.hypot(dot(delta,s.u),dot(delta,s.v)/s.stretch)/s.radius;
   if(r<1){const faceWeight=smooth(1-(s.offset-dot(s.normal,original))/(.09*scale));relief+=s.amplitude*detail*(1-r)*faceWeight;}
  }
  for(const c of cleavages){
   const delta=sub(original,c.origin),along=Math.abs(dot(delta,c.axis))/c.length,across=(dot(delta,c.across)-c.bias)/c.width;
   if(along<1&&Math.abs(across)<1){
    const faceWeight=smooth(1-(c.offset-dot(c.normal,original))/(.10*scale));
    const edge=smooth(1-along),ridge=across<0?smooth(1+across):.45*smooth(1-across);
    relief=Math.max(relief,c.amplitude*depth*edge*ridge*faceWeight);
   }
  }
  for(const e of edgeCenters){const r=Math.hypot(...sub(original,e.p))/e.radius;if(r<1)relief+=e.amplitude*edgeChips*(.55*smooth((1-r)/.42)+.45*smooth((e.step-r)/.26));}
  const micro=.0015*scale*detail*(1+Math.sin(dot(original,[7.1,-4.3,5.7])/scale+seed%37));
  const inward=Math.min(MAX_DEVIATION_MM,.30*radius,(relief+micro)*pinWeight),factor=1-inward/radius;
  const result=center.map((v,k)=>v+ray[k]*factor);minRadialFactor=Math.min(minRadialFactor,factor);
  maxDeviationMm=Math.max(maxDeviationMm,inward);sumDeviationMm+=inward;
  for(const p of planes)maxOutsideHullMm=Math.max(maxOutsideHullMm,dot(p.normal,result)-p.offset);
  return result;
 });
 let maxColliderSupportGapMm=0;
 for(const p of planes)maxColliderSupportGapMm=Math.max(maxColliderSupportGapMm,p.offset-Math.max(...vertices.map(v=>dot(p.normal,v))));
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(j=>vertices[j]),normal=cross(sub(b,a),sub(c,a)),triangleCenter=a.map((v,k)=>(v+b[k]+c[k])/3);minTriangleAreaMm2=Math.min(minTriangleAreaMm2,Math.hypot(...normal)/2);minOutwardDot=Math.min(minOutwardDot,dot(normal,sub(triangleCenter,center)));}
 return {vertices,indices,audit:{seed,subdivisions,sourceVertices:chip.vertices.length,sourceTriangles:chip.indices.length/3,visualVertices:vertices.length,visualTriangles:indices.length/3,triangleRatio:indices.length/chip.indices.length,maxDeviationMm,meanDeviationMm:sumDeviationMm/vertices.length,deviationLimitMm:MAX_DEVIATION_MM,maxOutsideHullMm,maxColliderSupportGapMm,minTriangleAreaMm2,minOutwardDot,minRadialFactor,fractureCount,scarCount:scars.length,cleavageCount:cleavages.length,edgeChipCount:edgeCenters.length,depth,edgeChips,detail,colliderUnchanged:true,starShaped:true,method:'Independent face-local elliptical breaks, angled cleavage ridges, small scars and stepped edge chips; shared indexed topology with positive radial factors. Original hull corners remain support anchors. Conservative local displacement <=0.55 mm; zero face support gap.'},materialVariation:{roughness:.10+random()*.09+detail*.03,bumpScale:chip.photoDiameterMm ? .21+random()*.11 : .10+random()*.06,tintScale:.88+random()*.24}};
}
