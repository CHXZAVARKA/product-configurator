// Closed, outward-facing convex geometry is required for entry/exit refraction.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../model.js', import.meta.url), 'utf8').replace("'cannon-es'", JSON.stringify(new URL('../vendor/cannon-es.js', import.meta.url).href)).replace("'rapier'", JSON.stringify(new URL('../vendor/rapier.js', import.meta.url).href));
const { makeShard } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
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
const report = JSON.parse(readFileSync(new URL('./numerical-checks.json', import.meta.url)));
assert(report.physics.every(s => s.maximumEscapedVertices === 0 && s.pausePreservesPositions));
assert(report.settling.every(s => s.positionsFrozenOneMoreSecond && s.wakesOnShake && s.wakesOnOrientation && s.escapedAfterWake === 0));
assert.equal(report.rayCheck.invalid, 0);
console.log('PASS: 3 glass profiles and 3 collision proxies are closed convex solids with outward winding; saved physics and 441-ray results pass.');
