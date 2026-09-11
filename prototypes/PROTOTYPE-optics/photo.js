// PROTOTYPE: animate one real photograph, no rigid bodies or generated glass.
class PhotoMotion {
 constructor(reduced=false){this.reset(reduced);}
 reset(reduced=false){this.mode='live';this.playing=!reduced;this.time=0;this.speed=.65;this.strength=.65;this.offset=[0,0];this.roll=0;}
 advance(dt){if(this.playing&&this.mode!=='original')this.time+=Math.min(dt,.05)*this.speed;}
}
const $=id=>document.getElementById(id),canvas=$('glass'),state=new PhotoMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
let dirty=true,last=performance.now(),draws=0,ready=false;
const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false});
function fail(message){$('error').hidden=false;$('error').textContent=message;}
function shader(kind,source){const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
try {
 if(!gl)throw Error('Для анимации нужен WebGL. Оригинал фотографии доступен слева.');
 const program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
 precision highp float;varying vec2 uv;uniform sampler2D photo;uniform float time,strength,roll,mode;uniform vec2 offset;
 mat2 rotation(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
 void main(){
  vec2 p=uv-.5;
  if(mode>1.5){gl_FragColor=texture2D(photo,uv);return;}
  if(mode>.5){
   // Fold a triangular lattice into one source triangle, including its mirrored copies.
   p=rotation(roll*.45)*p*5.6;
   for(int i=0;i<12;i++)for(int j=0;j<3;j++){
    vec2 n=j==0?vec2(0.,-1.):j==1?vec2(.8660254,.5):vec2(-.8660254,.5);
    float distance=dot(p,n)-.5;p-=2.*max(distance,0.)*n;
   }
   p*=.43;
  }else p*=.84;
  float t=time;
  // Small continuous deformations preserve the photograph's glass detail.
  vec2 flow=vec2(sin(p.y*9.+t*.71)+.45*sin(p.x*13.-t*.43),cos(p.x*8.-t*.57)+.4*sin(p.y*11.+t*.39));
  p+=flow*.012*strength;
  p=rotation(roll+.085*sin(t*.23)*strength)*p;
  vec2 drift=vec2(sin(t*.19),cos(t*.17)-1.)*.035*strength;
  vec2 sampleUV=.5+p+drift+offset*.055;
  // Mirrored wrapping keeps dragging continuous without stretching border pixels.
  sampleUV=1.-abs(mod(sampleUV,2.)-1.);
  vec3 color=texture2D(photo,sampleUV).rgb;
  gl_FragColor=vec4(color,1.);
 }`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 const uniforms=Object.fromEntries(['photo','time','strength','roll','mode','offset'].map(n=>[n,gl.getUniformLocation(program,n)]));
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 const image=new Image();image.onload=()=>{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);ready=true;dirty=true;update();};image.onerror=()=>fail('Не удалось прочитать встроенную фотографию.');image.src=PHOTO;
 function resize(){const size=Math.min(1100,Math.round(canvas.clientWidth*Math.min(devicePixelRatio,1.5)));if(canvas.width!==size){canvas.width=canvas.height=size;gl.viewport(0,0,size,size);dirty=true;}}
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 function render(){gl.uniform1i(uniforms.photo,0);gl.uniform1f(uniforms.time,state.time);gl.uniform1f(uniforms.strength,state.strength);gl.uniform1f(uniforms.roll,state.roll);gl.uniform1f(uniforms.mode,state.mode==='original'?2:state.mode==='mirror'?1:0);gl.uniform2f(uniforms.offset,...state.offset);gl.drawArrays(gl.TRIANGLES,0,6);draws++;canvas.dataset.draws=String(draws);canvas.dataset.time=state.time.toFixed(4);}
 function frame(now){const dt=(now-last)/1000;last=now;if(!document.hidden){const active=ready&&state.playing&&state.mode!=='original';state.advance(dt);if(ready&&(dirty||active)){render();dirty=false;}}requestAnimationFrame(frame);}requestAnimationFrame(frame);
 document.addEventListener('visibilitychange',()=>{last=performance.now();dirty=true;});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();state.playing=false;fail('Графический контекст потерян. Обновите страницу.');});
}catch(error){fail(error.message);}
function update(){
 for(const name of ['speed','strength'])$(name).value=state[name];
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
 $('pause').textContent=state.playing?'Остановить':'Оживить';$('pause').disabled=state.mode==='original';
 $('status').textContent=!ready?'Загрузка фотографии…':state.mode==='original'?'Оригинальная фотография':state.playing?'Фотография в движении':'Движение остановлено';
 $('caption').textContent=state.mode==='mirror'?'Один фрагмент фотографии в зеркалах':state.mode==='original'?'Фотография с сайта «Красивое стекло»':'Настоящее стекло. Плавное движение фотографии.';
 canvas.dataset.mode=state.mode;canvas.dataset.playing=String(state.playing);dirty=true;
}
function mode(value){state.mode=value;update();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
$('pause').onclick=()=>{state.playing=!state.playing;update();};
$('reset').onclick=()=>{state.reset(matchMedia('(prefers-reduced-motion: reduce)').matches);$('speed').value=state.speed;$('strength').value=state.strength;update();};
$('next').onclick=()=>{state.offset=[state.offset[0]+1.7,state.offset[1]+.8];state.roll+=.19;update();};
for(const name of ['speed','strength'])$(name).oninput=()=>{state[name]=Number($(name).value);update();};
let drag=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,offset:[...state.offset],roll:state.roll};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||state.mode==='original')return;state.offset=[drag.offset[0]+(e.clientX-drag.x)/110,drag.offset[1]-(e.clientY-drag.y)/110];state.roll=drag.roll+(e.clientX-drag.x)/1400;dirty=true;});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
$('walk-start').onclick=()=>{state.reset(true);mode('original');$('walk-live').disabled=false;$('walk-mirror').disabled=true;};
$('walk-live').onclick=()=>{state.playing=true;mode('live');$('walk-mirror').disabled=false;};
$('walk-mirror').onclick=()=>mode('mirror');
$('source').src=PHOTO;update();
