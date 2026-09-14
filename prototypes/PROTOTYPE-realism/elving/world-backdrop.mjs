import {HDRLoader} from 'HDRLoader';
import {HalfFloatType} from 'three';
// One photographed HDR studio supplies both the background world and glass lighting.
export function createWorldBackdrop(gl,environmentBytes){
 const hdr=new HDRLoader().setDataType(HalfFloatType).parse(environmentBytes);
 function texture(){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
 const environment=texture();gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,hdr.width,hdr.height,0,gl.RGBA,gl.HALF_FLOAT,hdr.data);
 const image=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([250,250,250,255]));
 const output=texture(),framebuffer=gl.createFramebuffer(),vao=gl.createVertexArray(),program=gl.createProgram();
 for(const [type,code] of [[gl.VERTEX_SHADER,`#version 300 es
 out vec2 uv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`],[gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;in vec2 uv;out vec4 color;uniform sampler2D world,image;uniform bool useWorld,linearOutput;uniform float yaw,exposure;
 vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
 void main(){if(!useWorld){color=texture(image,uv);return;}
 vec3 d=normalize(vec3((uv-.5)*1.15,-1.));float longitude=atan(d.z,d.x)+yaw;float latitude=asin(d.y);
 vec3 light=texture(world,vec2(longitude/6.2831853+.5,.5-latitude/3.14159265)).rgb;
 color=vec4(linearOutput?light*exposure:pow(aces(light*exposure),vec3(1./2.2)),1.);
 }`]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);gl.deleteShader(s);}
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const uniforms=Object.fromEntries(['world','image','useWorld','linearOutput','yaw','exposure'].map(n=>[n,gl.getUniformLocation(program,n)]));let size=0;
 return {setImage(canvas){gl.bindTexture(gl.TEXTURE_2D,image);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);},render({world=true,yawDeg=0,intensity=1,linearOutput=false,size:next=512}={}){
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,output);if(next!==size){size=next;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,size,size,0,gl.RGBA,gl.HALF_FLOAT,null);}
 gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,output,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,size,size);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.useProgram(program);gl.bindVertexArray(vao);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,environment);gl.uniform1i(uniforms.world,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,image);gl.uniform1i(uniforms.image,1);gl.uniform1i(uniforms.useWorld,world);gl.uniform1i(uniforms.linearOutput,linearOutput);gl.uniform1f(uniforms.yaw,yawDeg*Math.PI/180);gl.uniform1f(uniforms.exposure,intensity);
 gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {texture:output,size};
 },dispose(){[environment,image,output].forEach(t=>gl.deleteTexture(t));gl.deleteFramebuffer(framebuffer);gl.deleteVertexArray(vao);gl.deleteProgram(program);}};
}
