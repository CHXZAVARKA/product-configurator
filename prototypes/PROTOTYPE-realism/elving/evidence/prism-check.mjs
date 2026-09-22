import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prismFromCAD,tracePrism} from '../prism-view.mjs';
const cad=JSON.parse(readFileSync(new URL('../../../PROTOTYPE-optics/assets/cad.json',import.meta.url))),prism=prismFromCAD(cad);
assert.equal(prism.nearZ,192);assert.equal(prism.farZ,12);assert(prism.eyeZ>208);
assert(prism.planes.every(p=>Math.abs(p.offset-6.13953)<.00002));
assert.deepEqual(tracePrism(prism,0,0).point,[0,0,12]);let maxBounces=0,exits=0;
for(let y=-1;y<=1;y+=.05)for(let x=-1;x<=1;x+=.05){if(x*x+y*y>1)continue;const ray=tracePrism(prism,x,y);assert.equal(ray.status,'exit');assert(Math.abs(ray.point[2]-12)<1e-7);assert(prism.planes.every(p=>p.normal[0]*ray.point[0]+p.normal[1]*ray.point[1]<=p.offset+1e-6));maxBounces=Math.max(maxBounces,ray.bounces);exits++;}
assert(maxBounces>=5);assert(exits>1000);console.log(JSON.stringify({passed:true,prism,exits,maxBounces}));
