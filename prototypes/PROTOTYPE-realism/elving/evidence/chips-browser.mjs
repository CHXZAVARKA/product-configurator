import {spawn} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const port=9354,profile=mkdtempSync(join(tmpdir(),'real-time-prism-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--window-size=1280,1100','--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[],requests=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const snapshot=()=>evaluate('window.REALTIME.snapshot()');
const results={generated:new Date().toISOString(),checks:[]};
const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(new URL(name,import.meta.url),Buffer.from(s.data,'base64'));};
const ready=async()=>{for(let i=0;i<150;i++){if(await evaluate('!!window.REALTIME && !!window.REALTIME.snapshot().lastBenchmark && !window.REALTIME.snapshot().measuring'))return;await sleep(100);}throw Error('Realtime app not ready: '+await evaluate("document.getElementById('error')?.textContent"));};
try{
 for(let i=0;i<100;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await sleep(100);}}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
 await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Page.enable');
 await send('Page.navigate',{url:new URL('../PROTOTYPE-realtime.html',import.meta.url).href});await ready();
 assert(await evaluate("document.getElementById('error').hidden"));
 const initial=await snapshot();assert.equal(initial.state.mode,'prism');assert.equal(initial.state.filling,true);assert.equal(initial.physics.count,124);assert.equal(initial.state.elving,false);assert.equal(initial.cadPasses,0);assert.equal(initial.state.background,'world');
 const unique=await evaluate('new Set(Array.from(window.REALTIME.pixels()).filter((_,i)=>i%4!==3)).size');assert(unique>80);
 results.checks.push({name:'124-real-convex-shards-visible-through-prism',passed:true,initial});await shot('chips-prism.png');
 await evaluate("document.getElementById('pause').click()");await sleep(150);let s=await snapshot();await sleep(400);assert.equal((await snapshot()).frames,s.frames);assert.equal((await snapshot()).physics.steps,s.physics.steps);results.checks.push({name:'manual-pause-stops-render-and-physics',passed:true});
 const eyeHash=await evaluate('window.REALTIME.hash()');await evaluate("document.getElementById('glass').click()");await sleep(100);assert.equal((await snapshot()).sourcePasses,s.sourcePasses);assert.notEqual(await evaluate('window.REALTIME.hash()'),eyeHash);await shot('chips-direct.png');
 const withChips=await evaluate('window.REALTIME.hash()');await evaluate("document.getElementById('filling').click()");await sleep(100);assert.notEqual(await evaluate('window.REALTIME.hash()'),withChips);await evaluate("document.getElementById('filling').click()");await sleep(100);assert.equal(await evaluate('window.REALTIME.hash()'),withChips);results.checks.push({name:'shared-source-and-actual-shard-layer-toggle',passed:true});
 const smoothHash=await evaluate('window.REALTIME.hash()');await evaluate("document.getElementById('smooth').click()");await sleep(150);assert.notEqual(await evaluate('window.REALTIME.hash()'),smoothHash);await evaluate("document.getElementById('smooth').click()");await sleep(100);results.checks.push({name:'actual-smooth-and-fracture-material-change',passed:true});
 const posesBefore=await evaluate('window.REALTIME.physics.poses()');await evaluate("document.getElementById('shake').click()");await sleep(1200);const after=await snapshot();assert(after.physics.steps>s.physics.steps);assert.equal(after.cadPasses,0);assert.notDeepEqual(await evaluate('window.REALTIME.physics.poses()'),posesBefore);assert(after.frames>s.frames+15);results.checks.push({name:'shake-causes-rigid-body-motion',passed:true,framesDuring1_2s:after.frames-s.frames});
 await evaluate("window.REALTIME.set({mode:'prism'})");await sleep(100);
 results.performance=await evaluate('window.REALTIME.benchmark(40)');assert(results.performance.p95Ms<=33,`Combined moving render: ${results.performance.p95Ms}ms`);results.checks.push({name:'moving-physics-and-GPU-p95-under-33ms',passed:true});
 // Native or low-energy sleep must stop both world stepping and demand rendering.
 for(let i=0;i<180;i++){if(!(await snapshot()).physics.moving)break;await sleep(100);}
 const asleep=await snapshot();assert.equal(asleep.physics.moving,false,'Dense filling must settle without endless collision jitter');await sleep(500);assert.equal((await snapshot()).frames,asleep.frames);assert.equal((await snapshot()).physics.steps,asleep.physics.steps);results.checks.push({name:'automatic-settle-stops-world-and-render',passed:true,snapshot:asleep.physics});
 await evaluate("const input=document.getElementById('turn');input.value=85;input.dispatchEvent(new Event('input',{bubbles:true}))");await sleep(250);assert((await snapshot()).physics.steps>asleep.physics.steps);assert.equal((await snapshot()).physics.rollDeg,85);results.checks.push({name:'rotation-input-wakes-and-redirects-gravity',passed:true});
 await evaluate("window.REALTIME.set({paused:true})");await sleep(100);
 const beforeWorld=await evaluate('window.REALTIME.hash()');await evaluate("window.REALTIME.set({light:-35})");await sleep(150);assert.notEqual(await evaluate('window.REALTIME.hash()'),beforeWorld);assert.equal((await snapshot()).cadPasses,0);results.checks.push({name:'HDR-world-and-reflections-react-without-CAD-raytracing',passed:true});
 await evaluate("window.REALTIME.set({elving:true})");await sleep(300);assert((await snapshot()).cadPasses>0);await evaluate("window.REALTIME.set({elving:false})");await sleep(100);results.checks.push({name:'optional-CAD-optics-still-available',passed:true});
 await send('DOM.enable');const documentRoot=await send('DOM.getDocument');const upload=await send('DOM.querySelector',{nodeId:documentRoot.root.nodeId,selector:'#upload'});
 await send('DOM.setFileInputFiles',{nodeId:upload.nodeId,files:[new URL('../../../PROTOTYPE-optics/assets/glass-photo.png',import.meta.url).pathname]});
 for(let i=0;i<50;i++){if((await snapshot()).state.background==='upload')break;await sleep(100);}assert.equal((await snapshot()).state.background,'upload');await sleep(100);assert.notEqual(await evaluate('window.REALTIME.hash()'),eyeHash);await shot('chips-upload.png');results.checks.push({name:'local-image-upload-updates-refracted-prism',passed:true});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(150);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('chips-mobile.png');results.checks.push({name:'mobile-no-horizontal-overflow',passed:true});
 assert.equal(await evaluate('window.REALTIME.gl.getError()'),0);assert.equal(errors.length,0,errors.join('\n'));assert(requests.every(u=>u.startsWith('file:')||u.startsWith('data:')),'Offline image upload must not send external requests');
 await send('Page.navigate',{url:'http://127.0.0.1:3039/'});await ready();assert.equal((await snapshot()).state.mode,'prism');assert.equal(errors.length,0,errors.join('\n'));results.checks.push({name:'current-3039-serves-filling-view',passed:true});results.errors=errors;results.passed=true;
}catch(error){results.passed=false;results.error=error.stack||String(error);results.errors=errors;}
finally{ws?.close();chrome.kill();await sleep(300);rmSync(profile,{recursive:true,force:true});writeFileSync(new URL('chips-browser.json',import.meta.url),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));process.exit(results.passed?0:1);
