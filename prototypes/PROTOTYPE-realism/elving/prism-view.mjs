// Mirror planes are recovered from the inner faces of the supplied CAD prism.
export function prismFromCAD(cad) {
 const mesh=cad.prizma, vertices=[];
 for(let i=0;i<mesh.positions.length;i+=3)vertices.push(mesh.positions.slice(i,i+3));
 const planes=[];
 for(let i=0;i<mesh.indices.length;i+=3){
  const [a,b,c]=mesh.indices.slice(i,i+3).map(j=>vertices[j]);
  const u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]);
  let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  if(length<1e-8||Math.abs(n[2]/length)>1e-6)continue;
  n=n.map(x=>x/length);let offset=n.reduce((sum,x,k)=>sum+x*a[k],0);
  if(offset<0){offset=-offset;n=n.map(x=>-x);}
  const existing=planes.find(p=>p.normal[0]*n[0]+p.normal[1]*n[1]>.99999);
  if(existing)existing.offset=Math.min(existing.offset,offset);else planes.push({normal:n.slice(0,2),offset});
 }
 if(planes.length!==3)throw Error('CAD prism must contain three mirror planes');
 const zs=vertices.map(p=>p[2]),eyeZ=Math.max(...cad.glazok.positions.filter((_,i)=>i%3===2))+.1;
 return {planes,nearZ:Math.max(...zs),farZ:Math.min(...zs),eyeZ};
}
export function tracePrism(prism,screenX,screenY,fovDeg=38) {
 const fov=Math.tan(fovDeg*Math.PI/360),direction=[screenX*fov,screenY*fov,-1];
 const p=[direction[0]*(prism.eyeZ-prism.nearZ),direction[1]*(prism.eyeZ-prism.nearZ),prism.nearZ-1e-4];
 if(prism.planes.some(({normal:n,offset})=>n[0]*p[0]+n[1]*p[1]>offset))return {status:'aperture'};
 for(let bounce=0;bounce<64;bounce++){
  let distance=(prism.farZ-p[2])/direction[2],wall=null;
  for(const plane of prism.planes){const n=plane.normal,den=n[0]*direction[0]+n[1]*direction[1];if(den<=1e-8)continue;const t=(plane.offset-n[0]*p[0]-n[1]*p[1])/den;if(t>=-1e-4&&t<distance){distance=Math.max(0,t);wall=n;}}
  for(let k=0;k<3;k++)p[k]+=direction[k]*distance;
  if(!wall)return {status:'exit',point:p,direction,bounces:bounce};
  const dot=wall[0]*direction[0]+wall[1]*direction[1];direction[0]-=2*dot*wall[0];direction[1]-=2*dot*wall[1];
 }
 return {status:'limit'};
}
export function createPrismView(gl,prism) {
 const compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
 const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
 out vec2 uv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`);
 const fragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;in vec2 uv;out vec4 color;uniform sampler2D source;uniform int eye;uniform float fov,nearZ,farZ,eyeZ;uniform vec3 planes[3];
 void main(){vec2 q=uv*2.-1.;float r=length(q);vec2 sampleUV=uv;float throughput=1.;
 if(eye==1){if(r>1.){color=vec4(.024,.034,.037,1.);return;}vec3 d=vec3(q*fov,-1.);vec3 p=vec3(d.xy*(eyeZ-nearZ),nearZ-.0001);
 for(int j=0;j<3;j++)if(dot(planes[j].xy,p.xy)>planes[j].z){color=vec4(.009,.014,.016,1.);return;}
 bool exited=false;
 for(int bounce=0;bounce<64;bounce++){float distance=(farZ-p.z)/d.z;vec2 wall=vec2(0.);bool mirror=false;
 for(int j=0;j<3;j++){vec2 n=planes[j].xy;float den=dot(n,d.xy);if(den>.000001){float t=(planes[j].z-dot(n,p.xy))/den;if(t>=-.0001&&t<distance){distance=max(0.,t);wall=n;mirror=true;}}}
 p+=d*distance;if(!mirror){exited=true;break;}d.xy=reflect(d.xy,wall);throughput*=.965;
 }if(!exited){color=vec4(.01,.016,.018,1.);return;}sampleUV=p.xy/44.+.5;throughput*=1.-.12*pow(r,4.);
 }
 vec3 c=pow(max(texture(source,sampleUV).rgb,vec3(0.)),vec3(2.2))*throughput;
 color=vec4(pow(c,vec3(1./2.2)),1.);
 }`);
 const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const vao=gl.createVertexArray(),locations=Object.fromEntries(['source','eye','fov','nearZ','farZ','eyeZ','planes[0]'].map(k=>[k,gl.getUniformLocation(program,k)]));
 return {draw(texture,{mode='prism',fovDeg=38,width=gl.canvas.width,height=gl.canvas.height}={}){
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(program);gl.bindVertexArray(vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.uniform1i(locations.source,0);gl.uniform1i(locations.eye,mode==='prism'?1:0);gl.uniform1f(locations.fov,Math.tan(fovDeg*Math.PI/360));gl.uniform1f(locations.nearZ,prism.nearZ);gl.uniform1f(locations.farZ,prism.farZ);gl.uniform1f(locations.eyeZ,prism.eyeZ);gl.uniform3fv(locations['planes[0]'],prism.planes.flatMap(p=>[...p.normal,p.offset]));gl.drawArrays(gl.TRIANGLES,0,3);
 },dispose(){gl.deleteVertexArray(vao);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);}};
}
