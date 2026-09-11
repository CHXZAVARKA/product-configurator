import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../model.js',import.meta.url),'utf8').replace("'cannon-es'",JSON.stringify(new URL('../vendor/cannon-es.js',import.meta.url).href)).replace("'rapier'",JSON.stringify(new URL('../vendor/rapier.js',import.meta.url).href));
const {Filling,PHYSICS_HZ}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const {Vec3}=await import(new URL('../vendor/cannon-es.js',import.meta.url));
function prepared(body){const shape=body.shapes[0],edges=[];for(const face of shape.faces)for(let i=0;i<face.length;i++){const delta=shape.vertices[face[(i+1)%face.length]].vsub(shape.vertices[face[i]]);delta.normalize();if(!edges.some(e=>Math.abs(e.dot(delta))>.9999))edges.push(delta);}return{body,vertices:shape.vertices.map(v=>body.quaternion.vmult(v).vadd(body.position)),axes:shape.faceNormals.map(v=>body.quaternion.vmult(v)),edges:edges.map(e=>body.quaternion.vmult(e))};}
function penetration(a,b){if(a.body.position.distanceTo(b.body.position)>1.25)return 0;const axes=[...a.axes,...b.axes];for(const x of a.edges)for(const y of b.edges){const cross=x.cross(y);if(cross.lengthSquared()>1e-8){cross.normalize();axes.push(cross);}}
 let depth=Infinity;for(const axis of axes){const pa=a.vertices.map(v=>v.dot(axis)),pb=b.vertices.map(v=>v.dot(axis));const overlap=Math.min(Math.max(...pa)-Math.min(...pb),Math.max(...pb)-Math.min(...pa));if(overlap<=0)return 0;depth=Math.min(depth,overlap);}return depth*10;
}
function maximum(filling){const shapes=filling.pieces.map(p=>prepared(p.body));let max=0;for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++)max=Math.max(max,penetration(shapes[i],shapes[j]));return max;}
export {maximum,prepared,penetration,Filling,PHYSICS_HZ};
if(import.meta.main){
const rows=[];
for(const seed of [71,107,213]){const f=new Filling(96,seed);let dynamic=0,escaped=0;for(let i=0;i<PHYSICS_HZ*8;i++){if(i%(PHYSICS_HZ*2)===0){f.setOrientation(i/PHYSICS_HZ*25,(i/PHYSICS_HZ*15)%100);f.shake();}f.step();escaped=Math.max(escaped,f.state().escaped);if(i%(PHYSICS_HZ/4)===0)dynamic=Math.max(dynamic,maximum(f));}for(let i=0;i<PHYSICS_HZ*8;i++)f.step();rows.push({seed,maxDynamicPenetrationMm:+dynamic.toFixed(3),restingPenetrationMm:+maximum(f).toFixed(3),escaped,settled:f.settled});f.dispose();}
const report={generated:new Date().toISOString(),hz:PHYSICS_HZ,method:'Separating axes: face normals and edge cross-products, 96 chips, three seeds, eight seconds of shaking/tilt then eight seconds to settle.',rows};
writeFileSync(new URL('./contact-check.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
assert(rows.every(r=>r.escaped===0&&r.settled&&r.restingPenetrationMm<.3&&r.maxDynamicPenetrationMm<.9),'Excessive chip penetration or escaped vertices');

}
