// PROTOTYPE: local-only viewer. No uploads leave the browser.
import * as THREE from 'three';
import { WebGLPathTracer } from 'pathtracer';
import { OrbitControls } from 'orbit';
import { HDRLoader } from 'hdr';
import { Filling, OPTICS } from 'model';
const $=id=>document.getElementById(id);
function fail(message){$('error').hidden=false;$('error').textContent=message;$('status').textContent='Не удалось запустить 3D';}
window.addEventListener('error',e=>fail(e.message));
window.addEventListener('unhandledrejection',e=>fail(String(e.reason)));
try{init();}catch(e){fail('Для просмотра нужен WebGL 2. '+e.message);}
function init(){
 let quality=false,pathTracer=null,qualityScene=null,qualityCamera=null,sharpEnv=null;
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
 let shards=[];const planeData=Array.from({length:432},()=>new THREE.Vector4());
 function rebuildShards(){for(const mesh of shards){chamberGroup.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}shards=[];for(const [pieceIndex,p] of physics.pieces.entries()){const shape=p.body.shapes[0],pos=[],indices=[];shape.vertices.forEach(v=>pos.push(v.x*10,v.y*10,v.z*10));shape.faces.forEach(face=>{for(let i=1;i<face.length-1;i++)indices.push(face[0],face[i],face[i+1]);});shape.faces.forEach((face,j)=>{const n=shape.faceNormals[j],v=shape.vertices[face[0]];planeData[pieceIndex*12+j].set(n.x,n.y,n.z,n.dot(v)*10);});const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));indexed.setIndex(indices);const g=indexed.toNonIndexed();indexed.dispose();g.computeVertexNormals();const m=new THREE.Mesh(g,tintShard(new THREE.MeshPhysicalMaterial({transmission:1,ior:1.52,thickness:p.h*2,attenuationDistance:Number($('clarity').value),roughness:.035,metalness:0,specularIntensity:1,side:THREE.FrontSide}),palettes[palette][p.color]));chamberGroup.add(m);shards.push(m);}}
 // Glass colour comes from absorption over the shard thickness, plus a light base tint so thin edges keep their hue.
 function tintShard(material,hex){material.attenuationColor.set(hex);material.color.set(0xffffff);return material;}
 rebuildShards();
 const opticRenderer=new THREE.WebGLRenderer({antialias:false,alpha:true});opticRenderer.setPixelRatio(Math.min(devicePixelRatio,1.25));opticRenderer.setClearColor(0,0);opticRenderer.toneMapping=THREE.ACESFilmicToneMapping;opticRenderer.toneMappingExposure=1;$('optical-canvas').append(opticRenderer.domElement);
 const uniforms={uChamber:{value:0},uRayOrigin:{value:new THREE.Vector3()},uRayX:{value:new THREE.Vector3()},uRayY:{value:new THREE.Vector3()},uRayZ:{value:new THREE.Vector3()},uAspect:{value:1},uCamTan:{value:1},uSharp:{value:null},uPlanes:{value:planeData},uClarity:{value:2.5},uFloor:{value:0},uCount:{value:24},uPos:{value:Array.from({length:36},()=>new THREE.Vector3())},uRot:{value:Array.from({length:36},()=>new THREE.Vector4(0,0,0,1))},uSize:{value:Array.from({length:36},()=>new THREE.Vector3())},uColors:{value:palettes[palette].map(c=>new THREE.Color(c))},uFov:{value:Math.tan(fov*Math.PI/360)},uRoll:{value:0},uLogo:{value:new THREE.DataTexture(new Uint8Array([255,255,255,0]),1,1)},uHasLogo:{value:0},uEnv:{value:new THREE.DataTexture(new Uint8Array([240,237,214,255]),1,1)},uEnvScale:{value:1/255},uOrient:{value:new THREE.Vector4(0,0,0,1)}};uniforms.uLogo.value.needsUpdate=true;uniforms.uEnv.value.needsUpdate=true;
 const opticalMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`
 precision highp float;
 varying vec2 vUv;
 uniform float uChamber,uAspect,uCamTan;uniform vec3 uRayOrigin,uRayX,uRayY,uRayZ;uniform sampler2D uSharp;uniform vec4 uPlanes[432];uniform float uClarity;uniform int uCount;uniform vec3 uPos[36];uniform vec4 uRot[36];uniform vec3 uSize[36];uniform vec3 uColors[4];uniform float uFov,uRoll,uHasLogo,uFloor,uEnvScale;uniform vec4 uOrient;uniform sampler2D uLogo,uEnv;
 vec3 rotateQ(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
 vec3 localPoint(int i,vec3 p){vec4 q=uRot[i];q.xyz=-q.xyz;return rotateQ(q,p-uPos[i]);}
 vec3 localDirection(int i,vec3 d){vec4 q=uRot[i];q.xyz=-q.xyz;return rotateQ(q,d);}
 bool chip(int i,vec3 p,vec3 d,out float nearT,out float farT,out vec3 enterN,out vec3 exitN){
  vec3 lp=localPoint(i,p),ld=localDirection(i,d);nearT=-1000.;farT=1000.;enterN=vec3(0.);exitN=vec3(0.);
  // Bounding sphere rejects most shards before visiting their twelve planes.
  if(length(cross(lp,ld))>length(uSize[i].xy)+1.)return false;
  for(int j=0;j<12;j++){vec4 pl=uPlanes[i*12+j];float den=dot(pl.xyz,ld),dist=pl.w-dot(pl.xyz,lp);if(abs(den)<.000001){if(dist<0.)return false;}else{float t=dist/den;if(den<0.){if(t>nearT){nearT=t;enterN=pl.xyz;}}else if(t<farT){farT=t;exitN=pl.xyz;}if(nearT>farT)return false;}}
  enterN=rotateQ(uRot[i],enterN);exitN=rotateQ(uRot[i],exitN);return farT>max(nearT,.001);
 }
 vec3 environment(vec3 d){vec3 w=normalize(rotateQ(uOrient,d));vec2 uv=vec2(atan(w.z,w.x)*.15915494+.5,asin(clamp(w.y,-1.,1.))*.31830989+.5);vec3 e=texture2D(uEnv,uv).rgb*uEnvScale;return e/(1.+max(e-1.,0.)*.5);}
 vec3 reflectedLight(vec3 d){vec3 w=normalize(rotateQ(uOrient,d));vec2 uv=vec2(atan(w.z,w.x)*.15915494+.5,asin(clamp(w.y,-1.,1.))*.31830989+.5);return min(texture2D(uSharp,uv).rgb*uEnvScale,vec3(12.));}
 vec3 perturb(vec3 n,vec3 local,int i){float f=float(i)*3.17;vec3 ripple=vec3(sin(local.y*3.4+f)+.35*sin(local.x*12.),cos(local.x*2.7+f)+.25*cos(local.y*17.),0.)*.012;return normalize(n+rotateQ(uRot[i],ripple));}
 float inclusions(vec3 p,int i){vec2 cell=floor(p.xy*2.1),q=fract(p.xy*2.1)-.5;float hash=fract(sin(dot(cell,vec2(127.1,311.7))+float(i)*43.1)*43758.5453);float r=.04+.065*fract(hash*17.);float bubble=1.-smoothstep(r,r+.025,length(q-vec2(sin(hash*65.),cos(hash*31.))*.25));return hash>.67?bubble:0.;}
 vec3 traceGlass(vec3 p,vec3 d){vec3 throughput=vec3(1.),shine=vec3(0.);int previous=-1;
  for(int layer=0;layer<5;layer++){
   float nearest=1000.,farHit=0.;int selected=-1;vec3 normal=vec3(0.),exitNormal=vec3(0.);
   for(int i=0;i<36;i++){if(i>=uCount)break;if(i==previous)continue;float a,b;vec3 en,ex;if(chip(i,p,d,a,b,en,ex)&&a>=-.001&&a<nearest){nearest=max(a,.001);farHit=b;selected=i;normal=en;exitNormal=ex;}}
   float floorT=(.02-p.z)/d.z;if(selected<0||(floorT>0.&&nearest>floorT))break;
   p+=d*nearest;vec3 lp=localPoint(selected,p);normal=perturb(normal,lp,selected);
   float fresnel=.042+.958*pow(1.-max(dot(-d,normal),0.),5.);
   shine+=throughput*reflectedLight(reflect(d,normal))*fresnel*1.8;throughput*=1.-fresnel;
   vec3 inner=refract(d,normal,1./1.52);if(length(inner)<.01)break;
   p+=inner*.003;float a,b;vec3 en,ex;if(!chip(selected,p,inner,a,b,en,ex))break;
   int k=selected-selected/4*4;vec3 tint=uColors[0];if(k==1)tint=uColors[1];if(k==2)tint=uColors[2];if(k==3)tint=uColors[3];
   // Beer–Lambert: the same transmission colour/distance as the 3D material.
   float textureDensity=1.+.16*sin(lp.x*6.+sin(lp.y*5.))+.10*sin(lp.y*18.);
   throughput*=exp(log(max(tint,vec3(.015)))*max(b,.01)*textureDensity/uClarity);
   float bubbles=inclusions(lp,selected);throughput*=1.-bubbles*.42;shine+=throughput*bubbles*.12;
   p+=inner*(b+.003);ex=perturb(ex,localPoint(selected,p),selected);vec3 outD=refract(inner,-ex,1.52);
   if(length(outD)<.01){shine+=throughput*environment(reflect(inner,ex))*.15;throughput*=.14;break;}
   d=normalize(outD);p+=d*.004;previous=selected;
  }
  vec3 back=p+d*((.02-p.z)/min(d.z,-.001));vec3 bg=environment(d);
  if(length(back.xy)>18.8||d.z>0.)bg=vec3(.025,.032,.025);
  if(uHasLogo>.5){vec2 uv=back.xy/14.+.5;if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){vec4 logo=texture2D(uLogo,uv);bg=mix(bg,logo.rgb,logo.a);}}
  return shine+throughput*bg;
 }
 void main(){
  if(uChamber>.5){vec2 xy=vUv*2.-1.;vec3 ray=normalize(uRayZ+uRayX*xy.x*uCamTan*uAspect+uRayY*xy.y*uCamTan);float t=(9.999-uRayOrigin.z)/ray.z;vec3 hit=uRayOrigin+ray*t;
   vec3 bg=mix(vec3(.055,.10,.085),vec3(.12,.19,.155),1.-length(xy)*.35);
   if(t>0.&&length(hit.xy)<18.8&&ray.z<0.){bg=traceGlass(hit,ray);bg=bg/(1.+bg*.25);}gl_FragColor=vec4(pow(max(bg,vec3(0.)),vec3(1./2.2)),1.);return;}
  vec2 uv=vUv*2.-1.;float radius=length(uv);if(radius>1.){gl_FragColor=vec4(0.);return;}
  float c=cos(uRoll),s=sin(uRoll);vec2 q=mat2(c,-s,s,c)*uv;
  vec3 p=vec3(0.,0.,191.9999),d=normalize(vec3(q*uFov,-1.));float loss=1.;bool done=false;
  // CAD inner planes: dot(n, xy) <= 6.139528; mirror length 180 mm.
  for(int bounce=0;bounce<64;bounce++){
   float distance=(12.-p.z)/d.z;vec2 hit=vec2(0.);bool mirror=false;
   for(int j=0;j<3;j++){vec2 n=j==0?vec2(0.,-1.):j==1?vec2(.8660254038,.5):vec2(-.8660254038,.5);float den=dot(n,d.xy);if(den>.000001){float t=(6.1395280957-dot(n,p.xy))/den;if(t>=-.00001&&t<distance){distance=max(0.,t);hit=n;mirror=true;}}}
   p+=d*distance;if(!mirror){done=true;break;}d.xy=reflect(d.xy,hit);p.xy-=hit*.000001;loss*=.975;
  }
  if(!done){gl_FragColor=vec4(.035,.055,.044,1.);return;}
  // The CAD nasipka disk defines a volume, not an identified glass window.
  p+=d*((10.-p.z)/d.z);p.z=9.999;
  vec3 col=traceGlass(p,d);
  col*=loss;col=pow(max(col,vec3(0.)),vec3(1./2.2));float vignette=1.-.25*pow(radius,4.);float aperture=1.-smoothstep(.97,1.,radius);gl_FragColor=vec4(col*vignette*aperture,1.);
 }`});
 const pmrem=new THREE.PMREMGenerator(renderer);
 new HDRLoader().load(HDRI,hdr=>{sharpEnv=hdr.clone();sharpEnv.mapping=THREE.EquirectangularReflectionMapping;uniforms.uSharp.value=sharpEnv;uniforms.uSharp.value.needsUpdate=true;scene.environment=pmrem.fromEquirectangular(hdr).texture;scene.environmentIntensity=1;fill.intensity=.5;light.intensity=1.6;rim.intensity=.8;installBacklight(hdr);hdr.dispose();pmrem.dispose();$('env').textContent='студийная HDRI загружена';},undefined,()=>{$('env').textContent='HDRI не загрузилась, только аналитический свет';});
 // A frosted end window turns the environment into a soft backlight: a 64x32 box-filtered, blurred equirect keeps the hemisphere gradient and lamp glow.
 function installBacklight(hdr){const image=hdr.image,W=64,H=32,sw=image.width,sh=image.height,src=image.data instanceof Uint16Array?Float32Array.from(image.data,THREE.DataUtils.fromHalfFloat):image.data,bw=Math.floor(sw/W),bh=Math.floor(sh/H),small=new Float32Array(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){let r=0,g=0,b=0;for(let j=0;j<bh;j++)for(let i=0;i<bw;i++){const k=((y*bh+j)*sw+x*bw+i)*4;r+=src[k];g+=src[k+1];b+=src[k+2];}const o=(y*W+x)*3,n=bw*bh;small[o]=r/n;small[o+1]=g/n;small[o+2]=b/n;}
  for(let pass=0;pass<3;pass++){const next=new Float32Array(small.length);for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++){let sum=0,n=0;for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=H)continue;for(let dx=-1;dx<=1;dx++){sum+=small[(yy*W+(x+dx+W)%W)*3+c];n++;}}next[(y*W+x)*3+c]=sum/n;}small.set(next);}
  let mean=0;for(let i=0;i<W*H;i++)mean+=.2126*small[i*3]+.7152*small[i*3+1]+.0722*small[i*3+2];mean/=W*H;
  const half=new Uint16Array(W*H*4);for(let i=0;i<W*H;i++){half[i*4]=THREE.DataUtils.toHalfFloat(small[i*3]);half[i*4+1]=THREE.DataUtils.toHalfFloat(small[i*3+1]);half[i*4+2]=THREE.DataUtils.toHalfFloat(small[i*3+2]);half[i*4+3]=THREE.DataUtils.toHalfFloat(1);}
  const texture=new THREE.DataTexture(half,W,H,THREE.RGBAFormat,THREE.HalfFloatType);texture.flipY=hdr.flipY;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.colorSpace=THREE.LinearSRGBColorSpace;texture.needsUpdate=true;
  uniforms.uEnv.value.dispose();uniforms.uEnv.value=texture;uniforms.uEnvScale.value=.92/Math.max(mean,1e-4);backlight={small,W,H};}
 // Eye adaptation: expose the eyepiece view to the environment seen along the product axis, so a dark floor and a bright lamp both read well.
 let backlight=null;const axis=new THREE.Vector3();
 function adaptExposure(){if(!backlight)return;axis.set(0,0,-1).applyQuaternion(root.quaternion);const {small,W,H}=backlight;const u=Math.atan2(axis.z,axis.x)/(2*Math.PI)+.5,v=Math.asin(Math.max(-1,Math.min(1,axis.y)))/Math.PI+.5;const x=((Math.round(u*W)%W)+W)%W,y=Math.max(0,Math.min(H-1,Math.round((1-v)*(H-1))));let lum=0,n=0;for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=H)continue;for(let dx=-1;dx<=1;dx++){const o=(yy*W+(x+dx+W)%W)*3;lum+=.2126*small[o]+.7152*small[o+1]+.0722*small[o+2];n++;}}const target=.92/Math.max(lum/n,1e-4);uniforms.uEnvScale.value+=(target-uniforms.uEnvScale.value)*.08;}
 const chamberMaterial=opticalMaterial.clone();chamberMaterial.uniforms={...uniforms,uChamber:{value:1}};const chamberScene=new THREE.Scene();chamberScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),chamberMaterial));
 const opticScene=new THREE.Scene();opticScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),opticalMaterial));const opticCamera=new THREE.Camera();
 let renderErrors=0;for(const r of [renderer,opticRenderer])r.debug.onShaderError=()=>{renderErrors++;fail('Ошибка шейдера: оптический просмотр не запущен.');};
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart;
 renderer.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',e=>{if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(Object.values(meshParts).filter(m=>m.visible));if(hits[0]?.object.name==='glazok')setMode('eye');if(['elving','nasipka'].includes(hits[0]?.object.name))setMode('chamber');});
 function pose(){root.rotation.set((physics.tilt-90)*Math.PI/180,0,physics.roll*Math.PI/180,'XYZ');uniforms.uRoll.value=-physics.roll*Math.PI/180;const q=root.quaternion;uniforms.uOrient.value.set(q.x,q.y,q.z,q.w);}
 function stopQuality(){quality=false;controls.enabled=true;$('quality').textContent='Рассмотреть стекло';$('stage').classList.remove('quality');$('optic-tag').textContent='Живые отражения';}
 function setMode(next){stopQuality();mode=next;$('stage').classList.toggle('eye',mode==='eye');document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  for(const [name,mesh] of Object.entries(meshParts))mesh.visible=name!=='nasipka'&&mode!=='chamber'&&(mode!=='inside'||name!=='trubka');
  meshParts.prizma.material.transparent=mode==='inside';meshParts.prizma.material.opacity=mode==='inside'?.42:1;
  wall.visible=mode==='chamber'||mode==='inside';
  controls.target.set(0,0,0);root.position.set(0,0,0);
  if(mode==='chamber'){const focus=new THREE.Vector3(0,0,-95).applyQuaternion(root.quaternion);controls.target.copy(focus);camera.position.copy(focus).add(new THREE.Vector3(33,-22,66).applyQuaternion(root.quaternion));controls.minDistance=25;controls.maxDistance=200;}
  else{camera.position.set(350,150,375);controls.minDistance=130;controls.maxDistance=700;}
  controls.update();
  const copy={assembly:['АВТОРСКИЙ / СОБРАННАЯ МОДЕЛЬ','Каждая деталь на своём месте'],inside:['ВНУТРЕННЯЯ СБОРКА / КОРПУС СКРЫТ','Три зеркала и камера со стёклышками'],chamber:['КАМЕРА НАСЫПКИ / УВЕЛИЧЕННЫЙ ВИД','Стёклышки, которые действительно движутся'],eye:['ВЗГЛЯД ЧЕРЕЗ ГЛАЗОК','Одна насыпка. Множество отражений.']}[mode];$('view-kicker').textContent=copy[0];$('view-title').textContent=copy[1];$('gesture').textContent=mode==='eye'?'Тяните по узору: вбок поворот, вверх-вниз наклон · или встряхните':'Тяните для вращения · колесо для приближения';updateUI();resize();
 }
 function updateUI(){const s=physics.state();$('roll').value=s.roll;$('tilt').value=s.tilt;$('roll-out').value=s.roll+'°';$('tilt-out').value=s.tilt+'°';$('fov-out').value=fov+'°';$('fov').value=fov;$('count').value=s.count;$('count-label').textContent=s.count+' шт.';$('pause').textContent=s.paused?'Продолжить':'Пауза';$('moving').textContent=s.paused?'На паузе':s.count===0?'Камера пуста':s.shaking?'Встряхивание…':s.moving>0?s.moving+' в движении':'Стёклышки улеглись';$('containment').textContent=s.escaped?'Есть выход за стенку':'Все внутри';$('status').textContent=s.paused?'Симуляция приостановлена':s.count===0?'Пустая камера · отражения работают':'Физика и оптика связаны';$('scenario-state').textContent=`${s.count} стёклышек · поворот ${s.roll}° · наклон ${s.tilt}° · ${s.paused?'пауза':'движение разрешено'}`;}
 function reset(count=36){$('clarity').value=2.5;$('clarity-out').value='Витражное';uniforms.uClarity.value=2.5;physics.depth=10;physics.reset(count,71);updateDepth();palette='jewel';fov=18;uniforms.uFov.value=Math.tan(fov*Math.PI/360);document.querySelectorAll('[data-palette]').forEach(b=>b.classList.toggle('selected',b.dataset.palette===palette));uniforms.uColors.value=palettes[palette].map(c=>new THREE.Color(c));clearLogo();rebuildShards();pose();updateUI();}
 function orient(roll,tilt){stopQuality();const offset=camera.position.clone().sub(controls.target).applyQuaternion(root.quaternion.clone().invert());physics.setOrientation(roll,tilt);pose();if(mode==='chamber'){const target=new THREE.Vector3(0,0,-95).applyQuaternion(root.quaternion);controls.target.copy(target);camera.position.copy(target).add(offset.applyQuaternion(root.quaternion));}updateUI();}
 function updateDepth(){chamberGroup.position.z=0;wall.scale.z=physics.depth;rings.forEach(r=>r.scale.z=physics.depth);uniforms.uFloor.value=0;}

 $('clarity').oninput=()=>{stopQuality();const distance=Number($('clarity').value);uniforms.uClarity.value=distance;shards.forEach(m=>m.material.attenuationDistance=distance);$('clarity-out').value=distance<2.5?'Насыщенное':distance<6?'Витражное':'Светлое';};
 $('count').addEventListener('change',()=>{stopQuality();const r=physics.roll,t=physics.tilt;physics.reset(Number($('count').value),71);rebuildShards();orient(r,t);});
 $('shake').onclick=()=>{stopQuality();physics.paused=false;physics.shake();updateUI();};$('pause').onclick=()=>{stopQuality();physics.paused=!physics.paused;updateUI();};$('reset').onclick=()=>{reset();setMode('assembly');};$('turn').onclick=()=>orient(((physics.roll+225)%360)-180,physics.tilt);
 $('roll').oninput=()=>orient(Number($('roll').value),physics.tilt);$('tilt').oninput=()=>orient(physics.roll,Number($('tilt').value));$('fov').oninput=()=>{stopQuality();fov=Number($('fov').value);uniforms.uFov.value=Math.tan(fov*Math.PI/360);updateUI();};
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('enlarge').onclick=()=>setMode('eye');
 const optic=$('optical-canvas');let drag=null;optic.style.touchAction='none';optic.style.cursor='grab';
 optic.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,roll:physics.roll,tilt:physics.tilt};optic.setPointerCapture(e.pointerId);optic.style.cursor='grabbing';});
 optic.addEventListener('pointermove',e=>{if(!drag)return;const k=180/optic.clientWidth;const roll=((drag.roll+(e.clientX-drag.x)*k+540)%360)-180,tilt=Math.max(0,Math.min(180,drag.tilt-(e.clientY-drag.y)*k));orient(Math.round(roll),Math.round(tilt));});
 const endDrag=()=>{drag=null;optic.style.cursor='grab';};optic.addEventListener('pointerup',endDrag);optic.addEventListener('pointercancel',endDrag);
 document.querySelectorAll('[data-palette]').forEach(b=>b.onclick=()=>{stopQuality();palette=b.dataset.palette;document.querySelectorAll('[data-palette]').forEach(x=>x.classList.toggle('selected',x===b));shards.forEach((m,i)=>tintShard(m.material,palettes[palette][i%4]));uniforms.uColors.value=palettes[palette].map(c=>new THREE.Color(c));updateUI();});
 let logoPlane=null,logoTicket=0;
 function clearLogo(){stopQuality();logoTicket++;if(logoPlane){chamberGroup.remove(logoPlane);logoPlane.geometry.dispose();logoPlane.material.dispose();logoPlane=null;}if(uniforms.uHasLogo.value)uniforms.uLogo.value.dispose();uniforms.uHasLogo.value=0;$('logo').value='';$('logo-status').textContent='Логотип не загружен';}
 $('logo-clear').onclick=clearLogo;
 $('logo').onchange=async()=>{const file=$('logo').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){$('logo-status').textContent='Выберите PNG, JPEG или WebP до 10 МБ.';return;}const ticket=++logoTicket;try{const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d');const k=Math.min(1024/bitmap.width,1024/bitmap.height);ctx.drawImage(bitmap,(1024-bitmap.width*k)/2,(1024-bitmap.height*k)/2,bitmap.width*k,bitmap.height*k);bitmap.close();if(ticket!==logoTicket)return;clearLogo();const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;uniforms.uLogo.value=texture;uniforms.uHasLogo.value=1;logoPlane=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));logoPlane.position.z=.05;chamberGroup.add(logoPlane);$('logo-status').textContent=file.name+' · только в этом браузере';}catch(e){$('logo-status').textContent='Не удалось прочитать изображение.';}};
 const scenarios={motion:{help:'Сравните положение стёкол и отражения после встряхивания и наклона. Это одна и та же насыпка.',steps:[['1. Посмотреть насыпку',()=>setMode('chamber')],['2. Встряхнуть',()=>{physics.shake();setMode('chamber');}],['3. Заглянуть в глазок',()=>setMode('eye')],['4. Наклонить на 45°',()=>orient(90,45)]]},empty:{help:'Без стёклышек остаётся светлое поле. Поворот не должен создавать цветной узор из ничего.',steps:[['1. Убрать насыпку',()=>{reset(0);setMode('eye');}],['2. Встряхнуть пустую',()=>physics.shake()],['3. Вернуть 24 стёклышка',()=>{reset(24);setMode('eye');}]]},pause:{help:'Пауза останавливает тела. Смена вида сохраняет их положения; сброс возвращает исходный набор.',steps:[['1. Встряхнуть',()=>{physics.shake();setMode('chamber');}],['2. Остановить',()=>{physics.paused=true;}],['3. Посмотреть через глазок',()=>setMode('eye')],['4. Продолжить',()=>{physics.paused=false;}],['5. Сбросить',()=>{reset();setMode('assembly');}]]}};
 document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{reset();setMode('assembly');const scenario=scenarios[b.dataset.scenario];$('scenario-help').textContent=scenario.help;$('scenario-steps').replaceChildren();const buttons=scenario.steps.map(([label,action],index)=>{const button=document.createElement('button');button.textContent=label;button.disabled=index!==0;button.onclick=()=>{action();updateUI();button.disabled=true;if(buttons[index+1])buttons[index+1].disabled=false;};$('scenario-steps').append(button);return button;});});
 // High-quality still uses the exact same current bodies, colours and mirror mesh.
 $('quality').onclick=()=>{
  if(quality){stopQuality();physics.paused=false;updateUI();return;}
  if(!sharpEnv){$('quality').textContent='Дождитесь загрузки света';return;}
  if(mode!=='eye'&&mode!=='chamber')setMode('chamber');
  physics.paused=true;updateUI();scene.updateMatrixWorld(true);
  if(qualityScene){qualityScene.traverse(o=>{if(o.isMesh){o.material.dispose();if(o.userData.ownGeometry)o.geometry.dispose();}});}
  qualityScene=new THREE.Scene();qualityScene.environment=sharpEnv;qualityScene.environmentIntensity=.65;qualityScene.background=new THREE.Color(0x182c24);
  const copy=(mesh)=>{const m=new THREE.Mesh(mesh.geometry,mesh.material.clone());m.matrixAutoUpdate=false;m.matrix.copy(mesh.matrixWorld);qualityScene.add(m);return m;};
  shards.forEach(mesh=>{const m=copy(mesh);m.material.side=THREE.DoubleSide;});
  const end=copy(floor);end.material.dispose();end.material=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff4d8,emissiveIntensity:.85,side:THREE.DoubleSide,roughness:.45});
  if(logoPlane)copy(logoPlane);
  if(mode==='eye'){
   const mirrors=copy(meshParts.prizma);mirrors.geometry=mirrors.geometry.toNonIndexed();mirrors.geometry.computeVertexNormals();mirrors.userData.ownGeometry=true;mirrors.material.dispose();mirrors.material=new THREE.MeshStandardMaterial({color:0xffffff,metalness:1,roughness:.001,side:THREE.DoubleSide});
   qualityCamera=new THREE.PerspectiveCamera(fov,1,.01,1000);qualityCamera.position.set(0,0,91.9).applyQuaternion(root.quaternion);qualityCamera.quaternion.copy(root.quaternion);qualityCamera.updateMatrixWorld();
  }else{qualityCamera=camera.clone();qualityCamera.updateMatrixWorld();}
  if(pathTracer)pathTracer.dispose();
  pathTracer=new WebGLPathTracer(mode==='eye'?opticRenderer:renderer);pathTracer.bounces=36;pathTracer.transmissiveBounces=24;pathTracer.tiles.set(2,2);pathTracer.renderScale=.8;pathTracer.minSamples=1;pathTracer.fadeDuration=0;pathTracer.renderDelay=0;pathTracer.filterGlossyFactor=.02;pathTracer.setScene(qualityScene,qualityCamera);
  quality=true;controls.enabled=false;$('quality').textContent='Вернуться к движению';$('stage').classList.add('quality');$('optic-tag').textContent='Свет уточняется · сцена на паузе';
 };
 let modelWidth=0,modelHeight=0,opticSize=0;
 function resize(){if(quality)stopQuality();const rect=$('model-view').getBoundingClientRect(),op=$('optical-canvas').getBoundingClientRect();renderer.setPixelRatio(mode==='chamber'?Math.min(1,640/Math.max(rect.width,1)):Math.min(devicePixelRatio,1.25));opticRenderer.setPixelRatio(Math.min(devicePixelRatio,600/Math.max(op.width,1)));if(rect.width&&rect.height&&(rect.width!==modelWidth||rect.height!==modelHeight)){modelWidth=rect.width;modelHeight=rect.height;renderer.setSize(modelWidth,modelHeight,false);camera.aspect=modelWidth/modelHeight;camera.updateProjectionMatrix();}if(op.width&&op.width!==opticSize){opticSize=op.width;opticRenderer.setSize(opticSize,opticSize,false);}}
 const observer=new ResizeObserver(resize);observer.observe($('model-view'));observer.observe($('optical-canvas'));pose();setMode('assembly');
 let last=performance.now(),acc=0,lastState=0,frames=0,fpsTime=last;
 function frame(now){if(disposed)return;const dt=Math.min((now-last)/1000,.045);last=now;acc+=dt;let substeps=0;while(acc>=1/720&&substeps<33){physics.step();acc-=1/720;substeps++;}if(physics.paused)acc=0;
  physics.pieces.forEach((p,i)=>{const b=p.body;shards[i].position.copy(b.position).multiplyScalar(10);shards[i].quaternion.copy(b.quaternion);uniforms.uPos.value[i].copy(b.position).multiplyScalar(10);uniforms.uRot.value[i].set(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w);uniforms.uSize.value[i].set(p.sx,p.sy,p.h);});uniforms.uCount.value=physics.pieces.length;
  adaptExposure();controls.update();if(quality&&mode==='chamber'){pathTracer.renderSample();}else if(mode==='chamber'){
   const inverse=root.quaternion.clone().invert();uniforms.uRayOrigin.value.copy(camera.position).applyQuaternion(inverse);uniforms.uRayOrigin.value.z+=100;
   uniforms.uRayX.value.set(1,0,0).applyQuaternion(camera.quaternion).applyQuaternion(inverse);uniforms.uRayY.value.set(0,1,0).applyQuaternion(camera.quaternion).applyQuaternion(inverse);uniforms.uRayZ.value.set(0,0,-1).applyQuaternion(camera.quaternion).applyQuaternion(inverse);uniforms.uAspect.value=camera.aspect;uniforms.uCamTan.value=Math.tan(camera.fov*Math.PI/360);if(uniforms.uRayOrigin.value.z>10)renderer.render(chamberScene,opticCamera);else renderer.render(scene,camera);
  }else renderer.render(scene,camera);if(quality&&mode==='eye')pathTracer.renderSample();else opticRenderer.render(opticScene,opticCamera);frames++;if(now-lastState>350){updateUI();lastState=now;}if(now-fpsTime>1000){$('fps').textContent=quality?'Уточнение света · '+Math.floor(pathTracer.samples)+' проходов':Math.round(frames*1000/(now-fpsTime))+' fps';fpsTime=now;frames=0;}requestAnimationFrame(frame);
 }
 document.addEventListener('visibilitychange',()=>{last=performance.now();acc=0;});requestAnimationFrame(frame);
 // Read-only diagnostics used by the walkthrough, with no mutation interface.
 window.PROTOTYPE=Object.freeze({snapshot:()=>({mode,palette,fov,...physics.state(),shaderErrors:renderErrors,parts:Object.keys(CAD),positions:physics.pieces.map(p=>[p.body.position.x,p.body.position.y,p.body.position.z]),orientations:physics.pieces.map(p=>[p.body.quaternion.x,p.body.quaternion.y,p.body.quaternion.z,p.body.quaternion.w])})});
 window.addEventListener('pagehide',()=>{disposed=true;if(pathTracer)pathTracer.dispose();if(sharpEnv)sharpEnv.dispose();observer.disconnect();controls.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});renderer.dispose();opticRenderer.dispose();});
}
