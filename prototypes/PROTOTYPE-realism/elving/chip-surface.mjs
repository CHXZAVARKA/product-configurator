// The solver keeps its convex low-poly hull. This independently generated skin
// rounds contacts and adds shallow fracture relief inside that exact envelope.
const SUBDIVISIONS = 3;
const MAX_DEVIATION_MM = .12;
const sub = (a,b) => a.map((v,k)=>v-b[k]);
const dot = (a,b) => a.reduce((s,v,k)=>s+v*b[k],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix = (a,b,t) => a.map((v,k)=>v+(b[k]-v)*t);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const smooth = v => { const t=clamp(v,0,1);return t*t*(3-2*t); };

function hashChip(chip) {
 let hash=2166136261;
 const text=JSON.stringify([chip.id,chip.vertices,chip.indices,chip.thicknessMm]);
 for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 return hash>>>0;
}
function randomFrom(seed) {
 let n=seed;
 return ()=>{n+=0x6d2b79f5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
}

function hullPlanes(chip) {
 const planes=[];
 for(let i=0;i<chip.indices.length;i+=3) {
  const [a,b,c]=chip.indices.slice(i,i+3).map(j=>chip.vertices[j]);
  const raw=cross(sub(b,a),sub(c,a)),length=Math.hypot(...raw);
  if(length<1e-10)throw Error('Chip collider contains a degenerate triangle');
  const normal=raw.map(v=>v/length),offset=dot(normal,a);
  if(!planes.some(p=>dot(p.normal,normal)>1-1e-9&&Math.abs(p.offset-offset)<1e-8))planes.push({normal,offset});
 }
 return planes;
}

export function buildChipSurface(chip) {
 const seed=hashChip(chip),random=randomFrom(seed),planes=hullPlanes(chip);
 const center=[0,1,2].map(k=>chip.vertices.reduce((s,v)=>s+v[k],0)/chip.vertices.length);
 let vertices=chip.vertices.map(v=>[...v]),indices=[...chip.indices];
 // Shared midpoints preserve a closed indexed surface across original hull seams.
 for(let level=0;level<SUBDIVISIONS;level++) {
  const midpoints=new Map(),next=[];
  const midpoint=(a,b)=>{const key=a<b?`${a}:${b}`:`${b}:${a}`;if(!midpoints.has(key)){midpoints.set(key,vertices.length);vertices.push(mix(vertices[a],vertices[b],.5));}return midpoints.get(key);};
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
  indices=next;
 }
 const reference=vertices.map(v=>[...v]),neighbors=vertices.map(()=>new Set());
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3);neighbors[a].add(b).add(c);neighbors[b].add(a).add(c);neighbors[c].add(a).add(b);}
 const phase=Array.from({length:6},()=>random()*Math.PI*2);
 const waveScale=.85+random()*.6,wearScale=.8+random()*.4;
 const fractures=Array.from({length:9},()=>({x:(random()-.5)*4.1,y:(random()-.5)*4.1,radius:.28+random()*.63,depth:.014+random()*.027,aspect:.55+random()*.65,angle:random()*Math.PI*2,face:random()<.5?-1:1}));
 let maxDeviationMm=0,sumDeviationMm=0,maxOutsideHullMm=0,minTriangleAreaMm2=Infinity,minOutwardDot=Infinity;
 vertices=reference.map((original,index)=>{
  const distances=planes.map(p=>p.offset-dot(p.normal,original)).sort((a,b)=>a-b);
  const edgeWeight=smooth(1-distances[1]/.20);
  const adjacent=[...neighbors[index]],average=[0,1,2].map(k=>adjacent.reduce((s,j)=>s+reference[j][k],0)/adjacent.length);
  let rounded=mix(original,average,.34*edgeWeight*wearScale);
  const roundLength=Math.hypot(...sub(rounded,original));
  if(roundLength>.065)rounded=mix(original,rounded,.065/roundLength);
  const [x,y,z]=original,face=z>=center[2]?1:-1;
  const broadFace=smooth((Math.abs(z-center[2])/(chip.thicknessMm/2)-.24)/.65);
  // Incommensurate waves and rotated, asymmetric pits avoid a visible subdivision grid.
  const waves=(Math.sin(x*2.7*waveScale+y*.83+phase[0])+Math.sin(y*3.6*waveScale-x*1.19+phase[1])+Math.sin(x*5.2-y*4.1+phase[2])*.35)/2.35;
  let relief=.022+.012*(waves+1)/2;
  for(const fracture of fractures)if(fracture.face===face){const dx=x-fracture.x,dy=y-fracture.y,c=Math.cos(fracture.angle),s=Math.sin(fracture.angle),u=(dx*c+dy*s)/fracture.radius,v=(-dx*s+dy*c)/(fracture.radius*fracture.aspect);relief+=fracture.depth*Math.exp(-(u*u+v*v)*1.8)*(1+.17*Math.sin(u*4+phase[3]));}
  const edgeRelief=.018+.009*(1+Math.sin(x*4.8+y*5.7+z*3.1+phase[4]))/2;
  const inwardMm=edgeRelief*(1-broadFace)+relief*broadFace;
  const inward=sub(center,rounded),inwardLength=Math.hypot(...inward);
  let result=mix(rounded,center,inwardMm/inwardLength);
  const deviation=Math.hypot(...sub(result,original));
  if(deviation>MAX_DEVIATION_MM)result=mix(original,result,MAX_DEVIATION_MM/deviation);
  const actualDeviation=Math.hypot(...sub(result,original));
  maxDeviationMm=Math.max(maxDeviationMm,actualDeviation);sumDeviationMm+=actualDeviation;
  for(const plane of planes)maxOutsideHullMm=Math.max(maxOutsideHullMm,dot(plane.normal,result)-plane.offset);
  return result;
 });
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(j=>vertices[j]),normal=cross(sub(b,a),sub(c,a)),triangleCenter=a.map((v,k)=>(v+b[k]+c[k])/3);minTriangleAreaMm2=Math.min(minTriangleAreaMm2,Math.hypot(...normal)/2);minOutwardDot=Math.min(minOutwardDot,dot(normal,sub(triangleCenter,center)));}
 return {
  vertices,indices,
  audit:{seed,subdivisions:SUBDIVISIONS,sourceVertices:chip.vertices.length,sourceTriangles:chip.indices.length/3,visualVertices:vertices.length,visualTriangles:indices.length/3,triangleRatio:indices.length/chip.indices.length,maxDeviationMm,meanDeviationMm:sumDeviationMm/vertices.length,deviationLimitMm:MAX_DEVIATION_MM,maxOutsideHullMm,minTriangleAreaMm2,minOutwardDot,fractureCount:fractures.length,colliderUnchanged:true,method:'Shared indexed subdivision, local convex-combination edge rounding, coordinate-seeded shallow fracture pits and waves; inward displacement capped at 0.12 mm.'},
  materialVariation:{roughness:.13+random()*.13,bumpScale:.022+random()*.025,tintScale:.88+random()*.24}
 };
}
