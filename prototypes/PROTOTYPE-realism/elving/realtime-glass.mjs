import { CADOpticalSolid, cross, sub, dot, normalize } from './cad-solid.mjs';

// Immutable CAD vertices remain the intersection surface. Only shading normals are welded.
export function buildRealtimeGeometry(input) {
  const cad = input.elving || input;
  const solid = new CADOpticalSolid(cad);
  const welded = new Map();
  const keys = [];
  for (let i = 0; i < cad.positions.length; i += 3) {
    const key = cad.positions.slice(i, i + 3).map(x => Math.round(x * 1e5)).join(':');
    keys.push(key);
    if (!welded.has(key)) welded.set(key, []);
  }
  for (const t of solid.triangles) {
    const points = [t.a, t.b, t.c];
    for (let j = 0; j < 3; j++) {
      const a = normalize(sub(points[(j + 1) % 3], points[j]));
      const b = normalize(sub(points[(j + 2) % 3], points[j]));
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
      welded.get(keys[cad.indices[t.id * 3 + j]]).push({ normal: t.normal, angle });
    }
  }
  const creaseCosine = Math.cos(Math.PI / 4);
  const ordered = [], nodes = [];
  function build(triangles) {
    const index = nodes.length;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const t of triangles) for (const p of [t.a, t.b, t.c]) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]);
    }
    const node = { min, max, first: -1, count: 0, escape: 0 };
    nodes.push(node);
    if (triangles.length <= 6) {
      node.first = ordered.length; node.count = triangles.length; ordered.push(...triangles);
    } else {
      const spans = max.map((v, k) => v - min[k]);
      const axis = spans.indexOf(Math.max(...spans));
      triangles.sort((a, b) => a.center[axis] - b.center[axis]);
      const middle = triangles.length >> 1;
      build(triangles.slice(0, middle)); build(triangles.slice(middle));
    }
    node.escape = nodes.length;
  }
  build([...solid.triangles]);
  const nodeData = new Float32Array(nodes.length * 8);
  nodes.forEach((n, i) => nodeData.set([...n.min, n.escape, ...n.max, n.first < 0 ? -1 : n.first], i * 8));
  // Leaf count occupies triangle slot A.w; internal nodes have negative first.
  const triangleData = new Float32Array(ordered.length * 24);
  ordered.forEach((t, i) => {
    const normals = [0, 1, 2].map(j => {
      const sum = [0, 0, 0];
      // Preserve the CAD's hard shoulders and planar caps. Smoothing a cap's
      // rim into its large fan triangles would invent a curved optical surface.
      for (const adjacent of welded.get(keys[cad.indices[t.id * 3 + j]])) {
        if (dot(adjacent.normal, t.normal) < creaseCosine) continue;
        for (let k = 0; k < 3; k++) sum[k] += adjacent.normal[k] * adjacent.angle;
      }
      return normalize(sum);
    });
    triangleData.set([...t.a, 0, ...t.e1, 0, ...t.e2, 0, ...normals[0], 0, ...normals[1], 0, ...normals[2], 0], i * 24);
  });
  for (const n of nodes) if (n.first >= 0) triangleData[n.first * 24 + 3] = n.count;
  return { nodeData, triangleData, center: solid.center, audit: { ...solid.audit, weldedShadingVertices: welded.size, bvhNodes: nodes.length, leafMaximum: 6, smoothCreaseAngleDeg: 45, positionChanges: 0 } };
}

const vertexSource = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 uv;out vec4 outColor;
uniform sampler2D nodes,triangles,background;
uniform int nodeWidth,triangleWidth,nodeCount;
uniform bool smoothNormals,enabled;
uniform mat3 rotation,inverseRotation;
uniform vec3 center,cameraDirection,cameraRight,cameraUp;
uniform float intensity,lightAngle;
const float EPS=.0002;
vec4 fetchNode(int i){return texelFetch(nodes,ivec2(i%nodeWidth,i/nodeWidth),0);}
vec4 fetchTri(int i){return texelFetch(triangles,ivec2(i%triangleWidth,i/triangleWidth),0);}
struct Hit{float t;vec3 normal;vec3 geometric;};
bool boxHit(vec3 low,vec3 high,vec3 o,vec3 inv,float limit){
 vec3 a=(low-o)*inv,b=(high-o)*inv;
 return max(max(max(min(a.x,b.x),min(a.y,b.y)),min(a.z,b.z)),EPS)<=min(min(min(max(a.x,b.x),max(a.y,b.y)),max(a.z,b.z)),limit);
}
Hit intersectCAD(vec3 o,vec3 d){
 Hit best;best.t=1e20;best.normal=vec3(0);best.geometric=vec3(0);
 vec3 inv=1./(sign(d)*max(abs(d),vec3(1e-20))+vec3(equal(d,vec3(0)))*1e-20);
 int node=0;
 for(int visit=0;visit<16384;visit++){
  if(node>=nodeCount)break;
  vec4 lo=fetchNode(node*2),hi=fetchNode(node*2+1);
  if(!boxHit(lo.xyz,hi.xyz,o,inv,best.t)){node=int(lo.w);continue;}
  if(hi.w<0.){node++;continue;}
  int first=int(hi.w),count=int(fetchTri(first*6).w);
  for(int j=0;j<6;j++){
   if(j>=count)break;
   int base=(first+j)*6;
   vec3 a=fetchTri(base).xyz,e1=fetchTri(base+1).xyz,e2=fetchTri(base+2).xyz;
   vec3 p=cross(d,e2);float det=dot(e1,p);
   if(abs(det)<1e-10)continue;
   vec3 s=o-a;float u=dot(s,p)/det;
   if(u<-.000001||u>1.000001)continue;
   vec3 q=cross(s,e1);float v=dot(d,q)/det;
   if(v<-.000001||u+v>1.000001)continue;
   float t=dot(e2,q)/det;
   if(t<=EPS||t>=best.t)continue;
   best.t=t;best.geometric=normalize(cross(e1,e2));
   best.normal=smoothNormals?normalize(fetchTri(base+3).xyz*(1.-u-v)+fetchTri(base+4).xyz*u+fetchTri(base+5).xyz*v):best.geometric;
   if(dot(best.normal,best.geometric)<0.)best.normal=-best.normal;
  }
  node=int(lo.w);
 }
 return best;
}
float fresnel(float ci,float n1,float n2){
 ci=clamp(ci,0.,1.);float st2=(n1/n2)*(n1/n2)*(1.-ci*ci);
 if(st2>=1.)return 1.;float ct=sqrt(1.-st2);
 float rs=(n1*ci-n2*ct)/(n1*ci+n2*ct),rp=(n2*ci-n1*ct)/(n2*ci+n1*ct);
 return .5*(rs*rs+rp*rp);
}
vec3 environment(vec3 o,vec3 d){
 // The supplied source image lies on the actual backlight plane, z=-28 mm.
 if(d.z<-.00001){
  float t=(-28.-o.z)/d.z;vec2 p=(o+d*t).xy/44.+.5;
  if(t>0.&&all(greaterThanEqual(p,vec2(0)))&&all(lessThanEqual(p,vec2(1)))){
   vec3 source=pow(texture(background,p).rgb,vec3(2.2));
   vec3 planePoint=o+d*t;
   vec3 lightPosition=vec3(18.*sin(lightAngle),0.,-28.-18.*cos(lightAngle));
   vec3 toLight=lightPosition-planePoint;
   float distanceSquared=max(dot(toLight,toLight),1.);
   float cosine=max(-toLight.z*inversesqrt(distanceSquared),0.);
   float illumination=.12+.88*cosine*min(324./distanceSquared,4.);
   return source*intensity*illumination;
  }
 }
 // A finite overhead area light gives front-interface reflections their shape.
 vec3 light=normalize(vec3(sin(lightAngle),.65,cos(lightAngle)));
 float lightPatch=pow(max(dot(d,light),0.),90.);
 return vec3(.013,.018,.024)+vec3(.8,.84,.9)*lightPatch*intensity;
}
vec3 envLocal(vec3 o,vec3 d){return environment(center+rotation*(o-center),rotation*d);}
void main(){
 vec3 worldDirection=cameraDirection;
 vec3 worldOrigin=center-worldDirection*(45.-center.z)+cameraRight*(uv.x-.5)*44.+cameraUp*(uv.y-.5)*44.;
 if(!enabled){outColor=vec4(pow(max(environment(worldOrigin,worldDirection),vec3(0)),vec3(1./2.2)),1);return;}
 vec3 o=center+inverseRotation*(worldOrigin-center),d=inverseRotation*worldDirection;
 Hit h=intersectCAD(o,d);
 if(h.t>1e19){outColor=vec4(pow(max(envLocal(o,d),vec3(0)),vec3(1./2.2)),1);return;}
 vec3 color=vec3(0),throughput=vec3(1);
 bool entry=dot(d,h.geometric)<0.;
 if(entry){
  vec3 p=o+d*h.t,n=h.normal;
  if(dot(d,n)>=-.0001)n=h.geometric;
  vec3 outgoing=refract(d,n,1./1.5);
  if(dot(outgoing,h.geometric)>=0.){n=h.geometric;outgoing=refract(d,n,1./1.5);}
  float f=fresnel(-dot(d,n),1.,1.5);
  color+=envLocal(p,reflect(d,n))*f;throughput*=1.-f;
  d=outgoing;o=p-h.geometric*EPS*3.;h=intersectCAD(o,d);
 }
 // Split transmitted Fresnel energy at each real exit. Follow the reflected
 // branch inside the CAD, including TIR, for at most four internal reflections.
 for(int bounce=0;bounce<5;bounce++){
  if(h.t>1e19||dot(d,h.geometric)<=0.)break;
  throughput*=exp(-vec3(.006,.003,.002)*h.t);
  vec3 p=o+d*h.t,n=-h.normal;
  if(dot(d,n)>=-.0001)n=-h.geometric;
  vec3 outgoing=refract(d,n,1.5);
  if(dot(outgoing,outgoing)>0.&&dot(outgoing,h.geometric)<=0.){n=-h.geometric;outgoing=refract(d,n,1.5);}
  float f=fresnel(-dot(d,n),1.5,1.);
  if(dot(outgoing,outgoing)>0.)color+=throughput*(1.-f)*envLocal(p,outgoing);
  throughput*=f;
  if(max(max(throughput.r,throughput.g),throughput.b)<.01||bounce==4)break;
  d=reflect(d,n);
  if(dot(d,h.geometric)>=0.)d=reflect(d,-h.geometric);
  o=p-h.geometric*EPS*3.;h=intersectCAD(o,d);
 }
 outColor=vec4(pow(max(color,vec3(0)),vec3(1./2.2)),1);
}`;

function shader(gl, type, source) {
  const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw Error(log); }
  return s;
}
function matrix(degrees = [0, 0, 0]) {
  if (typeof degrees === 'number') degrees = [0, 0, degrees];
  const [x, y, z] = degrees.map(v => v * Math.PI / 180), cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [cz*cy,sz*cy,-sy,cz*sy*sx-sz*cx,sz*sy*sx+cz*cx,cy*sx,cz*sy*cx+sz*sx,sz*sy*cx-cz*sx,cy*cx];
}
export function createRealtimeGlass(gl, cad) {
  const geometry = buildRealtimeGeometry(cad);
  const program = gl.createProgram(), vs = shader(gl, gl.VERTEX_SHADER, vertexSource), fs = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  const vao = gl.createVertexArray(), framebuffer = gl.createFramebuffer();
  function dataTexture(data) {
    const texels = data.length / 4, width = Math.min(512, 2 ** Math.ceil(Math.log2(Math.sqrt(texels)))), height = Math.ceil(texels / width);
    const padded = new Float32Array(width * height * 4); padded.set(data);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, padded);
    return { texture, width };
  }
  const nodeTexture = dataTexture(geometry.nodeData), triangleTexture = dataTexture(geometry.triangleData);
  const background = gl.createTexture(), output = gl.createTexture();
  for (const texture of [background, output]) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.bindTexture(gl.TEXTURE_2D, background);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([235, 240, 245, 255]));
  const names = ['nodes','triangles','background','nodeWidth','triangleWidth','nodeCount','smoothNormals','enabled','rotation','inverseRotation','center','cameraDirection','cameraRight','cameraUp','intensity','lightAngle'];
  const uniforms = Object.fromEntries(names.map(n => [n, gl.getUniformLocation(program, n)]));
  let currentSize = 0;
  return {
    geometryAudit: geometry.audit,
    stats: { triangles: geometry.audit.triangles, bvhNodes: geometry.audit.bvhNodes, maxInternalReflections: 4, cpuIntersectionsPerFrame: 0 },
    setBackground(source) {
      const previous = gl.getParameter(gl.TEXTURE_BINDING_2D), flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
      gl.bindTexture(gl.TEXTURE_2D, background); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip); gl.bindTexture(gl.TEXTURE_2D, previous);
    },
    render({ rotationDeg = [0,0,0], viewDeg = 0, lightDeg = 0, intensity = 1, smooth = true, enabled = true, size = 256 } = {}) {
      size = Math.max(64, Math.min(1024, Math.round(size)));
      const oldFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), viewport = gl.getParameter(gl.VIEWPORT);
      const oldProgram = gl.getParameter(gl.CURRENT_PROGRAM), oldVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING), activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      const capabilities = [gl.DEPTH_TEST, gl.BLEND, gl.CULL_FACE, gl.SCISSOR_TEST, gl.RASTERIZER_DISCARD], states = capabilities.map(c => gl.isEnabled(c));
      const colorMask = gl.getParameter(gl.COLOR_WRITEMASK), textureBindings = [];
      for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE0 + i); textureBindings.push(gl.getParameter(gl.TEXTURE_BINDING_2D)); }
      gl.colorMask(true, true, true, true);
      capabilities.forEach(c => gl.disable(c));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, output);
      if (size !== currentSize) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); currentSize = size; }
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
      gl.viewport(0, 0, size, size); gl.useProgram(program); gl.bindVertexArray(vao);
      [nodeTexture.texture, triangleTexture.texture, background].forEach((texture, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texture); });
      gl.uniform1i(uniforms.nodes, 0); gl.uniform1i(uniforms.triangles, 1); gl.uniform1i(uniforms.background, 2);
      gl.uniform1i(uniforms.nodeWidth, nodeTexture.width); gl.uniform1i(uniforms.triangleWidth, triangleTexture.width); gl.uniform1i(uniforms.nodeCount, geometry.audit.bvhNodes);
      gl.uniform1i(uniforms.smoothNormals, smooth); gl.uniform1i(uniforms.enabled, enabled);
      const r = matrix(rotationDeg), inv = [r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8]];
      gl.uniformMatrix3fv(uniforms.rotation, false, r); gl.uniformMatrix3fv(uniforms.inverseRotation, false, inv); gl.uniform3fv(uniforms.center, geometry.center);
      const view = typeof viewDeg === 'number' ? [0, viewDeg] : viewDeg;
      const x = (view[0] || 0)*Math.PI/180, y = (view[1] || 0)*Math.PI/180;
      const d = [Math.sin(y)*Math.cos(x), -Math.sin(x), -Math.cos(y)*Math.cos(x)];
      const right = [Math.cos(y),0,Math.sin(y)], up = normalize(cross(right,d));
      gl.uniform3fv(uniforms.cameraDirection, d); gl.uniform3fv(uniforms.cameraRight, right); gl.uniform3fv(uniforms.cameraUp, up);
      gl.uniform1f(uniforms.intensity, Math.max(0, intensity)); gl.uniform1f(uniforms.lightAngle, lightDeg*Math.PI/180);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, oldFramebuffer); gl.viewport(...viewport); gl.useProgram(oldProgram); gl.bindVertexArray(oldVAO);
      textureBindings.forEach((texture,i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texture); });
      gl.activeTexture(activeTexture); gl.colorMask(...colorMask);
      capabilities.forEach((c,i) => { if (states[i]) gl.enable(c); });
      return { texture: output, size };
    },
    dispose() { [nodeTexture.texture,triangleTexture.texture,background,output].forEach(t => gl.deleteTexture(t)); gl.deleteFramebuffer(framebuffer); gl.deleteVertexArray(vao); gl.deleteProgram(program); }
  };
}
