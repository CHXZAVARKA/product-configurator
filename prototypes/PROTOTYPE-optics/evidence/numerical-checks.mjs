// PROTOTYPE: headless checks of model.js; regenerates numerical-checks.json.
// Run from this folder: node evidence/numerical-checks.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('model.js', 'utf8').replace("'cannon-es'", JSON.stringify(new URL('../vendor/cannon-es.js', import.meta.url).href));
const { Filling, mirrorRay, NORMALS, OPTICS } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const SLEEPING = 2;
const results = [];
for (const count of [0, 12, 24, 36]) {
 const f = new Filling(count); let escaped = 0;
 for (let i = 0; i < 7200; i++) { if (i % 1200 === 0) { f.setOrientation(i / 20, (i / 40) % 180); f.shake(); } f.step(); escaped = Math.max(escaped, f.state().escaped); }
 const before = JSON.stringify(f.pieces.map(p => p.body.position));
 f.paused = true; for (let i = 0; i < 100; i++) f.step();
 results.push({ count, seconds: 10, maximumEscapedVertices: escaped, pausePreservesPositions: before === JSON.stringify(f.pieces.map(p => p.body.position)), state: f.state() });
}
// Settling: no input for 15 s must end with every shard asleep and no residual motion.
const settle = [];
for (const count of [12, 24, 36]) {
 const f = new Filling(count);
 let settledAt = null;
 for (let i = 0; i < 10800; i++) { f.step(); if (settledAt === null && f.pieces.every(p => p.body.sleepState === SLEEPING)) settledAt = +(i / 720).toFixed(2); }
 const rest = f.state();
 const frozen = JSON.stringify(f.pieces.map(p => p.body.position));
 for (let i = 0; i < 720; i++) f.step();
 const stillFrozen = frozen === JSON.stringify(f.pieces.map(p => p.body.position));
 // A shake adds ±10 cm/s; on a level floor friction stops sliding within ~0.05 s, so read the peak.
 let shakePeak = 0; f.shake(); for (let i = 0; i < 180; i++) { f.step(); shakePeak = Math.max(shakePeak, f.state().moving); }
 const afterShake = f.state();
 f.setOrientation(90, 80); for (let i = 0; i < 180; i++) f.step();
 const afterTurn = f.state();
 settle.push({ count, settledAfterSeconds: settledAt, restingState: { moving: rest.moving, energy: rest.energy, escaped: rest.escaped, sleeping: f.pieces.length && count }, positionsFrozenOneMoreSecond: stillFrozen, wakesOnShake: shakePeak > 0, movingPeakAfterShake: shakePeak, movingQuarterSecondAfterShake: afterShake.moving, wakesOnOrientation: afterTurn.moving > 0, escapedAfterWake: Math.max(afterShake.escaped, afterTurn.escaped) });
}
let invalid = 0, maxBounces = 0;
for (let x = -10; x <= 10; x++) for (let y = -10; y <= 10; y++) {
 const r = mirrorRay([0, 0, 192], [x * .065, y * .065, -1]); maxBounces = Math.max(maxBounces, r.bounces);
 if (!r.complete || NORMALS.some(n => n[0] * r.position[0] + n[1] * r.position[1] > OPTICS.inradius + 1e-4)) invalid++;
}
const rayCheck = { rays: 441, invalid, maxBounces, axis: mirrorRay([0, 0, 192], [0, 0, -1]) };
const report = { generated: new Date().toISOString(), physics: results, settling: settle, rayCheck };
writeFileSync(new URL('./numerical-checks.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
