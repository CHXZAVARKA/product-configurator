// Closed, outward-facing convex geometry is required for entry/exit refraction.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../model.js', import.meta.url), 'utf8').replace("'cannon-es'", JSON.stringify(new URL('../vendor/cannon-es.js', import.meta.url).href)).replace("'rapier'", JSON.stringify(new URL('../vendor/rapier.js', import.meta.url).href));
const { makeShard, Filling, fracturedSurface } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
for (const beveled of [false,true]) for (let variant = 0; variant < 3; variant++) {
 const shape = makeShard(.4, .4, .075, variant, beveled), edges = new Map();
 for (const [i, face] of shape.faces.entries()) {
  const normal = shape.faceNormals[i], anchor = shape.vertices[face[0]];
  assert(normal.dot(anchor) > 0, 'Normals must point out of the glass');
  for (const vertex of shape.vertices) assert(normal.dot(vertex) <= normal.dot(anchor) + 1e-9, 'Each face must bound a convex solid');
  for (let j = 0; j < face.length; j++) {
   const a = face[j], b = face[(j + 1) % face.length], key = [a, b].sort((x,y) => x-y).join(':');
   const counts = edges.get(key) ?? { total: 0, direction: 0 };
   counts.total++; counts.direction += a < b ? 1 : -1; edges.set(key, counts);
  }
 }
 for (const edge of edges.values()) { assert.equal(edge.total, 2); assert.equal(edge.direction, 0); }
}
// Every generated render triangle stays in its collision proxy, and every edge
// is shared by exactly two oppositely wound faces (no open/non-manifold glass).
for(const seed of [71,107,213]){
 const filling=new Filling(96,seed);
 for(const [i,piece] of filling.pieces.entries()){
  const {positions,indices}=fracturedSurface(piece,i),shape=piece.body.shapes[0],edges=new Map();
  const vertices=[];for(let j=0;j<positions.length;j+=3)vertices.push({x:positions[j]/10,y:positions[j+1]/10,z:positions[j+2]/10});
  for(const vertex of vertices)for(const [j,face] of shape.faces.entries()){
   const n=shape.faceNormals[j],anchor=shape.vertices[face[0]];
   assert(n.dot(vertex)<=n.dot(anchor)+1e-8,'Rendered glass exceeds its physical shell');
  }
  let volume=0;
  for(let j=0;j<indices.length;j+=3){
   const ids=indices.slice(j,j+3),[a,b,c]=ids.map(k=>vertices[k]);
   volume+=(a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x))/6;
   for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');const e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
  }
  assert(volume>0,'Rendered shard must have outward winding and positive volume');
  for(const [total,direction] of edges.values()){assert.equal(total,2);assert.equal(direction,0);}
 }
 filling.dispose();
}
const report = JSON.parse(readFileSync(new URL('./numerical-checks.json', import.meta.url)));
assert(report.physics.every(s => s.maximumEscapedVertices === 0 && s.pausePreservesPositions));
assert(report.settling.every(s => s.positionsFrozenOneMoreSecond && s.wakesOnShake && s.wakesOnOrientation && s.escapedAfterWake === 0));
assert.equal(report.rayCheck.invalid, 0);
console.log('PASS: 288 procedural shards, 3 legacy glass profiles and 3 collision proxies are closed convex solids with outward winding; saved physics and 441-ray results pass.');
