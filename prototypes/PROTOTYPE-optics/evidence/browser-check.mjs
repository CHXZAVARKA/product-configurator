// PROTOTYPE: drive the served viewer in headless Chrome over DevTools protocol.
// Records state after each action into browser-checks.json and saves screenshots.
// Usage (preview.py must be running): node evidence/browser-check.mjs [url]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || 'http://127.0.0.1:3027/';
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'prototype-optics-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,960', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = { url, steps: [] };
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => { const m = ++id; pending.set(m, { resolve, reject }); ws.send(JSON.stringify({ id: m, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value; };
const read = () => evaluate(`(() => { const s = window.PROTOTYPE ? window.PROTOTYPE.snapshot() : null; const t = id => document.getElementById(id).textContent; return { tick: s?.tick, mode: s?.mode, count: s?.count, moving: s?.moving, energy: s?.energy, escaped: s?.escaped, roll: s?.roll, tilt: s?.tilt, shaderErrors: s?.shaderErrors, positions: s?.positions, orientations: s?.orientations, movingLabel: t('moving'), containment: t('containment'), status: t('status'), fps: t('fps'), env: t('env'), errorHidden: document.getElementById('error').hidden, scrollWidth: document.documentElement.scrollWidth, innerWidth: innerWidth }; })()`);
async function untilTick(target, timeoutMs = 90000) { const start = Date.now(); let s = await read(); while ((s.tick ?? 0) < target) { if (Date.now() - start > timeoutMs) throw new Error(`Simulation reached only tick ${s.tick} of ${target}`); await sleep(250); s = await read(); } return s; }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(here, name), Buffer.from(r.data, 'base64')); return name; }
function record(name, state, expectation, ok) { const { positions, orientations, ...rest } = state; results.steps.push({ name, ok, expectation, ...rest }); console.log(ok ? 'ok  ' : 'FAIL', name, '·', rest.movingLabel, '·', rest.containment); }
try {
 for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(250); } }
 const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' })).json();
 ws = new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
 ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
 await send('Runtime.enable'); await send('Page.enable');
 await sleep(1500);
 // 1. Fresh load settles on its own: the sleep window must end all residual motion.
 let s = await untilTick(7200);
 const frozen = JSON.stringify(s.positions);
 const s2 = await untilTick(s.tick + 720);
 record('settle-after-load', s2, 'HDRI loaded, no shader errors, all shards inside, label "Стёклышки улеглись", positions frozen for one more simulated second', s2.env === 'студийная HDRI загружена' && s2.shaderErrors === 0 && s2.escaped === 0 && s2.moving === 0 && s2.movingLabel === 'Стёклышки улеглись' && JSON.stringify(s2.positions) === frozen && s2.errorHidden);
 results.screenshots = [await shot('assembly-settled.png')];
 // 2. Shake moves the whole filling visibly, then it settles again without jitter.
 const startPositions = s2.positions, startOrientations = s2.orientations;
 await evaluate(`document.getElementById('shake').click()`);
 await sleep(200);
 s = await read();
 const peak = s.moving, shakingLabel = s.movingLabel;
 results.screenshots.push(await shot('eye-shaking.png'));
 s = await untilTick(s.tick + 2160);
 const rest = JSON.stringify(s.positions);
 const s3 = await untilTick(s.tick + 720);
 const meanShift = s3.positions.reduce((sum, p, i) => sum + Math.hypot(p[0] - startPositions[i][0], p[1] - startPositions[i][1]) * 10, 0) / s3.positions.length;
 const meanTurn = s3.orientations.reduce((sum, q, i) => { const a = startOrientations[i]; return sum + Math.acos(Math.min(1, Math.abs(q[0] * a[0] + q[1] * a[1] + q[2] * a[2] + q[3] * a[3]))) * 360 / Math.PI; }, 0) / s3.orientations.length;
 record('shake-then-rest', { ...s3, movingPeak: peak, shakingLabel, meanShiftMm: +meanShift.toFixed(1), meanTurnDeg: +meanTurn.toFixed(0) }, 'label "Встряхивание…", most shards moving 0.2 s in, shards reshuffle in place (mean shift over 2 mm, mean turn over 30°), 3 simulated seconds later they rest with frozen positions', shakingLabel === 'Встряхивание…' && peak >= s3.count * .8 && meanShift > 2 && meanTurn > 30 && s3.moving === 0 && s3.escaped === 0 && JSON.stringify(s3.positions) === rest);
 // 3. Chamber view and orientation change: gravity re-tumbles the filling and it settles again.
 await evaluate(`document.querySelector('[data-mode="chamber"]').click()`);
 await sleep(400); results.screenshots.push(await shot('chamber-view.png'));
 await evaluate(`const t = document.getElementById('tilt'); t.value = 80; t.dispatchEvent(new Event('input')); const r = document.getElementById('roll'); r.value = 90; r.dispatchEvent(new Event('input'));`);
 await sleep(120); s = await read(); const tiltPeak = s.moving;
 s = await untilTick(s.tick + 2880);
 record('tilt-then-rest', { ...s, movingPeak: tiltPeak }, 'tilting wakes shards; 4 simulated seconds later everything rests inside the chamber', tiltPeak > 0 && s.moving === 0 && s.escaped === 0);
 results.screenshots.push(await shot('chamber-tilted.png'));
 // 4. Eye view renders the same filling through the mirrors; dragging on it turns and tilts the product.
 await evaluate(`document.querySelector('[data-mode="eye"]').click()`); await sleep(500);
 s = await read(); record('eye-view', s, 'eye mode active, no shader errors', s.mode === 'eye' && s.shaderErrors === 0 && s.errorHidden);
 results.screenshots.push(await shot('eye-view.png'));
 const box = await evaluate(`(() => { const r = document.getElementById('optical-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
 const before = await read();
 await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
 for (let i = 1; i <= 8; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + box.w * .25 * i / 8, y: box.y + box.w * .15 * i / 8, button: 'left' }); await sleep(30); }
 await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + box.w * .25, y: box.y + box.w * .15, button: 'left', clickCount: 1 });
 await sleep(300); s = await read();
 const rollDelta = ((s.roll - before.roll + 540) % 360) - 180, tiltDelta = s.tilt - before.tilt;
 record('drag-eye-view', { ...s, rollDelta, tiltDelta }, 'dragging right by a quarter of the eyepiece adds ~45° of roll; dragging down lowers tilt by ~27°', rollDelta > 30 && rollDelta < 60 && tiltDelta < -15 && tiltDelta > -40);
 // 5. Empty chamber keeps a plain field.
 await evaluate(`const c = document.getElementById('count'); c.value = '0'; c.dispatchEvent(new Event('change'));`); await sleep(400);
 s = await read(); record('empty-chamber', s, 'count 0, label "Камера пуста"', s.count === 0 && s.movingLabel === 'Камера пуста');
 results.screenshots.push(await shot('eye-empty.png'));
 // 6. Reset restores 24 shards and the assembly view; narrow screen has no horizontal overflow.
 await evaluate(`document.getElementById('reset').click()`); await sleep(300);
 await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await sleep(800);
 s = await read(); record('mobile-390', s, 'after reset: 24 shards, assembly mode, no horizontal overflow at 390 px', s.count === 24 && s.mode === 'assembly' && s.scrollWidth <= s.innerWidth);
 results.screenshots.push(await shot('mobile-390.png'));
 results.passed = results.steps.every(x => x.ok);
} catch (e) { results.error = String(e.stack || e); console.error(e); }
finally { try { ws?.close(); } catch {} chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
results.generated = new Date().toISOString();
writeFileSync(join(here, 'browser-checks.json'), JSON.stringify(results, null, 2));
console.log(results.passed ? 'ALL PASSED' : 'FAILED');
process.exit(results.passed ? 0 : 1);
