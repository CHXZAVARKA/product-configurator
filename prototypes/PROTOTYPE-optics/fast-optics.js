// One live chamber image, reused through a cached map of the CAD mirror corridor.
import * as THREE from 'three';
const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const glassVertex = `varying vec3 vPosition,vNormal,vLocal;void main(){vec4 world=modelMatrix*vec4(position,1.);vPosition=world.xyz;vNormal=mat3(modelMatrix)*normal;vLocal=position;gl_Position=projectionMatrix*viewMatrix*world;}`;
const glassFragment = `
 varying vec3 vPosition,vNormal,vLocal;
 uniform vec3 uColor;uniform float uThickness,uClarity,uReflection,uHasEnv;uniform sampler2D uEnv;
 void main(){
  vec3 eye=normalize(cameraPosition-vPosition),n=normalize(vNormal);
  float incidence=max(abs(dot(n,eye)),.24);
  float ripple=sin(vLocal.x*4.+sin(vLocal.y*2.))*sin(vLocal.y*6.);
  float density=1.+.06*ripple;
  float fresnel=.035+.965*pow(1.-incidence,5.);
  vec3 transmission=exp(log(max(uColor,vec3(.025)))*uThickness*density/(uClarity*incidence));
  vec3 colour=transmission*(1.-fresnel*.45);
  if(uReflection>.5){
   n=normalize(n+vec3(sin(vLocal.y*7.),cos(vLocal.x*5.),sin(vLocal.z*9.))*.003);
   vec3 direction=reflect(-eye,n);
   vec2 uv=vec2(atan(direction.z,direction.x)*.15915494+.5,asin(clamp(direction.y,-1.,1.))*.31830989+.5);
   vec3 env=uHasEnv>.5?min(texture2D(uEnv,uv).rgb,vec3(3.)):vec3(.4);
   vec2 cell=fract(vLocal.xy*1.4)-.5;
   float speck=pow(max(0.,1.-length(cell)*9.),5.)*.015;
   colour=env*(.018+fresnel*.28)+vec3(speck);
  }
  gl_FragColor=vec4(colour,1.);
  #include <colorspace_fragment>
 }`;
export function createGlassMesh(geometry,{colour,thickness,clarity}) {
 const uniforms={uColor:{value:new THREE.Color(colour)},uThickness:{value:thickness},uClarity:{value:clarity},uEnv:{value:null},uHasEnv:{value:0},uReflection:{value:0}};
 const absorption=new THREE.ShaderMaterial({uniforms,vertexShader:glassVertex,fragmentShader:glassFragment,transparent:true,depthWrite:false,side:THREE.FrontSide,toneMapped:false,blending:THREE.CustomBlending,blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor});
 const reflection=new THREE.ShaderMaterial({uniforms:{...uniforms,uReflection:{value:1}},vertexShader:glassVertex,fragmentShader:glassFragment,transparent:true,depthWrite:false,side:THREE.FrontSide,toneMapped:false,blending:THREE.AdditiveBlending});
 const mesh=new THREE.Mesh(geometry,absorption),shine=new THREE.Mesh(geometry,reflection);
 mesh.renderOrder=10;shine.renderOrder=20;mesh.add(shine);return mesh;
}
export function colourGlass(mesh,colour){mesh.material.uniforms.uColor.value.set(colour);}
export function clarityGlass(mesh,distance){mesh.material.uniforms.uClarity.value=distance;}
export function lightGlass(mesh,environment){mesh.material.uniforms.uEnv.value=environment;mesh.material.uniforms.uHasEnv.value=environment?1:0;}
export function disposeGlass(mesh){mesh.geometry.dispose();mesh.material.dispose();mesh.children.forEach(child=>child.material.dispose());}

export class FastOptics {
 constructor(renderer){
  this.renderer=renderer;this.sourcePasses=0;this.mirrorPasses=0;
  this.hdr=renderer.extensions.has('EXT_color_buffer_float');
  this.target=new THREE.WebGLRenderTarget(384,384,{depthBuffer:true,type:this.hdr?THREE.HalfFloatType:THREE.UnsignedByteType});
  this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;
  // RG and BA each encode a 16-bit UV coordinate. RGBA8 also works without float render targets.
  this.lookup=new THREE.WebGLRenderTarget(512,512,{depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#182e24');
  this.root=new THREE.Group();this.scene.add(this.root);this.copies=[];
  this.camera=new THREE.OrthographicCamera(-19,19,19,-19,.1,100);this.camera.position.z=60;
  this.emptyLogo=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);this.emptyLogo.needsUpdate=true;
  this.floorMaterial=new THREE.ShaderMaterial({uniforms:{uLogo:{value:this.emptyLogo},uHasLogo:{value:0},uLight:{value:1},uGain:{value:this.hdr?3:1},uRelief:{value:.65},uDirection:{value:new THREE.Vector3(0,0,1)}},vertexShader:`varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
 varying vec2 p;uniform sampler2D uLogo;uniform float uHasLogo,uLight,uRelief,uGain;uniform vec3 uDirection;
 float height(vec2 q){return .42*sin(q.x*.53+q.y*.21)+.29*sin(q.y*.72-q.x*.16)+.12*sin(q.x*1.6+sin(q.y*.9));}
 void main(){
  float e=.12,h=height(p);vec2 gradient=vec2(height(p+vec2(e,0.))-height(p-vec2(e,0.)),height(p+vec2(0.,e))-height(p-vec2(0.,e)))/(2.*e);
  vec3 normal=normalize(vec3(-gradient*uRelief,1.));
  vec3 ray=refract(normalize(vec3(uDirection.xy*.25,-1.)),normal,1./1.52);
  vec2 lightPoint=p+ray.xy/max(.25,abs(ray.z))*4.;
  float laplace=(height(p+vec2(e,0.))+height(p-vec2(e,0.))+height(p+vec2(0.,e))+height(p-vec2(0.,e))-4.*h)/(e*e);
  float focus=clamp(1.-laplace*uRelief*.6,.45,1.6);
  float fresnel=.04+.96*pow(1.-max(0.,dot(normal,vec3(0.,0.,1.))),5.);
  vec3 c=vec3(.96,.94,.85)*uLight*uGain*focus*(1.-fresnel)*(1.-.06*dot(p,p)/354.);
  vec2 uv=lightPoint/14.+.5;
  if(uHasLogo>.5&&all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){vec4 l=texture2D(uLogo,uv);c*=mix(vec3(1.),l.rgb,l.a);}
  gl_FragColor=vec4(c,1.);
  #include <colorspace_fragment>
 }`,side:THREE.DoubleSide,toneMapped:false});
  this.floor=new THREE.Mesh(new THREE.CircleGeometry(18.8,96),this.floorMaterial);this.floor.position.z=-.15;this.root.add(this.floor);
  this.quad=new THREE.PlaneGeometry(2,2);this.screenCamera=new THREE.Camera();
  this.mapMaterial=new THREE.ShaderMaterial({uniforms:{uFov:{value:Math.tan(18*Math.PI/360)}},vertexShader:vertex,depthTest:false,depthWrite:false,toneMapped:false,fragmentShader:`
   varying vec2 vUv;uniform float uFov;
   vec2 pack16(float x){float n=floor(clamp(x,0.,1.)*65535.+.5);return vec2(floor(n/256.),mod(n,256.))/255.;}
   void main(){vec3 p=vec3(0.,0.,191.9999),d=normalize(vec3((vUv*2.-1.)*uFov,-1.));
    for(int bounce=0;bounce<64;bounce++){
     float distance=(12.-p.z)/d.z;vec2 hit=vec2(0.);bool mirror=false;
     for(int j=0;j<3;j++){vec2 n=j==0?vec2(0.,-1.):j==1?vec2(.8660254038,.5):vec2(-.8660254038,.5);float den=dot(n,d.xy);if(den>.000001){float t=(6.1395280957-dot(n,p.xy))/den;if(t>=-.00001&&t<distance){distance=max(0.,t);hit=n;mirror=true;}}}
     p+=d*distance;if(!mirror)break;d.xy=reflect(d.xy,hit);p.xy-=hit*.000001;
    }
    vec2 uv=p.xy/38.+.5;gl_FragColor=vec4(pack16(uv.x),pack16(uv.y));
   }`});
  this.mapScene=new THREE.Scene();this.mapScene.add(new THREE.Mesh(this.quad,this.mapMaterial));
  this.material=new THREE.ShaderMaterial({uniforms:{uSource:{value:this.target.texture},uMap:{value:this.lookup.texture},uRoll:{value:0},uHDR:{value:this.hdr?1:0}},vertexShader:vertex,depthTest:false,depthWrite:false,toneMapped:false,fragmentShader:`
   varying vec2 vUv;uniform sampler2D uSource,uMap;uniform float uRoll,uHDR;
   float unpack16(vec2 v){return dot(v,vec2(65280.,255.))/65535.;}
   void main(){vec2 p=vUv*2.-1.;float r=length(p);if(r>1.){gl_FragColor=vec4(0.);return;}
    float c=cos(uRoll),s=sin(uRoll);vec2 q=mat2(c,-s,s,c)*p;
    vec4 encoded=texture2D(uMap,q*.5+.5);vec2 uv=vec2(unpack16(encoded.rg),unpack16(encoded.ba));
    vec3 colour=texture2D(uSource,uv).rgb*(1.-.18*pow(r,4.));
    if(uHDR>.5)colour=clamp((colour*(2.51*colour+.03))/(colour*(2.43*colour+.59)+.14),0.,1.);
    gl_FragColor=vec4(colour*(1.-smoothstep(.985,1.,r)),1.);
    #include <colorspace_fragment>
   }`});
  this.screen=new THREE.Scene();this.screen.add(new THREE.Mesh(this.quad,this.material));this.mapDirty=true;
 }
 setShards(shards){
  this.copies.forEach(mesh=>this.root.remove(mesh));this.copies=[];this.shards=shards;
  for(const original of shards){const mesh=new THREE.Mesh(original.geometry,original.material);mesh.renderOrder=10;const shine=new THREE.Mesh(original.geometry,original.children[0].material);shine.renderOrder=20;mesh.add(shine);this.root.add(mesh);this.copies.push(mesh);}
 }
 setLight(value){this.floorMaterial.uniforms.uLight.value=value;}
 setRelief(value){this.floorMaterial.uniforms.uRelief.value=value;}
 setLogo(texture){this.floorMaterial.uniforms.uLogo.value=texture||this.emptyLogo;this.floorMaterial.uniforms.uHasLogo.value=texture?1:0;}
 setFov(degrees){const value=Math.tan(degrees*Math.PI/360);if(value!==this.mapMaterial.uniforms.uFov.value){this.mapMaterial.uniforms.uFov.value=value;this.mapDirty=true;}}
 render(orientation,roll){
  const renderer=this.renderer;
  this.floorMaterial.uniforms.uDirection.value.set(.35,.6,1).applyQuaternion(orientation.clone().invert());
  this.root.quaternion.copy(orientation);this.camera.position.set(0,0,60).applyQuaternion(orientation);this.camera.quaternion.copy(orientation);
  this.copies.forEach((mesh,i)=>{mesh.position.copy(this.shards[i].position);mesh.quaternion.copy(this.shards[i].quaternion);});
  renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);this.sourcePasses++;
  if(this.mapDirty){renderer.setRenderTarget(this.lookup);renderer.render(this.mapScene,this.screenCamera);this.mapDirty=false;this.mirrorPasses++;}
  renderer.setRenderTarget(null);this.material.uniforms.uRoll.value=-roll*Math.PI/180;renderer.render(this.screen,this.screenCamera);
 }
 dispose(){this.target.dispose();this.lookup.dispose();this.quad.dispose();this.material.dispose();this.mapMaterial.dispose();this.floor.geometry.dispose();this.floorMaterial.dispose();this.emptyLogo.dispose();}
}
