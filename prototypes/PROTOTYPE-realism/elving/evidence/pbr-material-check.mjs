import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=new URL('../../../../',import.meta.url).pathname;
const html=`<!doctype html><style>body{margin:0;background:#20292a}canvas{width:768px;height:768px}</style><canvas id="canvas" width="512" height="512"></canvas>
<script type="importmap">{"imports":{"three":"/prototypes/PROTOTYPE-optics/vendor/three.module.js","HDRLoader":"/prototypes/PROTOTYPE-optics/vendor/HDRLoader.js","rapier":"/prototypes/PROTOTYPE-optics/vendor/rapier.js"}}</script>
<script type="module">
import {createPBRChipView} from '/prototypes/PROTOTYPE-realism/elving/pbr-chips-view.mjs';
import {createChipPhysics} from '/prototypes/PROTOTYPE-realism/elving/chips-physics.mjs';
import RAPIER from 'rapier';
try {
await RAPIER.init();
const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true});
const cad=await(await fetch('/prototypes/PROTOTYPE-optics/assets/cad.json')).json();
const physics=createChipPhysics(RAPIER,cad,{count:124});
const bytes=await(await fetch('/prototypes/PROTOTYPE-optics/assets/studio_small_08_1k.hdr')).arrayBuffer();
const view=await createPBRChipView(gl,{environmentBytes:bytes});view.setGeometry(physics.chips);
const source=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,source);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
const pixels=new Uint8Array(512*512*4);for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4,v=((x>>5)+(y>>5))%2?208:244;pixels.set([v,v,Math.min(255,v+5),255],i);}
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,512,512,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
const fb=gl.createFramebuffer();
const draw=(options={})=>{const result=view.render(source,physics.poses(),{size:512,intensity:1.2,...options});
gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,result.texture,0);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);gl.blitFramebuffer(0,0,512,512,0,0,512,512,gl.COLOR_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return result;};
const sample=()=>{const p=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,p);let sum=0,hash=2166136261;for(let i=0;i<p.length;i+=4){sum+=(p[i]+p[i+1]+p[i+2])/3;hash=Math.imul(hash^p[i],16777619);}return {mean:sum/(512*512),hash:hash>>>0,unique:new Set(p).size};};
draw();gl.finish();const initial=sample();draw({smooth:false});gl.finish();const flat=sample();draw({sourceLinear:true});gl.finish();const linearSource=sample();draw({lightDeg:80});gl.finish();const rotated=sample();
draw({layers:1});gl.finish();const single=sample();const times=[];
for(let i=0;i<8;i++){physics.step(1/60);draw();gl.finish();}
for(let i=0;i<30;i++){const t=performance.now();physics.step(1/60);draw();gl.finish();times.push(performance.now()-t);}
times.sort((a,b)=>a-b);const result=draw();gl.finish();
window.CHECK={ready:true,initial,flat,linearSource,rotated,single,final:sample(),drawCalls:result.drawCalls,p95Ms:times[Math.ceil(times.length*.95)-1],meanMs:times.reduce((a,b)=>a+b)/times.length,glError:gl.getError(),renderer:gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)};
}catch(error){window.CHECK={ready:true,error:error.stack};}
</script>`;
const server=createServer((req,res)=>{try{if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const file=resolve(root,'.'+decodeURIComponent(req.url));if(!file.startsWith(root))throw Error('Path outside project');res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(readFileSync(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const profile=mkdtempSync(join(tmpdir(),'pbr-check-')),debug=9465;
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${debug}`,`--user-data-dir=${profile}`,'--window-size=800,850','--no-first-run','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
try{
 for(let i=0;i<100;i++){try{await fetch(`http://127.0.0.1:${debug}/json/version`);break;}catch{await sleep(100);}}
 const target=await(await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);};
 await send('Runtime.enable');await send('Page.enable');await send('Log.enable');await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
 for(let i=0;i<200;i++){if(await evaluate('!!window.CHECK?.ready'))break;await sleep(100);}
 const result=await evaluate('window.CHECK');assert(result,'Browser check did not finish');assert(!result.error,result.error);
 const shot=await send('Page.captureScreenshot',{format:'png'});const path=join(tmpdir(),'pbr-material-check.png');writeFileSync(path,Buffer.from(shot.data,'base64'));
 assert.equal(result.glError,0);assert(result.initial.unique>80);assert.notEqual(result.initial.hash,result.flat.hash);assert.notEqual(result.initial.hash,result.linearSource.hash);assert.notEqual(result.initial.hash,result.rotated.hash);assert.notEqual(result.initial.hash,result.single.hash);assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({...result,screenshot:path,errors},null,2));
}finally{ws?.close();chrome.kill();server.close();await sleep(250);rmSync(profile,{recursive:true,force:true});}
