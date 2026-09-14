import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildRealtimeGeometry } from '../realtime-glass.mjs';
import { CADOpticalSolid, cross, sub, dot, normalize } from '../cad-solid.mjs';
const cad = JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json', import.meta.url))).elving;
const packed = buildRealtimeGeometry(cad), reference = new CADOpticalSolid(cad);
function hit(o,d) {
  let best = Infinity, node = 0;
  const inv = d.map(x => 1/(Math.abs(x)<1e-20?1e-20:x));
  while (node < packed.audit.bvhNodes) {
    const n = node*8;
    let near = .0002, far = best;
    for (let k=0;k<3;k++) { const a=(packed.nodeData[n+k]-o[k])*inv[k],b=(packed.nodeData[n+4+k]-o[k])*inv[k]; near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b)); }
    if (near>far) {node=packed.nodeData[n+3];continue;}
    const first=packed.nodeData[n+7];
    if(first<0){node++;continue;}
    const count=packed.triangleData[first*24+3];
    for(let j=0;j<count;j++) {
      const t=(first+j)*24,a=Array.from(packed.triangleData.slice(t,t+3)),e1=Array.from(packed.triangleData.slice(t+4,t+7)),e2=Array.from(packed.triangleData.slice(t+8,t+11));
      const p=cross(d,e2),det=dot(e1,p);if(Math.abs(det)<1e-10)continue;
      const s=sub(o,a),u=dot(s,p)/det;if(u<-.000001||u>1.000001)continue;
      const q=cross(s,e1),v=dot(d,q)/det;if(v<-.000001||u+v>1.000001)continue;
      const distance=dot(e2,q)/det;if(distance>.0002&&distance<best)best=distance;
    }
    node=packed.nodeData[n+3];
  }
  return best;
}
let rays=0,hits=0,maxDifference=0;
for(const direction of [[0,0,-1],normalize([.2,.1,-1]),normalize([-.4,.2,-1])]) {
  for(let y=-21;y<=21;y+=1.5)for(let x=-21;x<=21;x+=1.5) {
    const origin=[x,y,45], a=hit(origin,direction), b=reference.intersect({origin,direction})?.t??Infinity;
    assert.equal(Number.isFinite(a),Number.isFinite(b));
    if(Number.isFinite(a)){hits++;maxDifference=Math.max(maxDifference,Math.abs(a-b));assert.ok(Math.abs(a-b)<.0001);}
    rays++;
  }
}
let smoothDifferent=0,maxNormalDeviationDeg=0;
for(let i=0;i<packed.triangleData.length;i+=24) {
  const t=packed.triangleData,e1=Array.from(t.slice(i+4,i+7)),e2=Array.from(t.slice(i+8,i+11)),face=normalize(cross(e1,e2));
  for(const offset of [12,16,20]){const n=Array.from(t.slice(i+offset,i+offset+3));assert.ok(Math.abs(Math.hypot(...n)-1)<1e-6);assert.ok(dot(n,face)>0);const angle=Math.acos(Math.min(1,dot(n,face)))*180/Math.PI;maxNormalDeviationDeg=Math.max(maxNormalDeviationDeg,angle);if(angle>1)smoothDifferent++;}
}
assert.ok(smoothDifferent>0);
const result={...packed.audit,packedFloat32VersusDoubleReference:{rays,hits,maxDistanceDifferenceMm:maxDifference},smoothNormals:{angleWeighted:true,creaseAngleDeg:45,cornerNormalsDifferingMoreThanOneDegree:smoothDifferent,maxNormalDeviationDeg},renderContract:{gpuTriangles:20932,perFrameCpuIntersections:0,maxInternalReflections:4,shaderSurface:'immutable CAD triangles',entryExitOrientation:'geometric normals',snellFresnelShading:'interpolated welded normals with geometric hemisphere fallback'}};
fs.writeFileSync(new URL('./realtime-geometry.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
