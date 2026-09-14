import {vertexThickness} from './chip-optics.mjs';
import {buildChipSurface} from './chip-surface.mjs';
import {viewOrientation,rotateVector} from './view-orientation.mjs';
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

// Smooth the curved fracture patches while retaining normal discontinuities
// where neighbouring triangles meet at more than 40 degrees.
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
 renderer.autoClear = true;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
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
 key.position.set(-12,20,35);scene.add(key);key.shadow.mapSize.set(512,512);Object.assign(key.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:100});key.shadow.bias=-.001;key.shadow.normalBias=.04;
 const rim = new THREE.DirectionalLight(0xcce6ff,.8);
 rim.position.set(24,-10,18);scene.add(rim);
 const external = new THREE.ExternalTexture();
 const fracture=fractureTexture();
 const plateMaterial = new THREE.ShaderMaterial({
  uniforms:{image:{value:external},decodeSRGB:{value:true},hasImage:{value:false},studyBackground:{value:0}},
  vertexShader:'varying vec2 uvImage;void main(){uvImage=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D image;uniform bool decodeSRGB,hasImage;uniform int studyBackground;varying vec2 uvImage;
   vec3 linearize(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
   void main(){vec3 c=hasImage?texture2D(image,uvImage).rgb:vec3(.37,.43,.42);if(decodeSRGB&&hasImage)c=linearize(c);if(studyBackground>0){float grain=fract(sin(dot(floor(uvImage*1100.),vec2(12.9898,78.233)))*43758.5453);c=studyBackground==2?vec3(1.8):vec3(.27,.255,.23)*(1.-.2*distance(uvImage,vec2(.5)))+vec3((grain-.5)*.023);}gl_FragColor=vec4(c,1.);}`,
  depthTest:false,depthWrite:false,toneMapped:false
 });
 const plateGeometry = new THREE.PlaneGeometry(44,44),plate = new THREE.Mesh(plateGeometry,plateMaterial);
 plate.position.z=-20;plate.frustumCulled=false;plate.renderOrder=-100;scene.add(plate);
 const shadowMaterial=new THREE.ShadowMaterial({opacity:.16,depthWrite:false});
 const shadowFloor=new THREE.Mesh(plateGeometry,shadowMaterial);shadowFloor.position.z=.8;shadowFloor.receiveShadow=true;shadowFloor.renderOrder=-90;scene.add(shadowFloor);
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
 const audit=()=>({count:meshes.length,visualTriangles:meshes.reduce((n,m)=>n+m.userData.surfaceAudit.visualTriangles,0),collisionTriangles:meshes.reduce((n,m)=>n+m.userData.surfaceAudit.sourceTriangles,0),maxDeviationMm:Math.max(0,...meshes.map(m=>m.userData.surfaceAudit.maxDeviationMm)),perChip:meshes.map(m=>m.userData.surfaceAudit)});
 function disposeMesh(mesh){mesh.userData.visualGeometry.dispose();mesh.userData.collisionGeometry.dispose();mesh.userData.glassMaterial.dispose();mesh.userData.wireMaterial.dispose();mesh.userData.clayMaterial.dispose();}
 function setGeometry(chips, options={}) {
  if(disposed)throw Error('PBR chip view is disposed');
  for(const mesh of meshes){group.remove(mesh);disposeMesh(mesh);}
  meshes=chips.map(chip=>{
   const surface=buildChipSurface(chip,options),variation=surface.materialVariation;
   const collisionGeometry=new THREE.BufferGeometry();collisionGeometry.setAttribute('position',new THREE.Float32BufferAttribute(chip.vertices.flat(),3));collisionGeometry.setIndex(chip.indices);
   const indexed=new THREE.BufferGeometry();
   indexed.setAttribute('position',new THREE.Float32BufferAttribute(surface.vertices.flat(),3));indexed.setIndex(surface.indices);
   const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();
   geometry.setAttribute('uv',new THREE.Float32BufferAttribute(surface.indices.flatMap(j=>[surface.vertices[j][0]/6+.5,surface.vertices[j][1]/6+.5]),2));
   const thickness=vertexThickness(chip,surface);
   geometry.setAttribute('glassThickness',new THREE.Float32BufferAttribute(surface.indices.map(j=>thickness[j]),1));
   const flatNormals=geometry.getAttribute('normal'),smoothNormals=polishedNormals(surface);
   geometry.setAttribute('normal',smoothNormals.clone());
   const tint=new THREE.Color().setRGB(...chip.color.map(v=>Math.min(1,v*variation.tintScale)),THREE.SRGBColorSpace);
   const material=new THREE.MeshPhysicalMaterial({
    color:0xffffff,metalness:0,roughness:variation.roughness*.45,transmission:1,ior:1.5,
    thickness:chip.thicknessMm,attenuationColor:tint,attenuationDistance:3.8,
    envMapIntensity:1.15,specularIntensity:1,side:THREE.FrontSide,
    transparent:false,depthWrite:true,bumpMap:fracture,bumpScale:variation.bumpScale*.5*(options.detail??.4)
   });
   material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float glassThickness;varying float vGlassThickness;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGlassThickness=glassThickness;');
    shader.fragmentShader='varying float vGlassThickness;\n'+shader.fragmentShader.replace('#include <transmission_fragment>',THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;','material.thickness = vGlassThickness;'));
   };
   material.customProgramCacheKey=()=> 'glass-local-normal-thickness-v1';
   const mesh=new THREE.Mesh(geometry,material);mesh.userData={flatNormals,smoothNormals,lastSmooth:true,visualGeometry:geometry,collisionGeometry,glassMaterial:material,wireMaterial:new THREE.MeshBasicMaterial({color:0xffcf79,wireframe:true}),clayMaterial:new THREE.MeshStandardMaterial({color:0x92908a,roughness:.55}),supportVertices:chip.vertices,shapeFamily:chip.shapeAudit?.family,surfaceAudit:{...surface.audit,minOpticalThicknessMm:Math.min(...thickness),maxOpticalThicknessMm:Math.max(...thickness)}};mesh.frustumCulled=false;group.add(mesh);return mesh;
  });
 }
 function render(sourceTexture,poses,{size:next=512,rollDeg=0,tiltDeg=0,lightDeg=0,intensity=1,smooth=true,layers=4,exposure=1,sourceLinear=false,glow=.65,showColliders=false,study=false,studyTurn=0,studyTilt=0,studyMaterial='glass'}={}) {
  if(disposed)throw Error('PBR chip view is disposed');
  if(poses.length!==meshes.length)throw Error('Every PBR chip requires its rigid-body pose');
  next=Math.max(32,Math.min(1024,Math.round(next)));
  if(next!==size){size=next;for(const target of [...targets,output])target.setSize(size,size);}
  renderer.resetState();
  renderer.setViewport(0,0,size,size);renderer.setScissorTest(false);
  group.rotation.set(0,0,0);key.castShadow=study;shadowFloor.visible=study&&studyMaterial!=='backlit';
  const span=study?16:22;camera.left=-span;camera.right=span;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();
  plateMaterial.uniforms.studyBackground.value=study?(studyMaterial==='backlit'?2:1):0;
  const orientation=viewOrientation(rollDeg,tiltDeg,lightDeg);
    key.position.fromArray(rotateVector(orientation.environmentToView,[-12,20,35]));
  rim.position.fromArray(rotateVector(orientation.environmentToView,[24,-10,18]));
  key.intensity=(study?1.2:2.6)*intensity;rim.intensity=.8*intensity;
  scene.environmentIntensity=1.1*intensity;
  // Same yaw as the photographed HDRI background. Object rotation changes reflections itself.
  scene.environmentRotation.setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(new THREE.Matrix3().fromArray(orientation.environmentToView)));
  const sampleIndices=[];for(const family of ['short','wedge','splinter','flake']){const index=meshes.findIndex(m=>m.userData.shapeFamily===family);if(index>=0&&!sampleIndices.includes(index))sampleIndices.push(index);}
  for(let i=0;sampleIndices.length<Math.min(6,meshes.length);i++)if(!sampleIndices.includes(i))sampleIndices.push(i);
  for(let i=0;i<meshes.length;i++){
   const mesh=meshes[i],pose=poses[i];mesh.castShadow=study;mesh.position.fromArray(pose.positionMm);mesh.quaternion.fromArray(pose.rotation);
   if(study){const slot=sampleIndices.indexOf(i);mesh.position.set((slot%3-1)*10,(slot<3?1:-1)*5.3,3);mesh.quaternion.setFromEuler(new THREE.Euler(.50+(slot%2)*.22+studyTilt*Math.PI/180,studyTurn*Math.PI/180+(slot%3-1)*.20,(slot%3-1)*.65));const lowest=Math.min(...mesh.userData.supportVertices.map(v=>new THREE.Vector3(...v).applyQuaternion(mesh.quaternion).z));mesh.position.z=.82-lowest;}
   if(mesh.userData.lastSmooth!==smooth){
    const normal=mesh.userData.visualGeometry.getAttribute('normal');
    normal.array.set((smooth?mesh.userData.smoothNormals:mesh.userData.flatNormals).array);
    normal.needsUpdate=true;mesh.userData.lastSmooth=smooth;
   }
   mesh.geometry=showColliders?mesh.userData.collisionGeometry:mesh.userData.visualGeometry;mesh.material=showColliders?mesh.userData.wireMaterial:study&&studyMaterial==='clay'?mesh.userData.clayMaterial:mesh.userData.glassMaterial;mesh.visible=false;
  }
  const sorted=(study?sampleIndices.map(i=>meshes[i]):meshes).map(mesh=>({mesh,z:mesh.position.z})).sort((a,b)=>a.z-b.z);
  const slices=Math.max(1,Math.min(8,Math.round(study?1:layers))),stride=Math.max(1,Math.ceil(sorted.length/slices));
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
  for(const mesh of meshes)disposeMesh(mesh);
  for(const target of [...targets,output])target.dispose();
  plateGeometry.dispose();plateMaterial.dispose();finalGeometry.dispose();finalMaterial.dispose();
  shadowMaterial.dispose();fracture.dispose();environmentTarget?.dispose();renderer.dispose();
  // ExternalTexture is caller-owned: its raw source must never be deleted here.
 }
 renderer.resetState();
 return {setGeometry,render,dispose,audit};
}
