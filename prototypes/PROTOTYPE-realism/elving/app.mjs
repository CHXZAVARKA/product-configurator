import {CADOpticalSolid} from './cad-solid.mjs';
import {renderFrame} from './render.mjs';
const solid=new CADOpticalSolid(CAD),byId=id=>document.getElementById(id);
const background=document.createElement('canvas');background.width=background.height=1024;
const context=background.getContext('2d');context.fillStyle='#dce9ef';context.fillRect(0,0,1024,1024);
const mm=v=>(v+55)/110*1024;
for(let j=-22;j<=22;j++){
 context.strokeStyle=j%2?'#9aaeb8':'#466273';context.lineWidth=j%2?1.5:3;
 context.beginPath();context.moveTo(mm(j*2.5),0);context.lineTo(mm(j*2.5),1024);context.moveTo(0,mm(j*2.5));context.lineTo(1024,mm(j*2.5));context.stroke();
}
context.fillStyle='#14384b';context.textAlign='center';context.textBaseline='middle';context.font='bold 80px sans-serif';context.fillText('ELVING',512,512);
context.fillStyle='#ce5d28';context.beginPath();context.arc(mm(8),mm(-7),30,0,Math.PI*2);context.fill();
context.fillStyle='#f2d077';context.fillRect(mm(-10),mm(5),55,55);
const bitmap=context.getImageData(0,0,1024,1024).data;
const sample=(x,y)=>{
 // Printed face looks towards the eye (+z), its readable right axis is +x.
 const px=mm(x)-.5,py=mm(-y)-.5;if(px<0||py<0||px>=1023||py>=1023)return [.065,.1,.14];
 const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,result=[0,0,0];
 for(let c=0;c<3;c++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)result[c]+=(bitmap[((iy+dy)*1024+ix+dx)*4+c]/255)**2.2*(dx?fx:1-fx)*(dy?fy:1-fy);
 return result;
};
function webglDisplay(canvas) {
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL2 unavailable');
 const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,'#version 300 es\nin vec2 position;out vec2 uv;void main(){uv=(position+1.)*.5;gl_Position=vec4(position,0.,1.);}'));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;in vec2 uv;uniform sampler2D image;out vec4 color;void main(){color=texture(image,vec2(uv.x,1.-uv.y));}'));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
 const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
 const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 return frame=>{canvas.width=canvas.height=frame.size;gl.viewport(0,0,frame.size,frame.size);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,frame.size,frame.size,0,gl.RGBA,gl.UNSIGNED_BYTE,frame.pixels);gl.drawArrays(gl.TRIANGLES,0,6);if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL draw error');};
}
const displays=[webglDisplay(byId('without')),webglDisplay(byId('with'))];
let state={enabled:true,rotationDeg:0,viewDeg:0,lightDeg:0,intensity:1,size:256},frames,renderCount=0;
function render() {
 const options={...state};frames=[renderFrame(solid,sample,{...options,enabled:false}),renderFrame(solid,sample,options)];displays.forEach((d,i)=>d(frames[i]));renderCount++;
 byId('status').textContent=`CAD: ${solid.source.triangles.toLocaleString('ru')} треугольника · путь в стекле ${frames[1].stats.meanPathMm.toFixed(2)} мм · кадр ${frames[1].stats.milliseconds.toFixed(0)} мс · ${frames[1].stats.geometryBuilt?'расчёт лучей CAD':'готовое поле лучей'} · №${renderCount}`;
 byId('rays').textContent=JSON.stringify(frames[1].stats.traces,null,2);byId('enabled').checked=state.enabled;
 byId('part-label').textContent=state.enabled?'Через настоящий CAD-эльвинг':'Эльвинг отключён';
 for(const key of ['rotationDeg','viewDeg','lightDeg','intensity']){byId(key).value=state[key];byId(`${key}-value`).textContent=state[key];}
}
for(const key of ['rotationDeg','viewDeg','lightDeg','intensity'])byId(key).addEventListener('change',e=>{state[key]=+e.target.value;render();});
byId('enabled').addEventListener('change',e=>{state.enabled=e.target.checked;render();});byId('reset').onclick=()=>{state={...state,enabled:true,rotationDeg:0,viewDeg:0,lightDeg:0,intensity:1};render();};
const hash=pixels=>{let h=2166136261;for(const v of pixels){h^=v;h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
window.ELVING={solid,render,renderFrame:options=>renderFrame(solid,sample,options),set:options=>{state={...state,...options};render();},snapshot:()=>({state:{...state},renderCount,hashes:frames.map(f=>hash(f.pixels)),stats:frames.map(f=>({...f.stats,traces:f.stats.traces})),cad:solid.audit,assembly:ASSEMBLY,webgl:true})};
render();
