import RAPIER from 'rapier';
import {createChipPhysics} from './chips-physics.mjs';
import {createPBRChipView} from './pbr-chips-view.mjs';
import {createWorldBackdrop} from './world-backdrop.mjs';
import {createRealtimeGlass} from './realtime-glass.mjs';
import {createPrismView,prismFromCAD} from './prism-view.mjs';

const $=id=>document.getElementById(id),canvas=$('viewer');
try {
 await RAPIER.init();
 const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true});
 if(!gl)throw Error('Для просмотра нужен браузер с WebGL2.');
 let glass=null;
 const environmentBytes=Uint8Array.from(atob(ENVIRONMENT_BASE64),c=>c.charCodeAt(0)).buffer;
 const backdrop=createWorldBackdrop(gl,environmentBytes),prism=prismFromCAD(CAD),view=createPrismView(gl,prism);
 const physics=createChipPhysics(RAPIER,CAD,{count:36,sizeScale:1.5}),chipView=await createPBRChipView(gl,{environmentBytes});chipView.setGeometry(physics.chips);
 const state={mode:'prism',turn:0,tilt:0,light:55,intensity:2.2,glow:.65,lightAuto:false,fov:38,smooth:true,auto:false,quality:'auto',background:'world',resolution:256,filling:true,count:36,paused:false,elving:false,showColliders:false};
 let raf=null,lastTime=0,frames=0,sourcePasses=0,lastSource=null,sourceDirty=true,measuring=false,uploadImage=null,lastFrameMs=null,qualityChecked=false,lastBenchmark=null,chipDirty=true,lastChips=null,cadPasses=0;
 const background=document.createElement('canvas');background.width=background.height=1024;
 const ctx=background.getContext('2d');
 function updateBackground(){
  ctx.fillStyle='#f6f2e7';ctx.fillRect(0,0,1024,1024);
  const mm=v=>(v+55)/110*1024;
  if(state.background==='light'){
   const gradient=ctx.createRadialGradient(460,430,20,512,512,700);gradient.addColorStop(0,'#fffef8');gradient.addColorStop(1,'#d2dccd');ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,1024);
  }else if(state.background==='upload'&&uploadImage){
   const ratio=Math.min(330/uploadImage.width,330/uploadImage.height),w=uploadImage.width*ratio,h=uploadImage.height*ratio;
   ctx.drawImage(uploadImage,512-w/2,512-h/2,w,h);
  }else{
   for(let i=-22;i<=22;i++){ctx.strokeStyle=i%2?'#c2cac0':'#687b72';ctx.lineWidth=i%2?1.1:2.1;ctx.beginPath();ctx.moveTo(mm(i*2.5),0);ctx.lineTo(mm(i*2.5),1024);ctx.moveTo(0,mm(i*2.5));ctx.lineTo(1024,mm(i*2.5));ctx.stroke();}
   if(state.background==='color'){
    for(const [x,y,r,c] of [[-9,-8,5,'#08a8a4'],[8,-8,4.6,'#df4c8d'],[-8,8,4,'#e4b436'],[8,8,5,'#347fa9']]){ctx.fillStyle=c;ctx.beginPath();ctx.arc(mm(x),mm(y),r/110*1024,0,Math.PI*2);ctx.fill();}
   }
   ctx.fillStyle='#1b3b3d';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 58px system-ui';ctx.fillText(state.background==='color'?'СТЕКЛО':'ELVING',512,512);
  }
  backdrop.setImage(background);glass?.setBackground(background);sourceDirty=true;
 }
 function resize(){const width=Math.min(900,Math.round(canvas.getBoundingClientRect().width*Math.min(devicePixelRatio,1.5)));if(canvas.width!==width||canvas.height!==width){canvas.width=canvas.height=width;}requestDraw(false);}
 function controls(){
  for(const key of ['turn','tilt','light','intensity','glow','fov']){$(key).value=state[key];$(key+'-value').textContent=['intensity','glow'].includes(key)?state[key].toFixed(2):Math.round(state[key])+'°';}
  $('show-colliders').checked=state.showColliders;$('elving').checked=state.elving;$('filling').checked=state.filling;$('count').value=state.count;$('count-value').textContent=state.count+' шт.';$('pause').textContent=state.paused?'Продолжить физику':'Пауза физики';$('pause').setAttribute('aria-pressed',String(state.paused));
  $('smooth').checked=state.smooth;$('quality').value=state.quality;$('background').value=state.background;
  $('prism').setAttribute('aria-pressed',String(state.mode==='prism'));$('glass').setAttribute('aria-pressed',String(state.mode==='glass'));$('stage').classList.toggle('direct',state.mode==='glass');
  $('animate-light').textContent=state.lightAuto?'Остановить свет':'Вращать HDRI';$('animate-light').setAttribute('aria-pressed',String(state.lightAuto));
  $('animate').textContent=state.auto?'Остановить':'Вращать';$('animate').setAttribute('aria-pressed',String(state.auto));
 }
 function draw(forceSource=false){
  if(sourceDirty||forceSource||!lastSource){if(state.elving){if(!glass){glass=createRealtimeGlass(gl,CAD);glass.setBackground(background);}cadPasses++;lastSource=glass.render({rotationDeg:[0,state.filling?0:state.tilt,state.turn],viewDeg:0,lightDeg:state.light,intensity:state.intensity,smooth:state.smooth,size:state.resolution});}else lastSource=backdrop.render({world:state.background==='world',linearOutput:state.filling&&state.background==='world',yawDeg:state.light,rollDeg:state.turn,tiltDeg:state.tilt,intensity:state.intensity,size:512});sourceDirty=false;sourcePasses++;chipDirty=true;}
  if(state.filling&&(chipDirty||forceSource||!lastChips)){lastChips=chipView.render(lastSource.texture,physics.poses(),{size:512,lightDeg:state.light,intensity:state.intensity,smooth:state.smooth,rollDeg:state.turn,tiltDeg:state.tilt,sourceLinear:!state.elving&&state.background==='world',glow:state.glow,showColliders:state.showColliders});chipDirty=false;}
  view.draw(state.filling?lastChips.texture:lastSource.texture,{mode:state.mode,fovDeg:state.fov});frames++;
 }
 function requestDraw(changed=true){if(changed)sourceDirty=true;if(raf===null&&!measuring)raf=requestAnimationFrame(frame);}
 function frame(now){
  raf=null;if(document.hidden){lastTime=0;return;}
  if(state.auto&&lastTime){const dt=Math.min((now-lastTime)/1000,.1);state.turn=(state.turn+dt*14)%360;sourceDirty=true;chipDirty=true;lastFrameMs=now-lastTime;}
  const dt=lastTime?Math.min((now-lastTime)/1000,1/30):1/60;
  if(state.lightAuto){state.light=(state.light+dt*22)%360;sourceDirty=true;chipDirty=true;lastFrameMs=lastTime?now-lastTime:0;}
  physics.orient(state.turn,state.tilt);
  if(state.filling&&!state.paused&&physics.step(dt))chipDirty=true;
  lastTime=now;draw();controls();
  $('status').textContent=((state.auto||state.lightAuto)&&lastFrameMs?`${Math.round(1000/lastFrameMs)} кадров/с · `:'')+`512² · PBR · ${state.elving?'с эльвингом':'без эльвинга'}`;
  $('physics-status').textContent=!state.filling?'Насыпка скрыта':state.paused?'Физика на паузе':physics.snapshot().moving?'Стёкла пересыпаются':'Стёкла успокоились · физика спит';
  if(!qualityChecked){qualityChecked=true;setTimeout(()=>calibrate(),0);}
  if(state.auto||state.lightAuto||(state.filling&&!state.paused&&physics.snapshot().moving))requestDraw(false);else lastTime=0;
 }
 const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
 async function benchmark(samples=30,{retraceCAD=state.auto}={}){
  if(measuring)return null;measuring=true;if(raf!==null)cancelAnimationFrame(raf);raf=null;
  const times=[];try{
   draw(true);gl.finish();
   for(let i=0;i<samples;i++){await new Promise(resolve=>requestAnimationFrame(resolve));const start=performance.now();if(state.lightAuto){state.light=(state.light+22/60)%360;sourceDirty=true;}if(state.filling&&!state.paused&&physics.step(1/60))chipDirty=true;draw(retraceCAD);gl.finish();times.push(performance.now()-start);}
   const extension=gl.getExtension('WEBGL_debug_renderer_info');lastBenchmark={sourceSize:state.resolution,outputSize:[canvas.width,canvas.height],samples,p95Ms:p95(times),meanMs:times.reduce((s,v)=>s+v,0)/times.length,method:(retraceCAD||state.lightAuto)?'Rapier + moving source + HDR PBR + bloom + mirrors, gl.finish':'Rapier + cached source + HDR PBR + bloom + mirrors, gl.finish',renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),mode:state.mode,smooth:state.smooth,filling:state.filling,elving:state.elving,lightAuto:state.lightAuto,glow:state.glow,cadPasses,count:state.count,physics:physics.snapshot()};
   $('measurement').textContent=`p95 ${lastBenchmark.p95Ms.toFixed(1)} мс · ${state.resolution}² → ${canvas.width}². Физика, стекло и зеркала, с ожиданием GPU.`;
   return {...lastBenchmark};
  }finally{measuring=false;lastTime=0;requestDraw(false);}
 }
 async function calibrate(){
  if(state.quality!=='auto')return;
  for(const size of [256,192,128,96]){state.resolution=size;sourceDirty=true;const result=await benchmark(8);if(!result||state.quality!=='auto')break;if(result.p95Ms<=30)break;}
  requestDraw();
 }
 function set(options){const previous={...state};Object.assign(state,options);if(options.quality){state.resolution=options.quality==='auto'?256:Number(options.quality);if(options.quality==='auto')setTimeout(calibrate,0);}if(options.background&&options.background!==previous.background)updateBackground();if(options.count!==undefined){physics.reset(options.count);state.count=physics.chips.length;chipView.setGeometry(physics.chips);chipDirty=true;}if(options.turn!==undefined||options.tilt!==undefined)physics.orient(state.turn,state.tilt);if(options.smooth!==undefined||options.glow!==undefined)chipDirty=true;controls();requestDraw(Object.keys(options).some(k=>!['auto','lightAuto','mode','fov','glow'].includes(k)));}
 for(const key of ['turn','tilt','light','intensity','glow','fov'])$(key).addEventListener('input',e=>set({[key]:Number(e.target.value)}));
 $('smooth').onchange=e=>set({smooth:e.target.checked});$('prism').onclick=()=>set({mode:'prism'});$('glass').onclick=()=>set({mode:'glass'});
 $('animate-light').onclick=()=>set({lightAuto:!state.lightAuto,background:'world'});
 $('animate').onclick=()=>set({auto:!state.auto});$('quality').onchange=e=>set({quality:e.target.value});$('background').onchange=e=>set({background:e.target.value});
 $('reset').onclick=()=>set({turn:0,tilt:0,light:55,intensity:2.2,glow:.65,lightAuto:false,fov:38,smooth:true,auto:false,paused:false,count:state.count});
 $('show-colliders').onchange=e=>set({showColliders:e.target.checked});$('elving').onchange=e=>set({elving:e.target.checked});$('filling').onchange=e=>set({filling:e.target.checked});$('count').onchange=e=>set({count:Number(e.target.value)});$('count').oninput=e=>$('count-value').textContent=e.target.value+' шт.';
 $('shake').onclick=()=>{physics.shake();state.paused=false;controls();requestDraw(false);};$('pause').onclick=()=>set({paused:!state.paused});$('measure').onclick=()=>benchmark();
 $('upload').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const next=await createImageBitmap(file);uploadImage?.close();uploadImage=next;$('background').querySelector('[value=upload]').disabled=false;state.background='upload';updateBackground();controls();requestDraw();$('error').hidden=true;}
  catch{$('error').textContent='Не удалось открыть изображение. Попробуйте PNG, JPEG или WebP.';$('error').hidden=false;}
 };
 let drag=null;
 canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,turn:state.turn,tilt:state.tilt};set({auto:false});};
 canvas.onpointermove=e=>{if(drag)set({turn:(drag.turn+(e.clientX-drag.x)*.55+720)%360,tilt:Math.max(-70,Math.min(70,drag.tilt+(e.clientY-drag.y)*.2))});};
 canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
 canvas.onkeydown=e=>{const actions={ArrowLeft:{turn:(state.turn+356)%360},ArrowRight:{turn:(state.turn+4)%360},ArrowUp:{tilt:Math.max(-70,state.tilt-2)},ArrowDown:{tilt:Math.min(70,state.tilt+2)},' ':{auto:!state.auto}};if(actions[e.key]){e.preventDefault();set(actions[e.key]);}};
 window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden)requestDraw(false);});
 const pixels=()=>{const data=new Uint8Array(canvas.width*canvas.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
 const hash=()=>{let h=2166136261;for(const v of pixels()){h^=v;h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
 window.REALTIME={set,benchmark,hash,pixels,gl,prism,physics,snapshot:()=>({state:{...state},frames,sourcePasses,cadPasses,measuring,lastBenchmark,prism,physics:physics.snapshot(),surface:chipView.audit(),geometry:glass?.geometryAudit??null})};
 updateBackground();controls();resize();
}catch(error){$('error').textContent=error.message;$('error').hidden=false;console.error(error);}
