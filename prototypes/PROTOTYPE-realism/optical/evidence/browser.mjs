import {spawn} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {frozenScene,transmittedRay,background,cameraRay} from '../transport.mjs';

const port=9348,profile=mkdtempSync(join(tmpdir(),'realism-02-')),chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--window-size=1280,960','--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[],requests=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const results={fixedBase:'056ff8ecec0d2fb359f3d371107495d1902effec',generated:new Date().toISOString(),checks:[]};
const server=spawn('python3',['-m','http.server','3038','--bind','127.0.0.1','--directory',new URL('..',import.meta.url).pathname],{stdio:'ignore'});
try{
 for(let i=0;i<80;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await sleep(100);}}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
 await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Page.enable');
 await send('Page.navigate',{url:new URL('../PROTOTYPE-optical.html',import.meta.url).href});
 for(let i=0;i<100;i++){if(await evaluate('!!window.OPTICAL'))break;await sleep(100);}
 assert(await evaluate('!!window.OPTICAL'));assert.equal(errors.length,0,errors.join('\n'));
 results.checks.push({name:'offline-WebGL2-real-surface-shader',passed:true});
 results.benchmark=await evaluate('OPTICAL.benchmark()');
 assert(await evaluate(`(()=>{try{OPTICAL.fast.render(new Array(3).fill({}));return false;}catch(e){return e.message.includes('at most two');}})()`));results.checks.push({name:'fast-more-than-two-solids-rejected-explicitly',passed:true});
 for(const count of [1,2]){
 await evaluate(`OPTICAL.setCount(${count})`);const before=await evaluate('OPTICAL.snapshot()');
 const method=await evaluate('OPTICAL.trace(64)');const after=await evaluate('OPTICAL.snapshot()');assert.deepEqual(before.poses,after.poses);assert.equal(after.traceResult.spp,64);assert.equal(after.center.interfaces,count*2);
 results.checks.push({name:`${count}-layer-control-same-frozen-poses`,passed:true,method,center:after.center});
 const probes=[];for(const [x,y] of [[118,122],[128,127],[140,137]]){const ray=cameraRay(x,y,256,256),t=transmittedRay(ray.origin,ray.direction,frozenScene(count));assert(t.point);const expected=background(t.point).map((v,j)=>Math.round(255*Math.min(1,v*t.weight[j])**(1/2.2)));const actual=await evaluate(`(()=>{const gl=OPTICAL.fast.gl,p=new Uint8Array(4);gl.readPixels(${x},${255-y},1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];})()`);assert(expected.every((v,j)=>Math.abs(v-actual[j])<=2),JSON.stringify({x,y,expected,actual}));probes.push({x,y,expected,actual,backgroundPointMm:t.point});}results.checks.push({name:`${count}-layer-GPU-pixels-match-independent-CPU-ray`,passed:true,probes});

 const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(`layers-${count}-64spp.png`,import.meta.url),Buffer.from(shot.data,'base64'));
 writeFileSync(new URL(`control-${count}-64spp.png`,import.meta.url),Buffer.from((await evaluate("document.getElementById('control').toDataURL('image/png')")).split(',')[1],'base64'));
 writeFileSync(new URL(`fast-${count}.png`,import.meta.url),Buffer.from((await evaluate("document.getElementById('fast').toDataURL('image/png')")).split(',')[1],'base64'));
 }
 await evaluate("document.getElementById('thickness').value='0.5';document.getElementById('thickness').dispatchEvent(new Event('input'))");const half=await evaluate('OPTICAL.snapshot()');assert.equal(half.thicknessScale,.5);assert(half.center.lengths[0]<1.3);assert.equal(half.traceResult,null);results.checks.push({name:'actual-geometry-thickness-control-invalidates-reference',passed:true});
 assert(requests.every(u=>u.startsWith('file:')||u.startsWith('data:')));results.externalRequests=[];
 await send('Page.navigate',{url:'http://127.0.0.1:3038/PROTOTYPE-optical.html'});for(let i=0;i<100;i++){if(await evaluate('!!window.OPTICAL'))break;await sleep(100);}assert(await evaluate('!!window.OPTICAL'));assert.equal(errors.length,0,errors.join('\n'));results.checks.push({name:'local-preview-3038',passed:true});results.errors=errors;results.passed=true;
}catch(e){results.passed=false;results.error=String(e.stack||e);results.errors=errors;}
finally{ws?.close();server.kill();chrome.kill();await sleep(300);rmSync(profile,{recursive:true,force:true});writeFileSync(new URL('browser.json',import.meta.url),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));process.exit(results.passed?0:1);
