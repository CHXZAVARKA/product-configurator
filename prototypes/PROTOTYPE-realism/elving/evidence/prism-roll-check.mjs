import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prismFromCAD,tracePrism} from '../prism-view.mjs';
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const prism=prismFromCAD(cad);let tested=0,maxErrorMm=0;
const intersections=[];
for(let i=0;i<prism.planes.length;i++)for(let j=i+1;j<prism.planes.length;j++){
 const a=prism.planes[i],b=prism.planes[j],det=a.normal[0]*b.normal[1]-a.normal[1]*b.normal[0];
 intersections.push([(a.offset*b.normal[1]-a.normal[1]*b.offset)/det,(a.normal[0]*b.offset-a.offset*b.normal[0])/det]);
}
const opticalCenter=intersections.reduce((sum,point)=>sum.map((value,k)=>value+point[k]/intersections.length),[0,0]);
assert(Math.hypot(...opticalCenter)<.01,'CAD mirror prism optical axis must be centred on the viewer');
const centerRay=tracePrism(prism,0,0);assert.equal(centerRay.status,'exit');assert(Math.hypot(centerRay.point[0]-opticalCenter[0],centerRay.point[1]-opticalCenter[1])<.01);
for(const roll of [0,37,90,179,270,359])for(let x=-.8;x<=.8;x+=.2)for(let y=-.8;y<=.8;y+=.2){
 const a=-roll*Math.PI/180,c=Math.cos(a),s=Math.sin(a),base=tracePrism(prism,x,y),rotated=tracePrism(prism,c*x-s*y,s*x+c*y,38,roll);
 assert.equal(rotated.status,base.status);
 if(base.status==='exit'){
  const error=Math.hypot(rotated.point[0]-(c*base.point[0]-s*base.point[1]),rotated.point[1]-(s*base.point[0]+c*base.point[1]));
  // The existing tracer accepts wall hits within 0.0001 mm; at a mirror
  // corner equivalent paths can pick opposite sides of this tolerance.
  assert(error<.0001);maxErrorMm=Math.max(maxErrorMm,error);
  assert.equal(rotated.bounces,base.bounces);tested++;
 }
}
const result={passed:true,rotatedMirrorRays:tested,maxErrorMm,opticalCenterMm:opticalCenter,centerRayExitMm:centerRay.point.slice(0,2)};
fs.writeFileSync(new URL('prism-roll.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result);
