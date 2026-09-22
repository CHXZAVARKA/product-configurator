import RAPIER from 'rapier';
import {AUTHOR_FILL_COLORS,AUTHOR_FILL_MASS_G,createChipPhysics} from './chips-physics.mjs';
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
 const state={mode:'prism',turn:0,tilt:0,light:55,intensity:2.2,glow:.65,lightAuto:false,fov:32,smooth:true,auto:false,quality:'auto',background:'world',resolution:1024,filling:true,count:36,paused:false,elving:false,showColliders:false,bulk:.65,depth:.75,edgeChips:.6,detail:.4,studyTurn:0,studyTilt:0,studyMaterial:'glass'};
 let raf=null,lastTime=0,frames=0,sourcePasses=0,lastSource=null,sourceDirty=true,measuring=false,uploadImage=null,lastFrameMs=null,qualityChecked=false,lastBenchmark=null,chipDirty=true,lastChips=null,cadPasses=0;
 const background=document.createElement('canvas');background.width=background.height=1024;
 const ctx=background.getContext('2d');
 $('fill-mass').textContent=AUTHOR_FILL_MASS_G.toLocaleString('ru-RU')+' г';
 $('fill-colors').textContent=AUTHOR_FILL_COLORS.length+' цветов';
 $('fill-spec-list').replaceChildren(...AUTHOR_FILL_COLORS.map(item=>{
  const row=document.createElement('div'),swatch=document.createElement('i'),name=document.createElement('span'),size=document.createElement('small');
  row.className='fill-spec-item';swatch.style.background=`rgb(${item.rgb.map(value=>Math.round(value*255)).join(' ')})`;name.textContent=item.name;size.textContent=item.fractionMm+' мм';row.append(swatch,name,size);return row;
 }));
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
  for(const key of ['bulk','depth','edgeChips','detail']){$(key).value=state[key];$(key+'-value').textContent=Math.round(state[key]*100)+'%';}
  $('study').setAttribute('aria-pressed',String(state.mode==='study'));$('study-material-control').hidden=state.mode!=='study';$('study-material').value=state.studyMaterial;
  for(const key of ['pause','filling','count'])$(key).disabled=state.mode==='study';
  $('pause').hidden=state.mode==='study';
  for(const key of ['count','turn','tilt','fov','filling'])$(key).closest('label').hidden=state.mode==='study';
  $('prism').setAttribute('aria-pressed',String(state.mode==='prism'));$('glass').setAttribute('aria-pressed',String(state.mode==='glass'));$('stage').classList.toggle('direct',state.mode!=='prism');
  $('animate-light').textContent=state.lightAuto?'Остановить свет':'Вращать HDRI';$('animate-light').setAttribute('aria-pressed',String(state.lightAuto));
  $('animate').textContent=state.auto?'Остановить':'Вращать';$('animate').setAttribute('aria-pressed',String(state.auto));
 }
 function draw(forceSource=false){
  if(sourceDirty||forceSource||!lastSource){if(state.elving){if(!glass){glass=createRealtimeGlass(gl,CAD);glass.setBackground(background);}cadPasses++;lastSource=glass.render({rotationDeg:[0,state.filling?0:state.tilt,state.turn],viewDeg:0,lightDeg:state.light,intensity:state.intensity,smooth:state.smooth,size:state.resolution});}else lastSource=backdrop.render({world:state.background==='world',linearOutput:state.filling&&state.background==='world',yawDeg:state.light,rollDeg:0,tiltDeg:0,intensity:state.intensity,size:state.resolution});sourceDirty=false;sourcePasses++;chipDirty=true;}
  if((state.filling||state.mode==='study')&&(chipDirty||forceSource||!lastChips)){lastChips=chipView.render(lastSource.texture,physics.poses(),{size:state.mode==='study'?768:state.resolution,lightDeg:state.light,intensity:state.intensity,smooth:state.smooth,rollDeg:state.turn,tiltDeg:state.tilt,sourceLinear:!state.elving&&state.background==='world',glow:state.glow,showColliders:state.showColliders,study:state.mode==='study',studyTurn:state.studyTurn,studyTilt:state.studyTilt,studyMaterial:state.studyMaterial});chipDirty=false;}
  view.draw(state.filling||state.mode==='study'?lastChips.texture:lastSource.texture,{mode:state.mode,fovDeg:state.fov,rollDeg:state.turn});frames++;
 }
 function requestDraw(changed=true){if(changed)sourceDirty=true;if(raf===null&&!measuring)raf=requestAnimationFrame(frame);}
 function frame(now){
  raf=null;if(document.hidden){lastTime=0;return;}
  if(state.auto&&lastTime){const dt=Math.min((now-lastTime)/1000,.1);if(state.mode==='study')state.studyTurn=(state.studyTurn+dt*24)%360;else{state.turn=(state.turn+dt*14)%360;if(state.elving)sourceDirty=true;}chipDirty=true;lastFrameMs=now-lastTime;}
  const dt=lastTime?Math.min((now-lastTime)/1000,1/30):1/60;
  if(state.lightAuto){state.light=(state.light+dt*22)%360;sourceDirty=true;chipDirty=true;lastFrameMs=lastTime?now-lastTime:0;}
  if(state.mode!=='study')physics.orient(state.turn,state.tilt);
  if(state.mode!=='study'&&state.filling&&!state.paused&&physics.step(dt))chipDirty=true;
  lastTime=now;draw();controls();
  const renderedSize=state.mode==='study'?768:state.filling?lastChips?.size:lastSource?.size;
  $('status').textContent=((state.auto||state.lightAuto)&&lastFrameMs?`${Math.round(1000/lastFrameMs)} кадров/с · `:'')+(state.mode==='study'?'Образцы · 768²':`${renderedSize||state.resolution}² · PBR · ${state.elving?'с эльвингом':'без эльвинга'}`);
  $('physics-status').textContent=state.mode==='study'?'Шесть образцов · перетаскивайте для осмотра':!state.filling?'Насыпка скрыта':state.paused?'Физика на паузе':physics.snapshot().moving?'Стёкла пересыпаются':'Стёкла успокоились · физика спит';
  if(!qualityChecked){qualityChecked=true;setTimeout(()=>calibrate(),0);}
  if(state.auto||state.lightAuto||(state.mode!=='study'&&state.filling&&!state.paused&&physics.snapshot().moving))requestDraw(false);else lastTime=0;
 }
 const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
 async function benchmark(samples=30,{retraceCAD=state.auto}={}){
  if(measuring)return null;measuring=true;if(raf!==null)cancelAnimationFrame(raf);raf=null;
  const times=[];try{
   draw(true);gl.finish();
   for(let i=0;i<samples;i++){await new Promise(resolve=>requestAnimationFrame(resolve));const start=performance.now();if(state.lightAuto){state.light=(state.light+22/60)%360;sourceDirty=true;}if(state.mode!=='study'&&state.filling&&!state.paused&&physics.step(1/60))chipDirty=true;draw(retraceCAD);gl.finish();times.push(performance.now()-start);}
   const extension=gl.getExtension('WEBGL_debug_renderer_info');lastBenchmark={sourceSize:state.resolution,outputSize:[canvas.width,canvas.height],samples,p95Ms:p95(times),meanMs:times.reduce((s,v)=>s+v,0)/times.length,method:(retraceCAD||state.lightAuto)?'Rapier + moving source + HDR PBR + bloom + mirrors, gl.finish':'Rapier + cached source + HDR PBR + bloom + mirrors, gl.finish',renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),mode:state.mode,smooth:state.smooth,filling:state.filling,elving:state.elving,lightAuto:state.lightAuto,glow:state.glow,cadPasses,count:state.count,physics:physics.snapshot()};
   $('measurement').textContent=`p95 ${lastBenchmark.p95Ms.toFixed(1)} мс · ${state.resolution}² → ${canvas.width}². Физика, стекло и зеркала, с ожиданием GPU.`;
   return {...lastBenchmark};
  }finally{measuring=false;lastTime=0;requestDraw(false);}
 }
 async function calibrate(){
  if(state.quality!=='auto')return;
  for(const size of [1024,768,512]){state.resolution=size;sourceDirty=true;const result=await benchmark(8);if(!result||state.quality!=='auto')break;if(result.p95Ms<=30)break;}
  requestDraw();
 }
 function set(options){
  const previous={...state};Object.assign(state,options);
  if(options.quality){state.resolution=options.quality==='auto'?1024:Number(options.quality);if(options.quality==='auto')setTimeout(calibrate,0);}
  if(options.background&&options.background!==previous.background)updateBackground();
  const newBodies=options.count!==undefined||options.bulk!==undefined;
  if(newBodies){physics.reset(state.count,{bulk:state.bulk});state.count=physics.chips.length;}
  if(newBodies||['depth','edgeChips','detail'].some(k=>options[k]!==undefined))chipView.setGeometry(physics.chips,{depth:state.depth,edgeChips:state.edgeChips,detail:state.detail});
  if(state.mode!=='study'&&(options.turn!==undefined||options.tilt!==undefined))physics.orient(state.turn,state.tilt);
  if(options.mode!==undefined){state.auto=false;if(state.mode==='study')$('shape-settings').open=true;lastTime=0;}
  const sourceInputsChanged=Object.keys(options).some(k=>!['turn','tilt','auto','lightAuto','mode','fov','glow','studyTurn','studyTilt','studyMaterial','detail','depth','edgeChips'].includes(k));
  const elvingPoseChanged=state.elving&&(options.turn!==undefined||options.tilt!==undefined);
  chipDirty=true;controls();requestDraw(sourceInputsChanged||elvingPoseChanged);
 }
 for(const key of ['turn','tilt','light','intensity','glow','fov'])$(key).addEventListener('input',e=>set({[key]:Number(e.target.value)}));
 $('smooth').onchange=e=>set({smooth:e.target.checked});$('prism').onclick=()=>set({mode:'prism'});$('glass').onclick=()=>set({mode:'glass'});$('study').onclick=()=>set({mode:'study'});$('study-material').onchange=e=>set({studyMaterial:e.target.value});
 for(const key of ['bulk','depth','edgeChips','detail']){$(key).oninput=e=>$(key+'-value').textContent=Math.round(Number(e.target.value)*100)+'%';$(key).onchange=e=>set({[key]:Number(e.target.value)});}
 $('animate-light').onclick=()=>set({lightAuto:!state.lightAuto,background:'world'});
 $('animate').onclick=()=>set({auto:!state.auto});$('quality').onchange=e=>set({quality:e.target.value});$('background').onchange=e=>set({background:e.target.value});
 $('reset').onclick=()=>set({turn:0,tilt:0,light:55,intensity:2.2,glow:.65,lightAuto:false,fov:32,smooth:true,auto:false,paused:false,count:state.count,bulk:.65,depth:.75,edgeChips:.6,detail:.4,studyTurn:0,studyTilt:0});
 $('show-colliders').onchange=e=>set({showColliders:e.target.checked});$('elving').onchange=e=>set({elving:e.target.checked});$('filling').onchange=e=>set({filling:e.target.checked});$('count').onchange=e=>set({count:Number(e.target.value)});$('count').oninput=e=>$('count-value').textContent=e.target.value+' шт.';
 $('shake-viewer').onclick=$('shake').onclick=()=>{if(state.mode==='study')set({mode:'glass'});set({paused:false,filling:true});physics.orient(state.turn,state.tilt);physics.shake();requestDraw(false);};$('pause').onclick=()=>set({paused:!state.paused});$('measure').onclick=()=>benchmark();
 $('upload').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const next=await createImageBitmap(file);uploadImage?.close();uploadImage=next;$('background').querySelector('[value=upload]').disabled=false;state.background='upload';updateBackground();controls();requestDraw();$('error').hidden=true;}
  catch{$('error').textContent='Не удалось открыть изображение. Попробуйте PNG, JPEG или WebP.';$('error').hidden=false;}
 };
 let drag=null;
 const pointerAngle=e=>{
  const bounds=canvas.getBoundingClientRect(),x=e.clientX-bounds.left-bounds.width/2,y=e.clientY-bounds.top-bounds.height/2;
  return Math.hypot(x,y)<Math.max(18,bounds.width*.04)?null:Math.atan2(y,x);
 };
 canvas.onpointerdown=e=>{
  if(e.button!==0||drag)return;
  canvas.setPointerCapture(e.pointerId);
  drag={pointerId:e.pointerId,mode:state.mode,x:e.clientX,y:e.clientY,turn:state.studyTurn,tilt:state.studyTilt,angle:pointerAngle(e)};
  set(state.mode==='study'?{auto:false}:{auto:false,lightAuto:false});
 };
 canvas.onpointermove=e=>{
  if(!drag||drag.pointerId!==e.pointerId)return;
  if(drag.mode==='study'){
   set({studyTurn:(drag.turn+(e.clientX-drag.x)*.55+720)%360,studyTilt:Math.max(-70,Math.min(70,drag.tilt+(e.clientY-drag.y)*.2))});return;
  }
  const angle=pointerAngle(e);
  if(angle!==null&&drag.angle!==null){
   const delta=Math.atan2(Math.sin(angle-drag.angle),Math.cos(angle-drag.angle));
   set({turn:(state.turn+delta*180/Math.PI+360)%360});
  }
  drag.angle=angle;
 };
 const releaseDrag=e=>{if(drag?.pointerId===e.pointerId)drag=null;};
 canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=releaseDrag;
 canvas.onkeydown=e=>{const actions={ArrowLeft:{turn:(state.turn+356)%360},ArrowRight:{turn:(state.turn+4)%360},ArrowUp:{tilt:Math.max(-70,state.tilt-2)},ArrowDown:{tilt:Math.min(70,state.tilt+2)},' ':{auto:!state.auto}};if(actions[e.key]){e.preventDefault();const action=actions[e.key];if(state.mode==='study'&&e.key.startsWith('Arrow'))set({studyTurn:state.studyTurn+(e.key==='ArrowLeft'?-4:e.key==='ArrowRight'?4:0),studyTilt:Math.max(-70,Math.min(70,state.studyTilt+(e.key==='ArrowUp'?-2:e.key==='ArrowDown'?2:0)))});else set(action);}};
 window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden)requestDraw(false);});
 const pixels=()=>{const data=new Uint8Array(canvas.width*canvas.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
 const hash=()=>{let h=2166136261;for(const v of pixels()){h^=v;h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
 window.REALTIME={set,benchmark,hash,pixels,gl,prism,physics,snapshot:()=>({state:{...state},frames,sourcePasses,cadPasses,measuring,lastBenchmark,prism,physics:physics.snapshot(),surface:chipView.audit(),geometry:glass?.geometryAudit??null})};
 updateBackground();controls();resize();
}catch(error){$('error').textContent=error.message;$('error').hidden=false;console.error(error);}
