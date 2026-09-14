import * as THREE from 'three';
import {HDRLoader} from 'HDRLoader';

function fractureTexture() {
 const n=128,data=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const hash=Math.imul(x+11,73856093)^Math.imul(y+7,19349663);
  const ridge=Math.abs(Math.sin(x*.049+y*.031+Math.sin(y*.08)*.11));
  const cross=Math.abs(Math.sin(x*.036-y*.067+1.2));
  const height=128+(hash&7)+(ridge<.018?28:0)+(cross<.014?16:0);
  data.set([height,height,height,255],(y*n+x)*4);
 }
 const texture=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 return texture;
}

// Average only faces within 40 degrees at the same original hull vertex.
// Cap-to-bevel and adjacent polygon facets remain sharp; the shallow meeting
// of the two bevel rings can catch a continuous polished highlight.
function polishedNormals(chip) {
 const neighbours=Array.from({length:chip.vertices.length},()=>[]),faces=[];
 for(let i=0;i<chip.indices.length;i+=3){
  const ids=chip.indices.slice(i,i+3),[a,b,c]=ids.map(j=>chip.vertices[j]);
  const u=b.map((v,k)=>v-a[k]),v=c.map((q,k)=>q-a[k]);
  const area=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...area),normal=area.map(q=>q/length);
  const face={ids,area,normal};faces.push(face);for(const id of ids)neighbours[id].push(face);
 }
 const data=[],threshold=Math.cos(40*Math.PI/180);
 for(const face of faces)for(const id of face.ids){
  const sum=[0,0,0];for(const neighbour of neighbours[id]){
   if(face.normal.reduce((dot,q,k)=>dot+q*neighbour.normal[k],0)<threshold)continue;
   for(let k=0;k<3;k++)sum[k]+=neighbour.area[k];
  }
  const length=Math.hypot(...sum);data.push(...sum.map(q=>q/length));
 }
 return new THREE.Float32BufferAttribute(data,3);
}

// Millimetres throughout. Four raster depth groups let transmission see the
// coloured result behind it, rather than Three's opaque-only capture. Objects
// inside one group still share that capture: this is a bounded approximation,
// not recursive refraction or ray-traced interreflection.
export async function createPBRChipView(gl, {environmentBytes} = {}) {
 const renderer = new THREE.WebGLRenderer({canvas:gl.canvas,context:gl,antialias:false,alpha:false});
 renderer.autoClear = true;
 renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
 renderer.toneMapping = THREE.NoToneMapping;
 // Refraction capture is slightly smaller than the output; sharp HDR specular
 // and bevel silhouettes are still evaluated at the full output resolution.
 renderer.transmissionResolutionScale = .75;
 renderer.setClearColor(0x101719,1);
 const scene = new THREE.Scene(), group = new THREE.Group();
 scene.add(group);
 const camera = new THREE.OrthographicCamera(-22,22,22,-22,.1,140);
 camera.position.set(0,0,60);camera.lookAt(0,0,0);
 let environmentTarget = null;
 if (environmentBytes) {
  const parsed = new HDRLoader().parse(environmentBytes);
  const hdr = new THREE.DataTexture(parsed.data,parsed.width,parsed.height,THREE.RGBAFormat,parsed.type);
  hdr.colorSpace = THREE.LinearSRGBColorSpace;
  hdr.flipY = parsed.flipY;
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  hdr.minFilter = hdr.magFilter = THREE.LinearFilter;hdr.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  environmentTarget = generator.fromEquirectangular(hdr);
  scene.environment = environmentTarget.texture;
  hdr.dispose();generator.dispose();
 }
 const key = new THREE.DirectionalLight(0xfff8ec,2.6);
 key.position.set(-12,20,35);scene.add(key);
 const rim = new THREE.DirectionalLight(0xcce6ff,.8);
 rim.position.set(24,-10,18);scene.add(rim);
 const external = new THREE.ExternalTexture();
 const fracture=fractureTexture();
 const plateMaterial = new THREE.ShaderMaterial({
  uniforms:{image:{value:external},decodeSRGB:{value:true},hasImage:{value:false}},
  vertexShader:'varying vec2 uvImage;void main(){uvImage=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D image;uniform bool decodeSRGB,hasImage;varying vec2 uvImage;
   vec3 linearize(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
   void main(){vec3 c=hasImage?texture2D(image,uvImage).rgb:vec3(.37,.43,.42);if(decodeSRGB&&hasImage)c=linearize(c);gl_FragColor=vec4(c,1.);}`,
  depthTest:false,depthWrite:false,toneMapped:false
 });
 const plateGeometry = new THREE.PlaneGeometry(44,44),plate = new THREE.Mesh(plateGeometry,plateMaterial);
 plate.position.z=-20;plate.frustumCulled=false;plate.renderOrder=-100;scene.add(plate);
 const targetOptions={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false};
 const targets=[new THREE.WebGLRenderTarget(1,1,targetOptions),new THREE.WebGLRenderTarget(1,1,targetOptions)];
 const output = new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,depthBuffer:false});
 const finalMaterial = new THREE.ShaderMaterial({
  uniforms:{image:{value:null},exposure:{value:1},glow:{value:.65},pixel:{value:new THREE.Vector2(1/512,1/512)}},depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 uvImage;void main(){uvImage=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`uniform sampler2D image;uniform float exposure,glow;uniform vec2 pixel;varying vec2 uvImage;
   vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
   vec3 bright(vec2 uv){vec3 c=max(texture2D(image,clamp(uv,vec2(0.),vec2(1.))).rgb*exposure,vec3(0.));
    float peak=max(max(c.r,c.g),c.b);return min(c,vec3(12.))*max(peak-1.2,0.)/max(peak,.0001);}
   void main(){vec3 c=max(texture2D(image,uvImage).rgb*exposure,vec3(0.));
    // Local photographic bloom from HDR radiance only. The glass emits no light.
    if(glow>0.){vec3 halo=bright(uvImage)*.16;
     for(int i=1;i<=3;i++){vec2 d=pixel*float(i)*2.;float w=i==1?.11:(i==2?.065:.035);
      halo+=w*(bright(uvImage+vec2(d.x,0.))+bright(uvImage-vec2(d.x,0.))+bright(uvImage+vec2(0.,d.y))+bright(uvImage-vec2(0.,d.y)));}
     c+=halo*glow;
    }
    c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);gl_FragColor=vec4(srgb(c),1.);}`
 });
 const finalGeometry=new THREE.PlaneGeometry(2,2),finalScene=new THREE.Scene();
 finalScene.add(new THREE.Mesh(finalGeometry,finalMaterial));
 let meshes=[],size=0,disposed=false,lastCalls=0;
 function setGeometry(chips) {
  if(disposed)throw Error('PBR chip view is disposed');
  for(const mesh of meshes){group.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  meshes=chips.map(chip=>{
   const indexed=new THREE.BufferGeometry();
   indexed.setAttribute('position',new THREE.Float32BufferAttribute(chip.vertices.flat(),3));indexed.setIndex(chip.indices);
   const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();
   geometry.setAttribute('uv',new THREE.Float32BufferAttribute(chip.indices.flatMap(j=>[chip.vertices[j][0]/6+.5,chip.vertices[j][1]/6+.5]),2));
   const flatNormals=geometry.getAttribute('normal'),smoothNormals=polishedNormals(chip);
   geometry.setAttribute('normal',smoothNormals.clone());
   const tint=new THREE.Color().setRGB(...chip.color,THREE.SRGBColorSpace);
   const material=new THREE.MeshPhysicalMaterial({
    color:0xffffff,metalness:0,roughness:.065,transmission:1,ior:1.5,
    thickness:chip.thicknessMm,attenuationColor:tint,attenuationDistance:3.8,
    envMapIntensity:1.15,specularIntensity:1,side:THREE.FrontSide,
    transparent:false,depthWrite:true,bumpMap:fracture,bumpScale:.023
   });
   const mesh=new THREE.Mesh(geometry,material);mesh.userData={flatNormals,smoothNormals,lastSmooth:true};mesh.frustumCulled=false;group.add(mesh);return mesh;
  });
 }
 function render(sourceTexture,poses,{size:next=512,rollDeg=0,lightDeg=0,intensity=1,smooth=true,layers=4,exposure=1,sourceLinear=false,glow=.65}={}) {
  if(disposed)throw Error('PBR chip view is disposed');
  if(poses.length!==meshes.length)throw Error('Every PBR chip requires its rigid-body pose');
  next=Math.max(32,Math.min(1024,Math.round(next)));
  if(next!==size){size=next;for(const target of [...targets,output])target.setSize(size,size);}
  renderer.resetState();
  renderer.setViewport(0,0,size,size);renderer.setScissorTest(false);
  group.rotation.z=rollDeg*Math.PI/180;
  const angle=lightDeg*Math.PI/180;
  key.position.set(Math.sin(angle)*28,17,Math.cos(angle)*28+16);
  key.intensity=2.6*intensity;rim.intensity=.8*intensity;
  scene.environmentIntensity=1.1*intensity;
  // Same yaw as the photographed HDRI background. Object rotation changes reflections itself.
  scene.environmentRotation.set(0,angle,0);
  for(let i=0;i<meshes.length;i++){
   const mesh=meshes[i],pose=poses[i];mesh.position.fromArray(pose.positionMm);mesh.quaternion.fromArray(pose.rotation);
   if(mesh.userData.lastSmooth!==smooth){
    const normal=mesh.geometry.getAttribute('normal');
    normal.array.set((smooth?mesh.userData.smoothNormals:mesh.userData.flatNormals).array);
    normal.needsUpdate=true;mesh.userData.lastSmooth=smooth;
   }
   mesh.material.roughness=.065;mesh.visible=false;
  }
  const sorted=meshes.map((mesh,index)=>({mesh,z:poses[index].positionMm[2]})).sort((a,b)=>a.z-b.z);
  const slices=Math.max(1,Math.min(8,Math.round(layers))),stride=Math.max(1,Math.ceil(sorted.length/slices));
  external.sourceTexture=sourceTexture||null;
  plateMaterial.uniforms.image.value=external;plateMaterial.uniforms.decodeSRGB.value=!sourceLinear;plateMaterial.uniforms.hasImage.value=!!sourceTexture;
  renderer.info.autoReset=false;renderer.info.reset();
  let previous=null;
  const passes=sorted.length?Math.ceil(sorted.length/stride):1;
  for(let layer=0;layer<passes;layer++){
   if(layer){plateMaterial.uniforms.image.value=previous.texture;plateMaterial.uniforms.decodeSRGB.value=false;plateMaterial.uniforms.hasImage.value=true;}
   for(let i=0;i<sorted.length;i++)sorted[i].mesh.visible=i>=layer*stride&&i<(layer+1)*stride;
   const target=targets[layer%2];renderer.setRenderTarget(target);renderer.render(scene,camera);previous=target;
  }
  finalMaterial.uniforms.image.value=previous.texture;finalMaterial.uniforms.exposure.value=exposure;finalMaterial.uniforms.glow.value=glow;finalMaterial.uniforms.pixel.value.set(1/size,1/size);
  renderer.setRenderTarget(output);renderer.render(finalScene,camera);
  lastCalls=renderer.info.render.calls;
  // The bundled Three revision has no public get-native-texture method. This
  // one read of its target property is the only private integration boundary.
  const texture=renderer.properties.get(output.texture).__webglTexture;
  renderer.setRenderTarget(null);renderer.resetState();
  // Raw prism / CAD programs share this context and do not track Three state.
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
  gl.disable(gl.SCISSOR_TEST);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  gl.colorMask(true,true,true,true);gl.depthMask(true);gl.frontFace(gl.CCW);
  return {texture,size,drawCalls:lastCalls,layers:passes,method:'PMREM HDR + MeshPhysicalMaterial + raster depth groups'};
 }
 function dispose(){
  if(disposed)return;disposed=true;
  for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}
  for(const target of [...targets,output])target.dispose();
  plateGeometry.dispose();plateMaterial.dispose();finalGeometry.dispose();finalMaterial.dispose();
  fracture.dispose();environmentTarget?.dispose();renderer.dispose();
  // ExternalTexture is caller-owned: its raw source must never be deleted here.
 }
 renderer.resetState();
 return {setGeometry,render,dispose};
}
