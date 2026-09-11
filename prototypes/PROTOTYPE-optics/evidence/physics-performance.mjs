// Research benchmark. Variants exist only in memory; this does not change model.js.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
// Historical baseline, pinned so future model edits cannot silently relabel these probes.
const original=execFileSync('git',['show','f4dc7de:prototypes/PROTOTYPE-optics/model.js'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
const result={date:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,sourceSha256:createHash('sha256').update(original).digest('hex'),scope:'CPU only, 36 chips, 120 frames at 60 Hz; shake at frames 0 and 60. Rate variants are research probes, not validated replacements.',variants:[]};
const proxiesOnly=process.argv.includes('--proxies-only');
if(proxiesOnly)result.variants=JSON.parse(readFileSync(new URL('./physics-performance.json',import.meta.url),'utf8')).variants.filter(v=>!v.proxy);
const configurations=proxiesOnly?[[120,'prism'],[120,'cuboid']]:[[720,null],[240,null],[120,null],[120,'prism'],[120,'cuboid']];
for(const [hz,proxy] of configurations) {
 let source=original.replace("'cannon-es'",JSON.stringify(new URL('../vendor/cannon-es.js',import.meta.url).href));
 source=source.replace('const SHAKE_TICKS = 360;',`const SHAKE_TICKS = ${hz/2};`).replace('(SHAKE_TICKS-this.shakeLeft)/720',`(SHAKE_TICKS-this.shakeLeft)/${hz}`).replace('this.shakeLeft/90',`this.shakeLeft/${hz/8}`).replace('this.shakeLeft%60',`this.shakeLeft%${hz/12}`).replace('this.world.step(1/720)',`this.world.step(1/${hz})`).replace('this.tick%180',`this.tick%${hz/4}`);
 if(proxy==='prism')source=source.replace('[[.94,-h],[1,0],[.92,h]]','[[1,-h],[1,h]]').replace('faces=[[4,3,2,1,0],[10,11,12,13,14]]','faces=[[4,3,2,1,0],[5,6,7,8,9]]').replace('ring<2','ring<1');
 if(proxy==='cuboid'){const start=source.indexOf('export function makeShard('),end=source.indexOf('export class Filling');source=source.slice(0,start)+'export function makeShard(sx,sy,h){return new C.Box(new C.Vec3(sx,sy,h)).convexPolyhedronRepresentation;}\n'+source.slice(end);}
 const {Filling}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const filling=new Filling(36),times=[];let escaped=0;
 for(let frame=0;frame<120;frame++) {
  if(frame%60===0)filling.shake();
  const start=performance.now();for(let step=0;step<hz/60;step++)filling.step();times.push(performance.now()-start);
  escaped=Math.max(escaped,filling.state().escaped);
 }
 const ordered=times.toSorted((a,b)=>a-b);
 const row={hz,proxy,stepsPerFrame:hz/60,medianMs:+ordered[60].toFixed(2),p95Ms:+ordered[114].toFixed(2),maxMs:+ordered[119].toFixed(2),maximumEscapedVerticesAtFrameBoundary:escaped};
 result.variants.push(row);console.log(JSON.stringify(row));
}
writeFileSync(new URL('./physics-performance.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
