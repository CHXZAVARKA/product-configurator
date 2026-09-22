import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prismFromCAD,tracePrism} from '../prism-view.mjs';
const cad=JSON.parse(fs.readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url)));
const prism=prismFromCAD(cad);let tested=0,maxErrorMm=0;
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
const result={passed:true,rotatedMirrorRays:tested,maxErrorMm};
fs.writeFileSync(new URL('prism-roll.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result);
