import {spawn} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {BASE_SHA} from '../geometry.mjs';
const port=9347,profile=mkdtempSync(join(tmpdir(),'realism-01-')),chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--window-size=1280,960','--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[],requests=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const snapshot=()=>evaluate('window.REALISM.snapshot()');const results={baseSHA:BASE_SHA,generated:new Date().toISOString(),checks:[]};
const poseKey=s=>JSON.stringify(s.poses.map(({sleeping,...p})=>p));
try{
 for(let i=0;i<80;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await sleep(100);}}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
 await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Page.enable');
 const fileURL=new URL('../PROTOTYPE-lab.html',import.meta.url).href;
 await send('Page.navigate',{url:fileURL});
 for(let i=0;i<150;i++){if(await evaluate('!!window.REALISM'))break;await sleep(100);}
 assert(await evaluate('!!window.REALISM'));await sleep(800);
 let s=await snapshot();assert.equal(s.count,2);assert(await evaluate("document.getElementById('error').hidden"));results.checks.push({name:'offline-file-WebGL',passed:true,steps:s.steps});
 await evaluate('window.REALISM.pause(true)');s=await snapshot();await sleep(350);const pause=await snapshot();assert.equal(pause.steps,s.steps);assert.equal(poseKey(pause),poseKey(s));results.checks.push({name:'pause-preserves-poses-and-steps',passed:true});
 await evaluate("document.getElementById('side').click();document.getElementById('colliders').click()");await sleep(100);assert.equal(await evaluate('window.REALISM.view.outlines.every(x=>!x.visible)'),true);await evaluate("document.getElementById('colliders').click()");await sleep(100);assert(await evaluate('window.REALISM.view.outlines.every(x=>x.visible)'));
 const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('lab-two-side.png',import.meta.url),Buffer.from(shot.data,'base64'));
 await evaluate('window.REALISM.pause(false);window.REALISM.setPose(110,55);window.REALISM.shake()');await sleep(1200);const moved=await snapshot();assert.notEqual(poseKey(moved),poseKey(s));results.checks.push({name:'rotate-tilt-shake-change-poses',passed:true,before:s.poses,after:moved.poses});
 await evaluate('window.REALISM.setCount(1)');await sleep(600);assert.equal((await snapshot()).count,1);assert.equal(await evaluate('window.REALISM.view.meshes.length'),1);results.checks.push({name:'switch-one-two-and-collider-toggle',passed:true});
 await evaluate('window.REALISM.setPose(0,80)');for(let i=0;i<150;i++){if((await snapshot()).moving===0)break;await sleep(100);}s=await snapshot();assert.equal(s.moving,0,'Sleep');await sleep(350);assert.equal((await snapshot()).steps,s.steps);await evaluate('window.REALISM.shake()');await sleep(150);assert((await snapshot()).steps>s.steps);results.checks.push({name:'sleep-stops-and-action-wakes-solver',passed:true});
 await evaluate("document.getElementById('poses').click()");assert(await evaluate("!document.getElementById('pose-data').hidden && document.getElementById('pose-data').textContent.includes('positionMm')"));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(100);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));results.checks.push({name:'mobile-layout-and-readable-poses',passed:true});
 assert.equal(errors.length,0,errors.join('\n'));assert(requests.every(u=>u.startsWith('file:')||u.startsWith('data:')),'Offline page no external requests');
 results.externalRequests=requests.filter(u=>!u.startsWith('file:')&&!u.startsWith('data:'));await send('Page.navigate',{url:'http://127.0.0.1:3037/'});for(let i=0;i<150;i++){if(await evaluate('!!window.REALISM'))break;await sleep(100);}assert(await evaluate('!!window.REALISM'));assert(await evaluate("document.getElementById('error').hidden"));results.checks.push({name:'local-preview-3037',passed:true});assert.equal(errors.length,0,errors.join('\n'));results.errors=errors;results.passed=true;
}catch(e){results.passed=false;results.error=String(e.stack||e);results.errors=errors;}
finally{ws?.close();chrome.kill();await sleep(300);rmSync(profile,{recursive:true,force:true});writeFileSync(new URL('browser.json',import.meta.url),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));process.exit(results.passed?0:1);
