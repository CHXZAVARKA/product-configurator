// Check a full horizontal view and redistribution while rolling a horizontal chamber.
// A slow vertical twist may carry the bed with static friction and need not cause slip.
import{readFileSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';
const source=readFileSync(new URL('../model.js',import.meta.url),'utf8').replace("'cannon-es'",JSON.stringify(new URL('../vendor/cannon-es.js',import.meta.url).href)).replace("'rapier'",JSON.stringify(new URL('../vendor/rapier.js',import.meta.url).href));
const{Filling,PHYSICS_HZ}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const f=new Filling(Number(process.argv[2]||96));
function coverage(){const shapes=f.pieces.map(({body})=>body.shapes[0].faceNormals.map((n,i)=>{const normal=body.quaternion.vmult(n),point=body.quaternion.vmult(body.shapes[0].vertices[body.shapes[0].faces[i][0]]).vadd(body.position);return{n:normal,d:normal.dot(point)};}));let total=0,covered=0;for(let ix=-24;ix<=24;ix++)for(let iy=-24;iy<=24;iy++){const x=ix*.05,y=iy*.05;if(-y>.6139528||Math.sqrt(3)/2*x+.5*y>.6139528||-Math.sqrt(3)/2*x+.5*y>.6139528)continue;total++;if(shapes.some(planes=>{let lo=0,hi=1;for(const{n,d}of planes){const z=d-n.x*x-n.y*y;if(Math.abs(n.z)<1e-9){if(z<0)return false;}else if(n.z>0)hi=Math.min(hi,z/n.z);else lo=Math.max(lo,z/n.z);}return hi>=lo;}))covered++;}return +(covered/total).toFixed(3);}
function volume(){let volume=0;for(const{body}of f.pieces){const s=body.shapes[0];for(const face of s.faces)for(let j=1;j<face.length-1;j++)volume+=s.vertices[face[0]].dot(s.vertices[face[j]].cross(s.vertices[face[j+1]]))/6;}return +(volume/(Math.PI*1.88**2)).toFixed(3);}
for(let i=0;i<PHYSICS_HZ*3;i++)f.step();
const before=f.pieces.map(p=>p.body.position.clone());
for(let i=0;i<PHYSICS_HZ;i++){if(i%8===0)f.setOrientation(i/PHYSICS_HZ*120,0);f.step();}
const twistTravel=f.pieces.reduce((sum,p,j)=>sum+p.body.position.distanceTo(before[j])*10,0)/f.pieces.length;
f.setOrientation(0,90);for(let i=0;i<PHYSICS_HZ*4;i++)f.step();
const horizontalBefore=f.pieces.map(p=>p.body.position.clone());
f.setOrientation(120,90);for(let i=0;i<PHYSICS_HZ*3;i++)f.step();
const horizontalTravel=f.pieces.reduce((sum,p,j)=>sum+p.body.position.distanceTo(horizontalBefore[j])*10,0)/f.pieces.length;
const result={meanTravelAfterHorizontalTwistMm:+horizontalTravel.toFixed(3),count:f.pieces.length,volumeFraction:volume(),horizontalTriangleCoverage:coverage(),meanTravelAfterVerticalTwistMm:+twistTravel.toFixed(3),escaped:f.state().escaped,settled:f.settled};f.dispose();console.log(JSON.stringify(result,null,2));writeFileSync(new URL('./pouring-check.json',import.meta.url),JSON.stringify(result,null,2));
assert(result.horizontalTriangleCoverage>.6,'Horizontal view is mostly empty');assert(result.meanTravelAfterHorizontalTwistMm>.5,'Rolling a horizontal chamber does not redistribute the filling');assert.equal(result.escaped,0);
