// PROTOTYPE: headless checks of model.js; regenerates numerical-checks.json.
// Run from this folder: node evidence/numerical-checks.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('model.js', 'utf8').replace("'cannon-es'", JSON.stringify(new URL('../vendor/cannon-es.js', import.meta.url).href)).replace("'rapier'", JSON.stringify(new URL('../vendor/rapier.js', import.meta.url).href));
const { Filling, mirrorRay, NORMALS, OPTICS, PHYSICS_HZ } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const SLEEPING = 2;
const results = [];
for (const count of [0, 24, 48, 72, 96]) {
 const f = new Filling(count); let escaped = 0;
 for (let i = 0; i < PHYSICS_HZ * 10; i++) { if (i % (PHYSICS_HZ * 2) === 0) { f.setOrientation(i * 36 / PHYSICS_HZ, (i * 18 / PHYSICS_HZ) % 180); f.shake(); } f.step(); escaped = Math.max(escaped, f.state().escaped); }
 const before = JSON.stringify(f.pieces.map(p => p.body.position));
 f.paused = true; for (let i = 0; i < 100; i++) f.step();
 results.push({ count, seconds: 10, maximumEscapedVertices: escaped, pausePreservesPositions: before === JSON.stringify(f.pieces.map(p => p.body.position)), state: f.state() });
}
// Settling: no input for 15 s must end with every shard asleep and no residual motion.
const settle = [];
for (const count of [24, 48, 72, 96]) {
 const f = new Filling(count);
 let settledAt = null;
 for (let i = 0; i < PHYSICS_HZ * 15; i++) { f.step(); if (settledAt === null && f.pieces.every(p => p.body.sleepState === SLEEPING)) settledAt = +(i / PHYSICS_HZ).toFixed(2); }
 const rest = f.state(), sleeping=f.pieces.filter(p=>p.body.sleepState===SLEEPING).length, frozenTick=f.tick;
 const frozen = JSON.stringify(f.pieces.map(p => p.body.position));
 for (let i = 0; i < PHYSICS_HZ; i++) f.step();
 const stillFrozen = frozen === JSON.stringify(f.pieces.map(p => p.body.position)), worldDidNotStepWhileFrozen=f.tick===frozenTick;
 // The chamber moves through a smooth pulse; read the peak, not one resting frame.
 let shakePeak = 0; f.shake(); for (let i = 0; i < PHYSICS_HZ / 4; i++) { f.step(); shakePeak = Math.max(shakePeak, f.state().moving); }
 const afterShake = f.state();
 const beforeTurnTick=f.tick;f.setOrientation(90,80);let turnPeak=0;for(let i=0;i<PHYSICS_HZ*2;i++){f.step();turnPeak=Math.max(turnPeak,f.state().moving);}
 const afterTurn = f.state();
 settle.push({ count, settledAfterSeconds: settledAt, restingState: { moving: rest.moving, energy: rest.energy, escaped: rest.escaped, sleeping }, positionsFrozenOneMoreSecond: stillFrozen, worldDidNotStepWhileFrozen, wakesOnShake: shakePeak > 0, movingPeakAfterShake: shakePeak, movingQuarterSecondAfterShake: afterShake.moving, wakesOnOrientation: turnPeak>0&&f.tick>beforeTurnTick, escapedAfterWake: Math.max(afterShake.escaped, afterTurn.escaped) });
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

assert(results.every(r=>r.maximumEscapedVertices===0&&r.pausePreservesPositions));
assert(settle.every(r=>r.settledAfterSeconds!==null&&r.restingState.sleeping===r.count&&r.positionsFrozenOneMoreSecond&&r.worldDidNotStepWhileFrozen&&r.wakesOnShake&&r.wakesOnOrientation&&r.escapedAfterWake===0));
assert.equal(rayCheck.invalid,0);
