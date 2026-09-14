import * as THREE from 'three';
import {transformVertices} from './geometry.mjs';
export class LabView {
 constructor(canvas,chamber,physics){
  this.physics=physics;this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor('#e9ede9');
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(35,1,.1,500);this.camera.up.set(0,1,0);this.side=false;
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x667078,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-20,20,40);this.scene.add(light);
  const grid=new THREE.GridHelper(40,20,0x96a49d,0xc8d1cb);grid.rotation.x=Math.PI/2;grid.position.z=-.55;this.scene.add(grid);
  this.cadGroup=new THREE.Group();this.scene.add(this.cadGroup);
  for(const part of chamber.parts){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));g.setIndex(part.indices);g.computeVertexNormals();
   const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:part.name==='elving'?0xa8b2ae:0x74817b,transparent:true,opacity:part.name==='elving'?.25:.13,side:THREE.DoubleSide,depthWrite:false}));this.cadGroup.add(mesh);
   if(part.name==='nasipka'){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(g,25),new THREE.LineBasicMaterial({color:0x69776e}));this.cadGroup.add(edge);}
  }
  // Crop rendering of the long tube only; physics retains all original CAD triangles.
  const clip=new THREE.Plane(new THREE.Vector3(0,0,-1),12.5);this.renderer.localClippingEnabled=true;for(const m of this.cadGroup.children)if(m.material)m.material.clippingPlanes=[clip];
  this.chipGroup=new THREE.Group();this.scene.add(this.chipGroup);this.showColliders=true;this.rebuild();this.resize();
 }
 rebuild(){for(const m of this.chipGroup.children){m.geometry.dispose();m.material.dispose();}this.chipGroup.clear();this.meshes=[];this.outlines=[];
  for(const chip of this.physics.chips){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(chip.vertices.flat(),3));g.setIndex(chip.indices);g.computeVertexNormals();
   const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:chip.color,metalness:0,roughness:.4}));
   const line=new THREE.LineSegments(new THREE.EdgesGeometry(g,15),new THREE.LineBasicMaterial({color:0xdb642e,depthTest:false}));line.renderOrder=10;
   this.chipGroup.add(m,line);this.meshes.push(m);this.outlines.push(line);
  }
 }
 resize(){const r=this.canvas.getBoundingClientRect();this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();}
 render(){this.camera.position.set(this.side?65:0,this.side?-55:0,this.side?55:100);this.camera.lookAt(0,0,4);
  this.physics.poses().forEach((p,i)=>{for(const m of [this.meshes[i],this.outlines[i]]){m.position.set(...p.positionMm);m.quaternion.set(...p.rotation);}this.outlines[i].visible=this.showColliders;});this.renderer.render(this.scene,this.camera);
 }
}
