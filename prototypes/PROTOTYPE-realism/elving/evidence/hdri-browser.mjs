import {spawn} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const port=9356,profile=mkdtempSync(join(tmpdir(),'real-time-prism-'));
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
 const initial=await snapshot();assert.equal(initial.state.background,'world');assert.equal(initial.state.elving,false);assert.equal(initial.cadPasses,0);
 // Freeze mechanics: changing light must change actual optical pixels without moving any body.
 await evaluate("window.REALTIME.set({paused:true,mode:'glass'})");await sleep(180);
 const poses=await evaluate('window.REALTIME.physics.poses()');const original=await evaluate('window.REALTIME.hash()');
 await evaluate("window.REALTIME.set({light:155})");await sleep(150);assert.notEqual(await evaluate('window.REALTIME.hash()'),original);assert.deepEqual(await evaluate('window.REALTIME.physics.poses()'),poses);await shot('hdri-direction.png');
 results.checks.push({name:'HDRI-background-and-light-change-with-fixed-shards',passed:true});
 await evaluate("window.REALTIME.set({light:55,intensity:2.2,glow:0})");await sleep(120);const noGlow=await evaluate('window.REALTIME.hash()');await shot('hdri-no-glow.png');
 await evaluate("window.REALTIME.set({glow:1.1})");await sleep(120);assert.notEqual(await evaluate('window.REALTIME.hash()'),noGlow);await shot('hdri-glow.png');results.checks.push({name:'HDR-radiance-bloom-changes-visible-highlights',passed:true});
 await evaluate("window.REALTIME.set({intensity:0})");await sleep(120);const dark=await evaluate('window.REALTIME.pixels().reduce((peak,v,i)=>i%4===3?peak:Math.max(peak,v),0)');assert(dark<8,'Glass must not emit light when all light is zero');results.checks.push({name:'zero-light-zero-emission-even-with-glow',passed:true,maxChannel:dark});
 await evaluate("window.REALTIME.set({intensity:2.2,glow:.65})");await sleep(100);
 const still=await snapshot();await evaluate("document.getElementById('animate-light').click()");await sleep(1100);const animated=await snapshot();assert(animated.frames>still.frames+20);assert.notEqual(animated.state.light,still.state.light);assert.equal(animated.physics.steps,still.physics.steps);assert.deepEqual(await evaluate('window.REALTIME.physics.poses()'),poses);
 await evaluate("document.getElementById('animate-light').click()");await sleep(150);const stopped=await snapshot();await sleep(400);assert.equal((await snapshot()).frames,stopped.frames);results.checks.push({name:'light-animation-with-sleeping-physics-and-idle-stop',passed:true,frames:animated.frames-still.frames});
 await evaluate("window.REALTIME.set({mode:'prism',light:55})");await sleep(100);const eyeHash=await evaluate('window.REALTIME.hash()');await shot('hdri-prism.png');
 await evaluate("document.getElementById('shake').click();document.getElementById('animate-light').click()");await sleep(100);
 results.performance=await evaluate('window.REALTIME.benchmark(40)');assert(results.performance.p95Ms<=33,'Moving HDRI + mechanics + bloom must fit33ms');assert.equal(results.performance.cadPasses,0);results.checks.push({name:'moving-HDRI-physics-bloom-and-prism-under33ms',passed:true});
 await evaluate("window.REALTIME.set({paused:true,lightAuto:false})");await sleep(100);
 await send('DOM.enable');const documentRoot=await send('DOM.getDocument');const upload=await send('DOM.querySelector',{nodeId:documentRoot.root.nodeId,selector:'#upload'});
 await send('DOM.setFileInputFiles',{nodeId:upload.nodeId,files:[new URL('../../../PROTOTYPE-optics/assets/glass-photo.png',import.meta.url).pathname]});
 for(let i=0;i<50;i++){if((await snapshot()).state.background==='upload')break;await sleep(100);}assert.equal((await snapshot()).state.background,'upload');await sleep(100);assert.notEqual(await evaluate('window.REALTIME.hash()'),eyeHash);await shot('hdri-upload.png');results.checks.push({name:'local-image-upload-updates-refracted-prism',passed:true});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(150);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('hdri-mobile.png');results.checks.push({name:'mobile-no-horizontal-overflow',passed:true});
 assert.equal(await evaluate('window.REALTIME.gl.getError()'),0);assert.equal(errors.length,0,errors.join('\n'));assert(requests.every(u=>u.startsWith('file:')||u.startsWith('data:')),'Offline image upload must not send external requests');
 await send('Page.navigate',{url:'http://127.0.0.1:3039/'});await ready();assert.equal((await snapshot()).state.mode,'prism');assert.equal(errors.length,0,errors.join('\n'));results.checks.push({name:'current-3039-serves-filling-view',passed:true});results.errors=errors;results.passed=true;
}catch(error){results.passed=false;results.error=error.stack||String(error);results.errors=errors;}
finally{ws?.close();chrome.kill();await sleep(300);rmSync(profile,{recursive:true,force:true});writeFileSync(new URL('hdri-browser.json',import.meta.url),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));process.exit(results.passed?0:1);
