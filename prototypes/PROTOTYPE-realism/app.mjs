import RAPIER from 'rapier';
import {chamberFromCAD,HYPOTHESIS,BASE_SHA,volumeMm3} from './geometry.mjs';
import {LabPhysics} from './physics.mjs';
import {LabView} from './view.mjs';
try {
 await RAPIER.init();
 const chamber=chamberFromCAD(CAD);const physics=new LabPhysics(RAPIER,chamber,2);const view=new LabView(document.querySelector('canvas'),chamber,physics);
 document.querySelector('#hypothesis').textContent=HYPOTHESIS;
 document.querySelector('#cad').textContent=`CAD: внутренний Ø${(chamber.radiusMm*2).toFixed(1)} мм; верх эльвинга ${chamber.floorEnvelopeMm.toFixed(1)}, низ диска ${chamber.ceilingMm.toFixed(1)} мм. Номинальный зазор ${chamber.nominalGapMm.toFixed(1)} мм.`;
 const $=id=>document.getElementById(id);let dirty=true,last=performance.now(),acc=0;
 function refresh(){const s=physics.snapshot();$('state').textContent=s.paused?'Пауза, позы сохранены':s.moving?'Стёкла движутся':'Сон, решатель остановлен';$('steps').textContent=`Шагов физики: ${s.steps}`;
  $('audit').textContent=physics.geometryAudit().map((a,i)=>{const visual=volumeMm3(physics.chips[i].vertices,physics.chips[i].indices);return `№${a.id+1}: видимый ${visual.toFixed(2)}, коллайдер ${a.colliderVolumeMm3.toFixed(2)} мм³; отношение ${(a.colliderVolumeMm3/visual).toFixed(3)}; внешний радиус 0 мм`;}).join('\n');
 }
 $('count').onchange=()=>{physics.reset(Number($('count').value));view.rebuild();dirty=true;};
 $('colliders').onchange=()=>{view.showColliders=$('colliders').checked;dirty=true;};
 const orient=()=>{physics.orient(Number($('roll').value),Number($('tilt').value));$('angles').textContent=`Поворот ${$('roll').value}°, наклон ${$('tilt').value}°`;dirty=true;};$('roll').oninput=orient;$('tilt').oninput=orient;
 $('shake').onclick=()=>{physics.shake();dirty=true;};$('pause').onclick=()=>{physics.setPaused(!physics.paused);$('pause').textContent=physics.paused?'Продолжить':'Пауза';dirty=true;};
 $('side').onclick=()=>{view.side=!view.side;dirty=true;};$('reset').onclick=()=>{physics.reset(Number($('count').value));view.rebuild();dirty=true;};
 $('poses').onclick=()=>{$('pose-data').hidden=false;$('pose-data').textContent=JSON.stringify(physics.snapshot(),null,2);};
 window.addEventListener('resize',()=>{view.resize();dirty=true;});
 window.REALISM={physics,chamber,view,baseSHA:BASE_SHA,snapshot:()=>physics.snapshot(),geometry:()=>physics.geometryAudit(),setCount:n=>{physics.reset(n);$('count').value=n;view.rebuild();dirty=true;},setPose:(roll,tilt)=>{$('roll').value=roll;$('tilt').value=tilt;orient();},pause:v=>{physics.setPaused(v);dirty=true;},shake:()=>{physics.shake();dirty=true;}};
 function frame(now){const elapsed=Math.min((now-last)/1000,.05);last=now;if(!document.hidden){acc+=elapsed;let changed=false;while(acc>=1/960){changed=physics.step(1)>0||changed;acc-=1/960;}if(changed||dirty){view.render();refresh();dirty=false;}}requestAnimationFrame(frame);}requestAnimationFrame(frame);
} catch(error){document.getElementById('error').hidden=false;document.getElementById('error').textContent=error.stack||String(error);console.error(error);}
