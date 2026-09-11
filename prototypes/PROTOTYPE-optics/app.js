// PROTOTYPE: local-only viewer. No uploads leave the browser.
import * as THREE from 'three';
import { FastOptics, createGlassMesh, colourGlass, clarityGlass, lightGlass, disposeGlass } from 'fast-optics';
import { OrbitControls } from 'orbit';
import { HDRLoader } from 'hdr';
import { Filling, makeShard, FIXED_STEP } from 'model';
const $=id=>document.getElementById(id);
function fail(message){$('error').hidden=false;$('error').textContent=message;$('status').textContent='Не удалось запустить 3D';}
window.addEventListener('error',e=>fail(e.message));
window.addEventListener('unhandledrejection',e=>fail(String(e.reason)));
try{init();}catch(e){fail('Для просмотра нужен WebGL 2. '+e.message);}
function init(){
 let dirty=true,sharpEnv=null,optics=null;
 const physics=new Filling(36);physics.shake();let mode='assembly',palette='jewel',fov=18,disposed=false;
 const palettes={jewel:['#80ac37','#f6c748','#ce2442','#205bbe'],forest:['#387148','#eab34a','#547ebc','#96b16a'],berry:['#c92c73','#7655bf','#eda145','#de626e']};
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;$('model-view').append(renderer.domElement);
 const scene=new THREE.Scene(),root=new THREE.Group(),assembly=new THREE.Group();scene.add(root);root.add(assembly);assembly.position.z=-100;
 const fill=new THREE.HemisphereLight(0xe1efdf,0x332216,3);scene.add(fill);
 const light=new THREE.DirectionalLight(0xffead6,4);light.position.set(-100,260,120);scene.add(light);const rim=new THREE.DirectionalLight(0xbedee2,3);rim.position.set(140,20,-80);scene.add(rim);
 // Opaque in-scene backdrop: the transmission pass samples what is behind the glass, so the page gradient must live inside the render.
 const backdrop=document.createElement('canvas');backdrop.width=backdrop.height=512;const bctx=backdrop.getContext('2d');const gradient=bctx.createRadialGradient(205,205,0,205,205,430);gradient.addColorStop(0,'#577068');gradient.addColorStop(.53,'#304b43');gradient.addColorStop(1,'#1c3530');bctx.fillStyle=gradient;bctx.fillRect(0,0,512,512);const backdropTexture=new THREE.CanvasTexture(backdrop);backdropTexture.colorSpace=THREE.SRGBColorSpace;scene.background=backdropTexture;
 const camera=new THREE.PerspectiveCamera(33,1,.1,2000);camera.position.set(350,150,375);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,0,0);controls.minDistance=35;controls.maxDistance=700;
 const meshParts={};
 for(const [name,part] of Object.entries(CAD)){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));g.setIndex(part.indices);g.computeVertexNormals();
  const glass=['elving','steklo','nasipka'].includes(name);
  const material=glass?new THREE.MeshPhysicalMaterial({color:0xe9f4f0,transmission:1,ior:1.5,thickness:1.2,roughness:.06,metalness:0,side:THREE.DoubleSide,clearcoat:.4}):new THREE.MeshPhysicalMaterial({color:name==='trubka'?0xf0dfc3:name==='prizma'?0xb7d4ce:0x563c2b,roughness:name==='prizma'?.12:.42,metalness:name==='prizma'?.85:0,side:THREE.DoubleSide,clearcoat:.15});
  const mesh=new THREE.Mesh(g,material);mesh.name=name;meshParts[name]=mesh;assembly.add(mesh);
 }
 const chamberGroup=new THREE.Group();assembly.add(chamberGroup);chamberGroup.position.z=0;
 const wallGeo=new THREE.CylinderGeometry(18.8,18.8,1,64,1,true);wallGeo.rotateX(Math.PI/2);wallGeo.translate(0,0,.5);
 const wall=new THREE.Mesh(wallGeo,new THREE.MeshPhysicalMaterial({color:0xbbdbce,transparent:true,opacity:.13,roughness:.1,side:THREE.DoubleSide,depthWrite:false}));chamberGroup.add(wall);wall.scale.z=physics.depth;
 const outlineMat=new THREE.LineBasicMaterial({color:0xb6d5bd,transparent:true,opacity:.5});
 const rings=[];for(const z of [0,1]){const points=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;points.push(new THREE.Vector3(18.8*Math.cos(a),18.8*Math.sin(a),z));}const ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),outlineMat);ring.scale.z=physics.depth;chamberGroup.add(ring);rings.push(ring);}
 const floor=new THREE.Mesh(new THREE.CircleGeometry(18.8,64),new THREE.MeshStandardMaterial({color:0xf6edda,side:THREE.DoubleSide,roughness:.6}));floor.position.z=.01;chamberGroup.add(floor);
 let shards=[];
 function rebuildShards(){
  for(const mesh of shards){chamberGroup.remove(mesh);disposeGlass(mesh);}shards=[];
  for(const [i,p] of physics.pieces.entries()){
   const shape=makeShard(p.sx,p.sy,p.h,i),pos=[],indices=[];
   shape.vertices.forEach(v=>pos.push(v.x,v.y,v.z));shape.faces.forEach(face=>{for(let j=1;j<face.length-1;j++)indices.push(face[0],face[j],face[j+1]);});
   const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));indexed.setIndex(indices);
   const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();
   const mesh=createGlassMesh(geometry,{colour:palettes[palette][p.color],thickness:p.h*2,clarity:Number($('clarity').value)});lightGlass(mesh,sharpEnv);chamberGroup.add(mesh);shards.push(mesh);
  }
  optics?.setShards(shards);dirty=true;
 }
 rebuildShards();
 const opticRenderer=new THREE.WebGLRenderer({antialias:false,alpha:true});opticRenderer.setPixelRatio(Math.min(devicePixelRatio,1.25));opticRenderer.setClearColor(0,0);opticRenderer.toneMapping=THREE.ACESFilmicToneMapping;opticRenderer.toneMappingExposure=1;$('optical-canvas').append(opticRenderer.domElement);
 optics=new FastOptics(opticRenderer);optics.setShards(shards);
 const pmrem=new THREE.PMREMGenerator(renderer);
 new HDRLoader().load(HDRI,hdr=>{sharpEnv=hdr.clone();sharpEnv.mapping=THREE.EquirectangularReflectionMapping;sharpEnv.needsUpdate=true;scene.environment=pmrem.fromEquirectangular(hdr).texture;scene.environmentIntensity=1;fill.intensity=.5;light.intensity=1.6;rim.intensity=.8;shards.forEach(mesh=>lightGlass(mesh,sharpEnv));hdr.dispose();pmrem.dispose();$('env').textContent='студийная HDRI загружена';dirty=true;},undefined,()=>{$('env').textContent='HDRI не загрузилась, только аналитический свет';});
 let renderErrors=0;for(const r of [renderer,opticRenderer])r.debug.onShaderError=()=>{renderErrors++;fail('Ошибка шейдера: оптический просмотр не запущен.');};
 controls.addEventListener('change',()=>{dirty=true;});
 document.addEventListener('click',()=>{dirty=true;});document.addEventListener('input',()=>{dirty=true;});
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart;
 renderer.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',e=>{if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(Object.values(meshParts).filter(m=>m.visible));if(hits[0]?.object.name==='glazok')setMode('eye');if(['elving','nasipka'].includes(hits[0]?.object.name))setMode('chamber');});
 function pose(){root.rotation.set((physics.tilt-90)*Math.PI/180,0,physics.roll*Math.PI/180,'XYZ');}
 function invalidate(){dirty=true;}
 function setMode(next){invalidate();mode=next;$('stage').classList.toggle('eye',mode==='eye');document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  for(const [name,mesh] of Object.entries(meshParts))mesh.visible=name!=='nasipka'&&mode!=='chamber'&&(mode!=='inside'||name!=='trubka');
  meshParts.prizma.material.transparent=mode==='inside';meshParts.prizma.material.opacity=mode==='inside'?.42:1;
  chamberGroup.visible=mode==='chamber'||mode==='inside';wall.visible=chamberGroup.visible;
  controls.target.set(0,0,0);root.position.set(0,0,0);
  if(mode==='chamber'){const focus=new THREE.Vector3(0,0,-95).applyQuaternion(root.quaternion);controls.target.copy(focus);camera.position.copy(focus).add(new THREE.Vector3(33,-22,66).applyQuaternion(root.quaternion));controls.minDistance=25;controls.maxDistance=200;}
  else{camera.position.set(350,150,375);controls.minDistance=130;controls.maxDistance=700;}
  controls.update();
  const copy={assembly:['АВТОРСКИЙ / СОБРАННАЯ МОДЕЛЬ','Каждая деталь на своём месте'],inside:['ВНУТРЕННЯЯ СБОРКА / КОРПУС СКРЫТ','Три зеркала и камера со стёклышками'],chamber:['КАМЕРА НАСЫПКИ / УВЕЛИЧЕННЫЙ ВИД','Стёклышки, которые действительно движутся'],eye:['ВЗГЛЯД ЧЕРЕЗ ГЛАЗОК','Одна насыпка. Множество отражений.']}[mode];$('view-kicker').textContent=copy[0];$('view-title').textContent=copy[1];$('gesture').textContent=mode==='eye'?'Тяните по узору: вбок поворот, вверх-вниз наклон · или встряхните':'Тяните для вращения · колесо для приближения';updateUI();resize();
 }
 function updateUI(){const s=physics.state();$('roll').value=s.roll;$('tilt').value=s.tilt;$('roll-out').value=s.roll+'°';$('tilt-out').value=s.tilt+'°';$('fov-out').value=fov+'°';$('fov').value=fov;$('count').value=s.count;$('count-label').textContent=s.count+' шт.';$('pause').textContent=s.paused?'Продолжить':'Пауза';$('moving').textContent=s.paused?'На паузе':s.count===0?'Камера пуста':s.shaking?'Встряхивание…':s.moving>0?s.moving+' в движении':'Стёклышки улеглись';$('containment').textContent=s.escaped?'Есть выход за стенку':'Все внутри';$('status').textContent=s.paused?'Симуляция приостановлена':s.count===0?'Пустая камера · отражения работают':'Физика и оптика связаны';$('scenario-state').textContent=`${s.count} стёклышек · поворот ${s.roll}° · наклон ${s.tilt}° · ${s.paused?'пауза':'движение разрешено'}`;}
 function reset(count=36){$('clarity').value=2.5;$('clarity-out').value='Витражное';physics.depth=10;physics.reset(count,71);updateDepth();palette='jewel';fov=18;optics.setFov(fov);document.querySelectorAll('[data-palette]').forEach(b=>b.classList.toggle('selected',b.dataset.palette===palette));clearLogo();rebuildShards();pose();updateUI();}
 function orient(roll,tilt){invalidate();const offset=camera.position.clone().sub(controls.target).applyQuaternion(root.quaternion.clone().invert());physics.setOrientation(roll,tilt);pose();if(mode==='chamber'){const target=new THREE.Vector3(0,0,-95).applyQuaternion(root.quaternion);controls.target.copy(target);camera.position.copy(target).add(offset.applyQuaternion(root.quaternion));}updateUI();}
 function updateDepth(){chamberGroup.position.z=0;wall.scale.z=physics.depth;rings.forEach(r=>r.scale.z=physics.depth);}

 $('clarity').oninput=()=>{invalidate();const distance=Number($('clarity').value);shards.forEach(m=>clarityGlass(m,distance));$('clarity-out').value=distance<2.5?'Насыщенное':distance<6?'Витражное':'Светлое';};
 $('count').addEventListener('change',()=>{invalidate();const r=physics.roll,t=physics.tilt;physics.reset(Number($('count').value),71);rebuildShards();orient(r,t);});
 $('shake').onclick=()=>{invalidate();physics.paused=false;physics.shake();updateUI();};$('pause').onclick=()=>{invalidate();physics.paused=!physics.paused;updateUI();};$('reset').onclick=()=>{reset();setMode('assembly');};$('turn').onclick=()=>orient(((physics.roll+225)%360)-180,physics.tilt);
 $('roll').oninput=()=>orient(Number($('roll').value),physics.tilt);$('tilt').oninput=()=>orient(physics.roll,Number($('tilt').value));$('fov').oninput=()=>{invalidate();fov=Number($('fov').value);optics.setFov(fov);updateUI();};
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('enlarge').onclick=()=>setMode('eye');
 const optic=$('optical-canvas');let drag=null;optic.style.touchAction='none';optic.style.cursor='grab';
 optic.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,roll:physics.roll,tilt:physics.tilt};optic.setPointerCapture(e.pointerId);optic.style.cursor='grabbing';});
 optic.addEventListener('pointermove',e=>{if(!drag)return;const k=180/optic.clientWidth;const roll=((drag.roll+(e.clientX-drag.x)*k+540)%360)-180,tilt=Math.max(0,Math.min(180,drag.tilt-(e.clientY-drag.y)*k));orient(Math.round(roll),Math.round(tilt));});
 const endDrag=()=>{drag=null;optic.style.cursor='grab';};optic.addEventListener('pointerup',endDrag);optic.addEventListener('pointercancel',endDrag);
 document.querySelectorAll('[data-palette]').forEach(b=>b.onclick=()=>{invalidate();palette=b.dataset.palette;document.querySelectorAll('[data-palette]').forEach(x=>x.classList.toggle('selected',x===b));shards.forEach((m,i)=>colourGlass(m,palettes[palette][i%4]));updateUI();});
 let logoPlane=null,logoTexture=null,logoTicket=0;
 function clearLogo(){invalidate();logoTicket++;if(logoPlane){chamberGroup.remove(logoPlane);logoPlane.geometry.dispose();logoPlane.material.dispose();logoPlane=null;}if(logoTexture)logoTexture.dispose();logoTexture=null;optics.setLogo(null);$('logo').value='';$('logo-status').textContent='Логотип не загружен';}
 $('logo-clear').onclick=clearLogo;
 $('logo').onchange=()=>loadLogo($('logo').files[0]);
 async function loadLogo(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){$('logo-status').textContent='Выберите PNG, JPEG или WebP до 10 МБ.';return;}const ticket=++logoTicket;try{const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d');const k=Math.min(1024/bitmap.width,1024/bitmap.height);ctx.drawImage(bitmap,(1024-bitmap.width*k)/2,(1024-bitmap.height*k)/2,bitmap.width*k,bitmap.height*k);bitmap.close();if(ticket!==logoTicket)return;clearLogo();const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;logoTexture=texture;optics.setLogo(texture);logoPlane=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));logoPlane.renderOrder=1;logoPlane.position.z=.05;chamberGroup.add(logoPlane);$('logo-status').textContent=file.name+' · только в этом браузере';}catch(e){$('logo-status').textContent='Не удалось прочитать изображение.';}};
 $('logo-example').onclick=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#133851';ctx.font='bold 190px sans-serif';ctx.fillText('F',48,203);ctx.fillStyle='#c5323b';ctx.fillRect(173,181,34,34);canvas.toBlob(blob=>loadLogo(new File([blob],'Пример F.png',{type:'image/png'})));};
 const scenarios={motion:{help:'Сравните положение стёкол и отражения после встряхивания и наклона. Это одна и та же насыпка.',steps:[['1. Посмотреть насыпку',()=>setMode('chamber')],['2. Встряхнуть',()=>{physics.shake();setMode('chamber');}],['3. Заглянуть в глазок',()=>setMode('eye')],['4. Наклонить на 45°',()=>orient(90,45)]]},empty:{help:'Без стёклышек остаётся светлое поле. Поворот не должен создавать цветной узор из ничего.',steps:[['1. Убрать насыпку',()=>{reset(0);setMode('eye');}],['2. Встряхнуть пустую',()=>physics.shake()],['3. Вернуть 24 стёклышка',()=>{reset(24);setMode('eye');}]]},pause:{help:'Пауза останавливает тела. Смена вида сохраняет их положения; сброс возвращает исходный набор.',steps:[['1. Встряхнуть',()=>{physics.shake();setMode('chamber');}],['2. Остановить',()=>{physics.paused=true;}],['3. Посмотреть через глазок',()=>setMode('eye')],['4. Продолжить',()=>{physics.paused=false;}],['5. Сбросить',()=>{reset();setMode('assembly');}]]}};
 document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{reset();setMode('assembly');const scenario=scenarios[b.dataset.scenario];$('scenario-help').textContent=scenario.help;$('scenario-steps').replaceChildren();const buttons=scenario.steps.map(([label,action],index)=>{const button=document.createElement('button');button.textContent=label;button.disabled=index!==0;button.onclick=()=>{action();updateUI();button.disabled=true;if(buttons[index+1])buttons[index+1].disabled=false;};$('scenario-steps').append(button);return button;});});
 let modelWidth=0,modelHeight=0,opticSize=0;
 function resize(){invalidate();const rect=$('model-view').getBoundingClientRect(),op=$('optical-canvas').getBoundingClientRect();renderer.setPixelRatio(mode==='chamber'?Math.min(1,640/Math.max(rect.width,1)):Math.min(devicePixelRatio,1.25));opticRenderer.setPixelRatio(Math.min(devicePixelRatio,600/Math.max(op.width,1)));if(rect.width&&rect.height&&(rect.width!==modelWidth||rect.height!==modelHeight)){modelWidth=rect.width;modelHeight=rect.height;renderer.setSize(modelWidth,modelHeight,false);camera.aspect=modelWidth/modelHeight;camera.updateProjectionMatrix();}if(op.width&&op.width!==opticSize){opticSize=op.width;opticRenderer.setSize(opticSize,opticSize,false);}}
 const observer=new ResizeObserver(resize);observer.observe($('model-view'));observer.observe($('optical-canvas'));pose();setMode('assembly');
 let last=performance.now(),acc=0,lastState=0,frames=0,fpsTime=last,rendered=0,frameTimes=[],draws=0,wasActive=false,motionFrames=0,motionMillis=0;
 function frame(now){
  if(disposed)return;
  const elapsed=now-last;last=now;frameTimes.push(elapsed);if(frameTimes.length>120)frameTimes.shift();
  const active=!physics.paused&&(physics.shaking()||physics.pieces.some(p=>p.body.sleepState!==2));
  if(active){if(!wasActive){motionFrames=0;motionMillis=0;}motionFrames++;motionMillis+=elapsed;}wasActive=active;
  if(active){acc=Math.min(acc+Math.min(elapsed/1000,.05),16*FIXED_STEP);let substeps=0;while(acc>=FIXED_STEP&&substeps<16){physics.step();acc-=FIXED_STEP;substeps++;}}else acc=0;
  controls.update();
  if(dirty||active){
   physics.pieces.forEach((p,i)=>{shards[i].position.copy(p.body.position).multiplyScalar(10);shards[i].quaternion.copy(p.body.quaternion);});
   if(dirty||mode==='chamber'||mode==='inside')renderer.render(scene,camera);
   optics.render(root.quaternion,physics.roll);dirty=false;rendered++;draws++;
  }
  frames++;if(now-lastState>350){updateUI();lastState=now;}
  if(now-fpsTime>1000){
   const fps=Math.round(frames*1000/(now-fpsTime)),sorted=[...frameTimes].sort((a,b)=>a-b);
   const node=$('fps');node.textContent=rendered?fps+' fps':'Покой · без перерисовки';
   node.dataset.motionFps=String(Math.round(motionFrames*1000/Math.max(1,motionMillis)));node.dataset.motionFrames=String(motionFrames);node.dataset.motionDurationMs=String(Math.round(motionMillis));node.dataset.physicsTick=String(physics.tick);node.dataset.settled=String(physics.settled);node.dataset.fps=String(fps);node.dataset.p95=String(Math.round(sorted[Math.floor(sorted.length*.95)]||0));node.dataset.draws=String(draws);node.dataset.sourcePasses=String(optics.sourcePasses);node.dataset.mirrorPasses=String(optics.mirrorPasses);
   fpsTime=now;frames=0;rendered=0;
  }
  requestAnimationFrame(frame);
 }
 document.addEventListener('visibilitychange',()=>{last=performance.now();acc=0;dirty=true;});requestAnimationFrame(frame);
 // Read-only diagnostics used by the walkthrough, with no mutation interface.
 window.PROTOTYPE=Object.freeze({snapshot:()=>({mode,palette,fov,...physics.state(),shaderErrors:renderErrors,parts:Object.keys(CAD),positions:physics.pieces.map(p=>[p.body.position.x,p.body.position.y,p.body.position.z]),orientations:physics.pieces.map(p=>[p.body.quaternion.x,p.body.quaternion.y,p.body.quaternion.z,p.body.quaternion.w])})});
 window.addEventListener('pagehide',()=>{disposed=true;physics.dispose();optics.dispose();if(sharpEnv)sharpEnv.dispose();observer.disconnect();controls.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});renderer.dispose();opticRenderer.dispose();});
}
